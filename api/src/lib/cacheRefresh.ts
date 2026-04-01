import {
  distributions,
  instrumentCompositeConstituents,
  instruments,
  prices,
  providerHoldingsCache,
  seligsonDistributionCache,
  seligsonFunds,
  yahooFinanceCache,
} from "@investments/db";
import {
  type DistributionPayload,
  MIN_PORTFOLIO_ALLOCATION_FRACTION,
  compositePseudoKeyToSyntheticPayload,
  isCompositePseudoKey,
  normLabel,
  normalizeIsinForStorage,
  parseVanguardUkProfessionalHoldingsPortId,
  resolveRegionKeyToIso,
  validateHoldingsDistributionUrl,
  validateProviderBreakdownDataUrl,
} from "@investments/lib";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "../db.js";
import { buildDistributionFromSec13FInfoTableXml } from "../distributions/buildSec13fDistribution.js";
import { fetchJpmProductDataJson } from "../distributions/fetchJpmProductData.js";
import { fetchProviderHoldingsBytes } from "../distributions/fetchProviderHoldings.js";
import { fetchVanguardUkGpxHoldings } from "../distributions/fetchVanguardUkGpxHoldings.js";
import { parseIsharesHoldingsCsv } from "../distributions/parseIsharesHoldingsCsv.js";
import {
  parseJpmHoldingsXlsx,
  parseJpmHoldingsXlsxCountriesAndCashWeight,
} from "../distributions/parseJpmHoldingsXlsx.js";
import { parseJpmProductDataSectorBreakdown } from "../distributions/parseJpmProductDataSectorBreakdown.js";
import { parseSsgaHoldingsXlsx } from "../distributions/parseSsgaHoldingsXlsx.js";
import { parseVanguardUkGpxHoldingsJson } from "../distributions/parseVanguardUkGpxHoldings.js";
import { parseXtrackersHoldingsXlsx } from "../distributions/parseXtrackersHoldingsXlsx.js";
import {
  assertProviderDocumentMatchesInstrument,
  extractHoldingsUrlIdentifiers,
  extractJpmProductDataUrlIdentifiers,
  extractJpmXlsxMetadataIdentifiers,
  extractSsgaXlsxMetadataIdentifiers,
  mergeProviderDocumentIdentifiers,
  vanguardIdentifiersFromFundName,
} from "../distributions/providerDocumentIdentity.js";
import { roundWeights } from "../distributions/roundWeights.js";
import {
  SELIGSON_BOND_ALLOCATION_VIEW,
  SELIGSON_BOND_COUNTRY_VIEW,
  SELIGSON_HOLDINGS_VIEW,
  SELIGSON_RESOLUTION_UNKNOWN_COUNTRY_ISO,
  fetchSeligsonHtml,
  isSeligsonBondAllocationPage,
  parseSeligsonBondFundDistributions,
  parseSeligsonFundName,
  stripSeligsonFundViewerTitleSuffix,
} from "../distributions/seligson.js";
import { upsertSeligsonFundValuesFromPage } from "../distributions/seligsonFundValues.js";
import { buildResolvedSeligsonHoldingsPayload } from "../distributions/seligsonHoldingsResolve.js";
import type { YahooQuoteSummaryRaw } from "../distributions/yahoo.js";
import {
  extractIsinFromQuoteSummaryRaw,
  extractYahooPriceFromQuoteSummaryRaw,
  fetchYahooQuoteSummaryRaw,
  normalizeYahooDistribution,
} from "../distributions/yahoo.js";
import { mergeCompositeDistributionPayload } from "./compositeDistribution.js";
import { loadOpenPositionsAggregateForUser } from "./positions.js";
import { sectorRefreshStorage } from "./sectorRefreshContext.js";
import { formatYahooUpstreamError } from "./yahooUpstream.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function yahooRefreshGapMs(): number {
  const n = Number.parseInt(process.env.YAHOO_MIN_INTERVAL_MS ?? "900", 10);
  return Number.isFinite(n) && n >= 0 ? n : 900;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Same unmapped vs ISO rules as `aggregateRegionsToGeoBuckets`; ZZ tracked separately (maps to EM, not unknown bucket). */
function collectUnknownCountryIssueParts(
  countries: Record<string, number> | undefined,
): string[] {
  if (!countries) {
    return [];
  }
  const zz = SELIGSON_RESOLUTION_UNKNOWN_COUNTRY_ISO;
  const parts: string[] = [];
  for (const [rawKey, w] of Object.entries(countries)) {
    if (
      typeof w !== "number" ||
      !Number.isFinite(w) ||
      w < MIN_PORTFOLIO_ALLOCATION_FRACTION
    ) {
      continue;
    }
    const key = rawKey.trim();
    if (normLabel(key) === "european union") {
      continue;
    }
    const iso = resolveRegionKeyToIso(key);
    const pct = `${(w * 100).toFixed(2)}%`;
    if (iso === zz) {
      parts.push(`${JSON.stringify(rawKey)} ${pct} (${zz} unmapped country)`);
      continue;
    }
    if (iso) {
      continue;
    }
    parts.push(`${JSON.stringify(rawKey)} ${pct} (no ISO mapping)`);
  }
  return parts;
}

async function warnIfRefreshedDistributionHasUnknownCountry(
  instrumentId: number,
  displayName: string,
): Promise<void> {
  const [row] = await db
    .select({ payload: distributions.payload })
    .from(distributions)
    .where(eq(distributions.instrumentId, instrumentId));
  const countries = row?.payload?.countries;
  const detailParts = collectUnknownCountryIssueParts(countries);
  if (detailParts.length === 0) {
    return;
  }
  console.warn(
    `[refresh-distribution] Instrument id=${instrumentId} (${displayName}) has unknown or unmapped country weight: ${detailParts.join("; ")}`,
  );
}

async function maybeBackfillInstrumentIsinFromYahooRaw(
  instrumentId: number,
  raw: YahooQuoteSummaryRaw,
  existingIsin: string | null | undefined,
): Promise<void> {
  if (normalizeIsinForStorage(existingIsin ?? null)) {
    return;
  }
  const fromYahoo = extractIsinFromQuoteSummaryRaw(raw);
  if (!fromYahoo) {
    return;
  }
  await db
    .update(instruments)
    .set({ isin: fromYahoo })
    .where(eq(instruments.id, instrumentId));
}

/** JSON-safe clone for `jsonb` (drops non-JSON values from Yahoo responses). */
function jsonCloneForStorage<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export async function writeYahooDistributionCache(
  instrumentId: number,
  raw: YahooQuoteSummaryRaw,
  symbol: string,
  fetchedAt: Date = new Date(),
  existingInstrumentIsin?: string | null,
): Promise<void> {
  const { payload: rawPayload } = normalizeYahooDistribution(raw, symbol);
  const payload = {
    countries: roundWeights(rawPayload.countries),
    sectors: roundWeights(rawPayload.sectors),
  };
  const rawJson = jsonCloneForStorage(raw);
  const priceExtract = extractYahooPriceFromQuoteSummaryRaw(raw);

  await db.transaction(async (tx) => {
    await tx
      .insert(yahooFinanceCache)
      .values({
        instrumentId,
        fetchedAt,
        raw: rawJson,
      })
      .onConflictDoUpdate({
        target: yahooFinanceCache.instrumentId,
        set: {
          fetchedAt,
          raw: rawJson,
        },
      });
    await tx
      .delete(seligsonDistributionCache)
      .where(eq(seligsonDistributionCache.instrumentId, instrumentId));
    await tx
      .insert(distributions)
      .values({
        instrumentId,
        fetchedAt,
        source: "yahoo",
        payload,
      })
      .onConflictDoUpdate({
        target: distributions.instrumentId,
        set: {
          fetchedAt,
          source: "yahoo",
          payload,
        },
      });
    if (priceExtract) {
      await tx
        .insert(prices)
        .values({
          instrumentId,
          quotedPrice: String(priceExtract.price),
          currency: priceExtract.currency,
          fetchedAt,
          source: "yahoo_quote_summary",
        })
        .onConflictDoUpdate({
          target: prices.instrumentId,
          set: {
            quotedPrice: String(priceExtract.price),
            currency: priceExtract.currency,
            fetchedAt,
            source: "yahoo_quote_summary",
          },
        });
    }
  });

  await maybeBackfillInstrumentIsinFromYahooRaw(
    instrumentId,
    raw,
    existingInstrumentIsin,
  );
}

export async function upsertYahooPriceFromQuoteSummaryRaw(
  instrumentId: number,
  raw: YahooQuoteSummaryRaw,
  fetchedAt: Date = new Date(),
  existingInstrumentIsin?: string | null,
): Promise<void> {
  const priceExtract = extractYahooPriceFromQuoteSummaryRaw(raw);
  if (priceExtract) {
    await db
      .insert(prices)
      .values({
        instrumentId,
        quotedPrice: String(priceExtract.price),
        currency: priceExtract.currency,
        fetchedAt,
        source: "yahoo_quote_summary",
      })
      .onConflictDoUpdate({
        target: prices.instrumentId,
        set: {
          quotedPrice: String(priceExtract.price),
          currency: priceExtract.currency,
          fetchedAt,
          source: "yahoo_quote_summary",
        },
      });
  }
  await maybeBackfillInstrumentIsinFromYahooRaw(
    instrumentId,
    raw,
    existingInstrumentIsin,
  );
}

export async function writeProviderHoldingsDistributionCache(
  instrumentId: number,
  url: string,
  fetchedAt: Date = new Date(),
  options?: { providerBreakdownDataUrl?: string | null },
): Promise<void> {
  const v = validateHoldingsDistributionUrl(url);
  if (!v.ok || !v.normalized || !v.provider) {
    throw new Error(v.ok ? "Holdings URL is missing or invalid" : v.message);
  }

  const [instrumentRow] = await db
    .select({
      displayName: instruments.displayName,
      yahooSymbol: instruments.yahooSymbol,
      isin: instruments.isin,
    })
    .from(instruments)
    .where(eq(instruments.id, instrumentId))
    .limit(1);
  if (!instrumentRow) {
    throw new Error("Instrument not found");
  }
  const matchFields = {
    displayName: instrumentRow.displayName,
    yahooSymbol: instrumentRow.yahooSymbol,
    isin: instrumentRow.isin,
  };

  let payload: {
    countries: Record<string, number>;
    sectors: Record<string, number>;
  };
  let source: string;
  let raw: string;

  if (v.provider === "vanguard_uk_gpx") {
    const portId = parseVanguardUkProfessionalHoldingsPortId(v.normalized);
    if (!portId) {
      throw new Error("Invalid Vanguard UK professional product URL");
    }
    const { items, snapshot, fundFullName } =
      await fetchVanguardUkGpxHoldings(portId);
    assertProviderDocumentMatchesInstrument(
      matchFields,
      mergeProviderDocumentIdentifiers(
        extractHoldingsUrlIdentifiers(v.normalized, "vanguard_uk_gpx"),
        vanguardIdentifiersFromFundName(fundFullName),
      ),
    );
    payload = parseVanguardUkGpxHoldingsJson(items);
    source = "vanguard_uk_gpx";
    raw = JSON.stringify(snapshot);
  } else {
    const bytes = await fetchProviderHoldingsBytes(v.normalized);

    if (v.provider === "ishares_csv") {
      const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      payload = parseIsharesHoldingsCsv(text);
      source = "ishares_holdings_csv";
      raw = text;
    } else if (v.provider === "sec_13f_xml") {
      const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      assertProviderDocumentMatchesInstrument(
        matchFields,
        mergeProviderDocumentIdentifiers(
          extractHoldingsUrlIdentifiers(v.normalized, "sec_13f_xml"),
        ),
      );
      payload = await buildDistributionFromSec13FInfoTableXml(text);
      source = "sec_13f_infotable_xml";
      raw = text;
    } else if (v.provider === "xtrackers_xlsx") {
      payload = parseXtrackersHoldingsXlsx(bytes);
      source = "xtrackers_holdings_xlsx";
      raw = Buffer.from(bytes).toString("base64");
    } else if (v.provider === "jpm_xlsx") {
      raw = Buffer.from(bytes).toString("base64");
      const breakdownRaw = options?.providerBreakdownDataUrl?.trim();
      let breakdownNormalized: string | null = null;
      if (breakdownRaw) {
        const bv = validateProviderBreakdownDataUrl(breakdownRaw);
        if (!bv.ok || !bv.normalized) {
          throw new Error(
            bv.ok ? "Invalid provider breakdown URL" : bv.message,
          );
        }
        breakdownNormalized = bv.normalized;
      }
      const jpmIdParts = [
        extractHoldingsUrlIdentifiers(v.normalized, "jpm_xlsx"),
        extractJpmXlsxMetadataIdentifiers(bytes),
      ];
      if (breakdownNormalized) {
        jpmIdParts.push(
          extractJpmProductDataUrlIdentifiers(breakdownNormalized),
        );
      }
      assertProviderDocumentMatchesInstrument(
        matchFields,
        mergeProviderDocumentIdentifiers(...jpmIdParts),
      );
      if (breakdownNormalized) {
        const json = await fetchJpmProductDataJson(breakdownNormalized);
        const sectorsFromApi = parseJpmProductDataSectorBreakdown(json);
        const { countries, cashWeight: cashW } =
          parseJpmHoldingsXlsxCountriesAndCashWeight(bytes);
        const sectors = { ...sectorsFromApi };
        if (cashW > 0) {
          sectors.cash = (sectors.cash ?? 0) + cashW;
        }
        payload = { countries, sectors };
        source = "jpm_holdings_xlsx";
      } else {
        payload = parseJpmHoldingsXlsx(bytes);
        source = "jpm_holdings_xlsx";
      }
    } else {
      assertProviderDocumentMatchesInstrument(
        matchFields,
        mergeProviderDocumentIdentifiers(
          extractHoldingsUrlIdentifiers(v.normalized, "ssga_xlsx"),
          extractSsgaXlsxMetadataIdentifiers(bytes),
        ),
      );
      payload = parseSsgaHoldingsXlsx(bytes);
      source = "ssga_holdings_xlsx";
      raw = Buffer.from(bytes).toString("base64");
    }
  }

  const rounded = {
    countries: roundWeights(payload.countries),
    sectors: roundWeights(payload.sectors),
  };

  await db.transaction(async (tx) => {
    await tx
      .insert(providerHoldingsCache)
      .values({
        instrumentId,
        fetchedAt,
        source,
        raw,
      })
      .onConflictDoUpdate({
        target: providerHoldingsCache.instrumentId,
        set: {
          fetchedAt,
          source,
          raw,
        },
      });
    await tx
      .delete(yahooFinanceCache)
      .where(eq(yahooFinanceCache.instrumentId, instrumentId));
    await tx
      .insert(distributions)
      .values({
        instrumentId,
        fetchedAt,
        source,
        payload: rounded,
      })
      .onConflictDoUpdate({
        target: distributions.instrumentId,
        set: {
          fetchedAt,
          source,
          payload: rounded,
        },
      });
  });
}

/** Updates `seligson_funds.name` from FundViewer HTML and syncs matching `instruments.display_name`. */
async function updateSeligsonFundNameFromViewerHtml(
  fid: number,
  ...htmlParts: string[]
): Promise<void> {
  const [existing] = await db
    .select()
    .from(seligsonFunds)
    .where(eq(seligsonFunds.fid, fid))
    .limit(1);
  if (!existing) {
    return;
  }
  let name: string | null = null;
  for (const html of htmlParts) {
    name = parseSeligsonFundName(html);
    if (name) {
      break;
    }
  }
  if (!name) {
    return;
  }
  const previousFundName = existing.name;
  if (name !== previousFundName) {
    await db
      .update(seligsonFunds)
      .set({ name })
      .where(eq(seligsonFunds.fid, fid));
  }
  const linked = await db
    .select({ id: instruments.id, displayName: instruments.displayName })
    .from(instruments)
    .where(eq(instruments.seligsonFundId, existing.id));
  for (const row of linked) {
    const mirrorsFundRow = row.displayName === previousFundName;
    const mirrorsParsedTitle =
      stripSeligsonFundViewerTitleSuffix(row.displayName) === name;
    if ((mirrorsFundRow || mirrorsParsedTitle) && row.displayName !== name) {
      await db
        .update(instruments)
        .set({ displayName: name })
        .where(eq(instruments.id, row.id));
    }
  }
}

export async function instrumentHasCompositeConstituents(
  instrumentId: number,
): Promise<boolean> {
  const [r] = await db
    .select({ id: instrumentCompositeConstituents.id })
    .from(instrumentCompositeConstituents)
    .where(eq(instrumentCompositeConstituents.parentInstrumentId, instrumentId))
    .limit(1);
  return r != null;
}

/**
 * Writes `distributions` from weighted constituent payloads (and pseudo unknown slices).
 * Clears Seligson FundViewer HTML cache for this instrument so stale scrape data is not shown.
 */
export async function writeCompositeDistributionCache(
  instrumentId: number,
  fetchedAt: Date = new Date(),
): Promise<void> {
  const rows = await db
    .select()
    .from(instrumentCompositeConstituents)
    .where(eq(instrumentCompositeConstituents.parentInstrumentId, instrumentId))
    .orderBy(asc(instrumentCompositeConstituents.sortOrder));

  if (rows.length === 0) {
    throw new Error("No composite constituents for instrument");
  }

  const items: Array<{ weight: number; payload: DistributionPayload | null }> =
    [];
  for (const row of rows) {
    const w = Number.parseFloat(String(row.weight));
    if (!Number.isFinite(w) || w <= 0) {
      continue;
    }
    if (row.pseudoKey) {
      if (!isCompositePseudoKey(row.pseudoKey)) {
        throw new Error(`Invalid composite pseudo_key: ${row.pseudoKey}`);
      }
      items.push({
        weight: w,
        payload: compositePseudoKeyToSyntheticPayload(row.pseudoKey),
      });
      continue;
    }
    if (row.targetInstrumentId != null) {
      const [dist] = await db
        .select()
        .from(distributions)
        .where(eq(distributions.instrumentId, row.targetInstrumentId));
      const payload = (dist?.payload as DistributionPayload | undefined) ?? {
        countries: {},
        sectors: {},
      };
      items.push({ weight: w, payload });
    }
  }

  if (items.length === 0) {
    throw new Error("No valid composite constituent rows");
  }

  const sumW = items.reduce((s, it) => s + it.weight, 0);
  if (sumW >= MIN_PORTFOLIO_ALLOCATION_FRACTION) {
    for (const it of items) {
      it.weight /= sumW;
    }
  }

  const payload = mergeCompositeDistributionPayload(items);

  await db.transaction(async (tx) => {
    await tx
      .delete(seligsonDistributionCache)
      .where(eq(seligsonDistributionCache.instrumentId, instrumentId));
    await tx
      .delete(yahooFinanceCache)
      .where(eq(yahooFinanceCache.instrumentId, instrumentId));
    await tx
      .insert(distributions)
      .values({
        instrumentId,
        fetchedAt,
        source: "composite",
        payload,
      })
      .onConflictDoUpdate({
        target: distributions.instrumentId,
        set: {
          fetchedAt,
          source: "composite",
          payload,
        },
      });
  });
}

export async function writeSeligsonDistributionCache(
  instrumentId: number,
  fid: number,
  fetchedAt: Date = new Date(),
): Promise<void> {
  const allocationHtml = await fetchSeligsonHtml(
    fid,
    SELIGSON_BOND_ALLOCATION_VIEW,
  );
  let payload: {
    countries: Record<string, number>;
    sectors: Record<string, number>;
  };

  if (isSeligsonBondAllocationPage(allocationHtml)) {
    const countryHtml = await fetchSeligsonHtml(
      fid,
      SELIGSON_BOND_COUNTRY_VIEW,
    );
    const { payload: rawPayload } = parseSeligsonBondFundDistributions(
      allocationHtml,
      countryHtml,
    );
    payload = {
      countries: roundWeights(rawPayload.countries),
      sectors: roundWeights(rawPayload.sectors),
    };
    await db.transaction(async (tx) => {
      await tx
        .insert(seligsonDistributionCache)
        .values({
          instrumentId,
          fetchedAt,
          holdingsHtml: null,
          allocationHtml,
          countryHtml,
        })
        .onConflictDoUpdate({
          target: seligsonDistributionCache.instrumentId,
          set: {
            fetchedAt,
            holdingsHtml: null,
            allocationHtml,
            countryHtml,
          },
        });
      await tx
        .delete(yahooFinanceCache)
        .where(eq(yahooFinanceCache.instrumentId, instrumentId));
      await tx
        .insert(distributions)
        .values({
          instrumentId,
          fetchedAt,
          source: "seligson_scrape",
          payload,
        })
        .onConflictDoUpdate({
          target: distributions.instrumentId,
          set: {
            fetchedAt,
            source: "seligson_scrape",
            payload,
          },
        });
    });
    await updateSeligsonFundNameFromViewerHtml(
      fid,
      allocationHtml,
      countryHtml,
    );
    await upsertSeligsonFundValuesFromPage(db, fetchedAt);
    return;
  }

  const holdingsHtml = await fetchSeligsonHtml(fid, SELIGSON_HOLDINGS_VIEW);
  const { payload: rawPayload } = await buildResolvedSeligsonHoldingsPayload(
    holdingsHtml,
    fetchedAt,
  );
  payload = {
    countries: roundWeights(rawPayload.countries),
    sectors: roundWeights(rawPayload.sectors),
  };

  await db.transaction(async (tx) => {
    await tx
      .insert(seligsonDistributionCache)
      .values({
        instrumentId,
        fetchedAt,
        holdingsHtml,
        allocationHtml: null,
        countryHtml: null,
      })
      .onConflictDoUpdate({
        target: seligsonDistributionCache.instrumentId,
        set: {
          fetchedAt,
          holdingsHtml,
          allocationHtml: null,
          countryHtml: null,
        },
      });
    await tx
      .delete(yahooFinanceCache)
      .where(eq(yahooFinanceCache.instrumentId, instrumentId));
    await tx
      .insert(distributions)
      .values({
        instrumentId,
        fetchedAt,
        source: "seligson_scrape",
        payload,
      })
      .onConflictDoUpdate({
        target: distributions.instrumentId,
        set: {
          fetchedAt,
          source: "seligson_scrape",
          payload,
        },
      });
  });

  await updateSeligsonFundNameFromViewerHtml(fid, holdingsHtml);
  await upsertSeligsonFundValuesFromPage(db, fetchedAt);
}

export type RefreshDistributionResult =
  | { ok: true }
  | { skipped: true; reason: "not_found" | "cash_account" | "manual" }
  | { error: string; status: 503 | 502 };

export async function refreshDistributionCacheForInstrumentId(
  instrumentId: number,
): Promise<RefreshDistributionResult> {
  const [inst] = await db
    .select()
    .from(instruments)
    .where(eq(instruments.id, instrumentId));
  if (!inst) {
    return { skipped: true, reason: "not_found" };
  }
  if (inst.kind === "cash_account") {
    return { skipped: true, reason: "cash_account" };
  }

  const [distRow] = await db
    .select()
    .from(distributions)
    .where(eq(distributions.instrumentId, instrumentId));
  if (distRow?.source === "manual") {
    return { skipped: true, reason: "manual" };
  }

  const now = new Date();

  try {
    return await sectorRefreshStorage.run(
      { instrumentId, displayName: inst.displayName },
      async () => {
        if (await instrumentHasCompositeConstituents(instrumentId)) {
          await writeCompositeDistributionCache(instrumentId, now);
          await warnIfRefreshedDistributionHasUnknownCountry(
            instrumentId,
            inst.displayName,
          );
          return { ok: true };
        }

        if (inst.kind === "custom" && inst.seligsonFundId) {
          const [sf] = await db
            .select()
            .from(seligsonFunds)
            .where(eq(seligsonFunds.id, inst.seligsonFundId));
          if (!sf) {
            return { error: "Seligson fund row missing", status: 502 };
          }
          await writeSeligsonDistributionCache(inst.id, sf.fid, now);
          await warnIfRefreshedDistributionHasUnknownCountry(
            instrumentId,
            inst.displayName,
          );
          return { ok: true };
        }

        if (inst.kind === "etf" || inst.kind === "stock") {
          const holdingsUrl = inst.holdingsDistributionUrl?.trim();
          if (holdingsUrl) {
            const validated = validateHoldingsDistributionUrl(holdingsUrl);
            if (!validated.ok || !validated.normalized) {
              return {
                error: validated.ok
                  ? "Invalid holdings URL"
                  : validated.message,
                status: 502,
              };
            }
            await writeProviderHoldingsDistributionCache(
              inst.id,
              validated.normalized,
              now,
              { providerBreakdownDataUrl: inst.providerBreakdownDataUrl },
            );
            if (inst.yahooSymbol) {
              const raw = await fetchYahooQuoteSummaryRaw(inst.yahooSymbol);
              await upsertYahooPriceFromQuoteSummaryRaw(
                inst.id,
                raw,
                now,
                inst.isin,
              );
            }
            await warnIfRefreshedDistributionHasUnknownCountry(
              instrumentId,
              inst.displayName,
            );
            return { ok: true };
          }
          if (inst.yahooSymbol) {
            const raw = await fetchYahooQuoteSummaryRaw(inst.yahooSymbol);
            await writeYahooDistributionCache(
              inst.id,
              raw,
              inst.yahooSymbol,
              now,
              inst.isin,
            );
            await warnIfRefreshedDistributionHasUnknownCountry(
              instrumentId,
              inst.displayName,
            );
            return { ok: true };
          }
          return {
            error: "Instrument has no external distribution source",
            status: 502,
          };
        }

        return {
          error: "Instrument has no external distribution source",
          status: 502,
        };
      },
    );
  } catch (e) {
    const { message, status } = formatYahooUpstreamError(e);
    return { error: message, status };
  }
}

export async function refreshStaleDistributionCaches(): Promise<void> {
  const positions = await loadOpenPositionsAggregateForUser();
  if (positions.length === 0) {
    return;
  }
  const ids = positions.map((p) => p.instrumentId);
  const instRows = await db
    .select()
    .from(instruments)
    .where(inArray(instruments.id, ids));

  const now = new Date();
  const staleBefore = new Date(now.getTime() - DAY_MS);
  const gapMs = yahooRefreshGapMs();
  let yahooRefreshIndex = 0;

  for (const inst of instRows) {
    if (inst.kind === "cash_account") {
      continue;
    }

    const [cached] = await db
      .select()
      .from(distributions)
      .where(eq(distributions.instrumentId, inst.id));

    if (cached?.source === "manual") {
      continue;
    }

    const needs = !cached || new Date(cached.fetchedAt) < staleBefore;

    if (!needs) {
      continue;
    }

    try {
      if (await instrumentHasCompositeConstituents(inst.id)) {
        await writeCompositeDistributionCache(inst.id, now);
        continue;
      }

      if (inst.kind === "custom" && inst.seligsonFundId) {
        const [sf] = await db
          .select()
          .from(seligsonFunds)
          .where(eq(seligsonFunds.id, inst.seligsonFundId));
        if (!sf) {
          continue;
        }
        await writeSeligsonDistributionCache(inst.id, sf.fid, now);
        continue;
      }

      if (inst.kind === "etf" || inst.kind === "stock") {
        const holdingsUrl = inst.holdingsDistributionUrl?.trim();
        if (holdingsUrl) {
          const validated = validateHoldingsDistributionUrl(holdingsUrl);
          if (!validated.ok || !validated.normalized) {
            continue;
          }
          await writeProviderHoldingsDistributionCache(
            inst.id,
            validated.normalized,
            now,
            { providerBreakdownDataUrl: inst.providerBreakdownDataUrl },
          );
          if (inst.yahooSymbol) {
            yahooRefreshIndex++;
            if (yahooRefreshIndex > 1 && gapMs > 0) {
              await sleep(gapMs);
            }
            const raw = await fetchYahooQuoteSummaryRaw(inst.yahooSymbol);
            await upsertYahooPriceFromQuoteSummaryRaw(
              inst.id,
              raw,
              now,
              inst.isin,
            );
          }
          continue;
        }
        if (inst.yahooSymbol) {
          yahooRefreshIndex++;
          if (yahooRefreshIndex > 1 && gapMs > 0) {
            await sleep(gapMs);
          }
          const raw = await fetchYahooQuoteSummaryRaw(inst.yahooSymbol);
          await writeYahooDistributionCache(
            inst.id,
            raw,
            inst.yahooSymbol,
            now,
            inst.isin,
          );
        }
      }
    } catch (e) {
      console.error(`distribution refresh failed for instrument ${inst.id}`, e);
    }
  }
}
