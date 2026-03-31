import type {
  DistributionPayload,
  DistributionSectorId,
} from "@investments/db";
import {
  isDistributionSectorId,
  normalizeYahooSymbolForStorage,
  resolveRegionKeyToIso,
  seligsonHoldingsResolutionCache,
} from "@investments/db";
import { and, eq, or } from "drizzle-orm";
import { db } from "../db.js";
import {
  type OpenFigiMappingRow,
  fetchOpenFigiMapping,
  yahooSymbolCandidatesFromOpenFigiRows,
} from "../import/openFigi.js";
import { yahooFinance } from "../lib/yahooClient.js";
import { mapSectorLabelToCanonicalIdWithWarn } from "./distributionNormalize.js";
import { SELIGSON_FINNISH_SECTOR_LABEL_MAP } from "./sectorMapping.js";
import {
  type SeligsonHoldingsRow,
  type SeligsonResolutionCacheKey,
  buildSeligsonResolutionCacheKey,
  isCashHoldingsRow,
  parseSeligsonHoldingsRows,
  serializeSeligsonResolutionCacheKey,
} from "./seligson.js";
import {
  type YahooQuoteSummaryRaw,
  buildYahooInstrumentLookup,
  displayNameFromYahooLookup,
  extractIsinFromQuoteSummaryRaw,
  fetchYahooQuoteSummaryRaw,
} from "./yahoo.js";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function yahooRefreshGapMs(): number {
  const n = Number.parseInt(process.env.YAHOO_MIN_INTERVAL_MS ?? "900", 10);
  return Number.isFinite(n) && n >= 0 ? n : 900;
}

function sectorFromToimiala(toimialaFi: string): DistributionSectorId {
  const t = toimialaFi.trim();
  return SELIGSON_FINNISH_SECTOR_LABEL_MAP[t] ?? "other";
}

export function normalizeIsin12(
  isin: string | null | undefined,
): string | null {
  if (!isin) {
    return null;
  }
  const n = isin.replace(/\s+/g, "").toUpperCase();
  return /^[A-Z0-9]{12}$/.test(n) ? n : null;
}

function normalizeComparableName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * After punctuation is turned into spaces, Yahoo "S.p.A." / "S.A." becomes `s p a` / `s a`.
 * Collapse those runs so they match Seligson "spa" / "sa".
 */
function collapseSplitLegalAbbrevs(normalized: string): string {
  return normalized
    .replace(/\bs\s+p\s+a\b/g, "spa")
    .replace(/\bs\s+a\b/g, "sa");
}

function stripLeadingThe(normalized: string): string {
  return normalized.replace(/^the\s+/, "");
}

/**
 * Common trailing legal forms on listed names (Yahoo vs Seligson). Best-effort set—extend here
 * rather than special-casing one country in name normalization.
 */
const LEGAL_FORM_SUFFIX_TOKENS = new Set([
  "ab",
  "ag",
  "aktiebolag",
  "aktiengesellschaft",
  "asa",
  "bv",
  "co",
  "company",
  "corp",
  "corporation",
  "europeenne",
  "gmbh",
  "inc",
  "incorporated",
  "kg",
  "kgaa",
  "limited",
  "llp",
  "lp",
  "ltd",
  "nv",
  "oy",
  "oyj",
  "plc",
  "sa",
  "sarl",
  "sas",
  "se",
  "societe",
  "spa",
  "srl",
  "the",
]);

function stripTrailingLegalFormTokens(normalized: string): string {
  const words = normalized.split(" ").filter((w) => w.length > 0);
  while (
    words.length > 0 &&
    LEGAL_FORM_SUFFIX_TOKENS.has(words[words.length - 1] ?? "")
  ) {
    words.pop();
  }
  return words.join(" ");
}

function comparableNameForMatch(raw: string): string {
  return stripTrailingLegalFormTokens(
    stripLeadingThe(collapseSplitLegalAbbrevs(normalizeComparableName(raw))),
  );
}

export function namesMatchSeligsonYahoo(
  seligson: string,
  yahooDisplay: string,
): boolean {
  const a = comparableNameForMatch(seligson);
  const b = comparableNameForMatch(yahooDisplay);
  if (a.length < 3 || b.length < 3) {
    return false;
  }
  return a === b || a.includes(b) || b.includes(a);
}

function sectorLabelFromYahooRaw(raw: YahooQuoteSummaryRaw): string | null {
  const asset = raw.assetProfile as { sector?: unknown } | undefined;
  const s = asset?.sector;
  return typeof s === "string" && s.trim().length > 0 ? s.trim() : null;
}

function verifyYahooMatchesRow(
  raw: YahooQuoteSummaryRaw,
  symbol: string,
  row: SeligsonHoldingsRow,
  expectedIsin: string | null | undefined,
): boolean {
  const lookup = buildYahooInstrumentLookup(raw, symbol);
  const yn = displayNameFromYahooLookup(lookup, symbol);
  if (!namesMatchSeligsonYahoo(row.companyName, yn)) {
    return false;
  }
  if (expectedIsin) {
    const fromQuote = extractIsinFromQuoteSummaryRaw(raw);
    if (fromQuote && fromQuote !== expectedIsin) {
      return false;
    }
  }
  const selIso = resolveRegionKeyToIso(row.countryFi);
  if (!selIso) {
    return true;
  }
  const yahooCountry = lookup.country?.trim();
  if (!yahooCountry) {
    return true;
  }
  const yahooIso = resolveRegionKeyToIso(yahooCountry);
  if (!yahooIso) {
    return true;
  }
  return yahooIso === selIso;
}

type ResolvedSector = {
  sectorId: DistributionSectorId;
  source: "yahoo" | "seligson_fallback";
  yahooSymbol: string | null;
  yahooCompanyName: string | null;
  rawLabel: string | null;
};

function toResolvedFromDbRow(row: {
  sectorCanonicalId: string;
  source: string;
  yahooSymbol: string | null;
  yahooCompanyName: string | null;
  rawSectorLabel: string | null;
}): ResolvedSector {
  const sid = row.sectorCanonicalId;
  if (!isDistributionSectorId(sid)) {
    return {
      sectorId: "other",
      source: row.source === "yahoo" ? "yahoo" : "seligson_fallback",
      yahooSymbol: row.yahooSymbol,
      yahooCompanyName: row.yahooCompanyName,
      rawLabel: row.rawSectorLabel,
    };
  }
  return {
    sectorId: sid,
    source: row.source === "yahoo" ? "yahoo" : "seligson_fallback",
    yahooSymbol: row.yahooSymbol,
    yahooCompanyName: row.yahooCompanyName,
    rawLabel: row.rawSectorLabel,
  };
}

async function yahooSearchSymbolsForCompanyName(
  name: string,
): Promise<string[]> {
  const q = await yahooFinance.search(name, { quotesCount: 24, newsCount: 0 });
  const quotes = q.quotes ?? [];
  const out: string[] = [];
  for (const item of quotes) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const sym = (item as { symbol?: string }).symbol;
    const qt = (item as { quoteType?: string }).quoteType?.toUpperCase();
    if (typeof sym !== "string" || sym.trim().length === 0) {
      continue;
    }
    // Yahoo often omits this flag; only drop rows explicitly marked non-Finance.
    if ((item as { isYahooFinance?: boolean }).isYahooFinance === false) {
      continue;
    }
    if (
      qt === "INDEX" ||
      qt === "CURRENCY" ||
      qt === "OPTION" ||
      qt === "FUTURE" ||
      qt === "CRYPTOCURRENCY"
    ) {
      continue;
    }
    out.push(sym.trim());
  }
  return [...new Set(out.map((s) => s.toLowerCase()))];
}

/**
 * First candidate order wins (search / OpenFIGI order). Requiring exactly one
 * verified match rejected valid names when several listings (e.g. ADS.DE + ADDYY)
 * all matched name + country.
 */
async function quoteSummarySingleVerifiedCandidate(
  candidates: string[],
  row: SeligsonHoldingsRow,
  expectedIsin: string | null | undefined,
): Promise<{ raw: YahooQuoteSummaryRaw; symbol: string } | null> {
  for (const sym of candidates) {
    try {
      const raw = await fetchYahooQuoteSummaryRaw(sym);
      if (verifyYahooMatchesRow(raw, sym, row, expectedIsin)) {
        return { raw, symbol: sym };
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

function yahooDisplayNameFromRaw(
  raw: YahooQuoteSummaryRaw,
  symbol: string,
): string {
  const lookup = buildYahooInstrumentLookup(raw, symbol);
  return displayNameFromYahooLookup(lookup, symbol);
}

function resolvedSectorFromVerifiedQuote(got: {
  raw: YahooQuoteSummaryRaw;
  symbol: string;
}): ResolvedSector | null {
  const label = sectorLabelFromYahooRaw(got.raw);
  if (!label) {
    return null;
  }
  const sectorId = mapSectorLabelToCanonicalIdWithWarn(label);
  return {
    sectorId,
    source: "yahoo",
    yahooSymbol: normalizeYahooSymbolForStorage(got.symbol),
    yahooCompanyName: yahooDisplayNameFromRaw(got.raw, got.symbol),
    rawLabel: label,
  };
}

async function resolveViaYahooForRow(
  row: SeligsonHoldingsRow,
  getFigiRowsForIsin: (isin: string) => Promise<OpenFigiMappingRow[]>,
): Promise<ResolvedSector | null> {
  const isinNormalized = normalizeIsin12(row.isin);
  const expectedIsin = isinNormalized ?? undefined;
  if (row.companyName.trim().length > 0) {
    const searchSyms = await yahooSearchSymbolsForCompanyName(row.companyName);
    if (searchSyms.length > 0) {
      const got = await quoteSummarySingleVerifiedCandidate(
        searchSyms,
        row,
        expectedIsin,
      );
      if (got) {
        const r = resolvedSectorFromVerifiedQuote(got);
        if (r) {
          return r;
        }
      }
    }
  }

  if (!isinNormalized) {
    return null;
  }

  const figiRows = await getFigiRowsForIsin(isinNormalized);
  const candSet = yahooSymbolCandidatesFromOpenFigiRows(
    isinNormalized,
    figiRows,
  );
  const candidates = [...candSet].sort((a, b) => a.localeCompare(b));
  const got = await quoteSummarySingleVerifiedCandidate(
    candidates,
    row,
    expectedIsin,
  );
  if (!got) {
    return null;
  }
  return resolvedSectorFromVerifiedQuote(got);
}

async function upsertResolutionCache(
  key: SeligsonResolutionCacheKey,
  resolved: ResolvedSector,
  fetchedAt: Date,
): Promise<void> {
  await db
    .insert(seligsonHoldingsResolutionCache)
    .values({
      seligsonCompanyName: key.seligsonCompanyName,
      countryIso: key.countryIso,
      yahooSymbol: resolved.yahooSymbol,
      yahooCompanyName: resolved.yahooCompanyName,
      sectorCanonicalId: resolved.sectorId,
      rawSectorLabel: resolved.rawLabel,
      source: resolved.source,
      fetchedAt,
    })
    .onConflictDoUpdate({
      target: [
        seligsonHoldingsResolutionCache.seligsonCompanyName,
        seligsonHoldingsResolutionCache.countryIso,
      ],
      set: {
        yahooSymbol: resolved.yahooSymbol,
        yahooCompanyName: resolved.yahooCompanyName,
        sectorCanonicalId: resolved.sectorId,
        rawSectorLabel: resolved.rawLabel,
        source: resolved.source,
        fetchedAt,
      },
    });
}

/**
 * Value-weighted countries (Seligson Maa) and sectors (Yahoo `assetProfile.sector` when
 * strict resolution succeeds; else Seligson Toimiala).
 */
export async function buildResolvedSeligsonHoldingsPayload(
  holdingsHtml: string,
  fetchedAt: Date,
): Promise<{ payload: DistributionPayload; notes: string[] }> {
  const { rows, notes } = parseSeligsonHoldingsRows(holdingsHtml);

  const countries: Record<string, number> = {};
  const notesOut = [...notes];
  const gapMs = yahooRefreshGapMs();

  let isFirstHttp = true;
  async function beforeHttp(): Promise<void> {
    if (isFirstHttp) {
      isFirstHttp = false;
      return;
    }
    if (gapMs > 0) {
      await sleep(gapMs);
    }
  }

  const nonCashRows = rows.filter((r) => !isCashHoldingsRow(r));
  const uniquePairs: SeligsonResolutionCacheKey[] = [];
  const seenPair = new Set<string>();
  for (const row of nonCashRows) {
    const k = buildSeligsonResolutionCacheKey(row);
    const sk = serializeSeligsonResolutionCacheKey(k);
    if (!seenPair.has(sk)) {
      seenPair.add(sk);
      uniquePairs.push(k);
    }
  }

  const resolutionMap = new Map<string, ResolvedSector>();

  if (uniquePairs.length > 0) {
    const conditions = uniquePairs.map((p) =>
      and(
        eq(
          seligsonHoldingsResolutionCache.seligsonCompanyName,
          p.seligsonCompanyName,
        ),
        eq(seligsonHoldingsResolutionCache.countryIso, p.countryIso),
      ),
    );
    const cached = await db
      .select()
      .from(seligsonHoldingsResolutionCache)
      .where(or(...conditions));
    for (const row of cached) {
      resolutionMap.set(
        serializeSeligsonResolutionCacheKey({
          seligsonCompanyName: row.seligsonCompanyName,
          countryIso: row.countryIso,
        }),
        toResolvedFromDbRow(row),
      );
    }
  }

  const missingPairs = uniquePairs
    .filter((p) => !resolutionMap.has(serializeSeligsonResolutionCacheKey(p)))
    .sort((a, b) => {
      const c = a.seligsonCompanyName.localeCompare(b.seligsonCompanyName);
      return c !== 0 ? c : a.countryIso.localeCompare(b.countryIso);
    });

  const keyToSampleRow = new Map<string, SeligsonHoldingsRow>();
  for (const row of nonCashRows) {
    const k = buildSeligsonResolutionCacheKey(row);
    const sk = serializeSeligsonResolutionCacheKey(k);
    if (!keyToSampleRow.has(sk)) {
      keyToSampleRow.set(sk, row);
    }
  }

  const figiByIsin = new Map<string, OpenFigiMappingRow[]>();
  async function getFigiRowsForIsin(
    isin: string,
  ): Promise<OpenFigiMappingRow[]> {
    const normalized = normalizeIsin12(isin);
    if (!normalized) {
      return [];
    }
    const cached = figiByIsin.get(normalized);
    if (cached) {
      return cached;
    }
    await beforeHttp();
    const rows = await fetchOpenFigiMapping(normalized);
    figiByIsin.set(normalized, rows);
    return rows;
  }

  for (const p of missingPairs) {
    await beforeHttp();
    const row = keyToSampleRow.get(serializeSeligsonResolutionCacheKey(p));
    if (!row) {
      continue;
    }

    let resolved: ResolvedSector | null = await resolveViaYahooForRow(
      row,
      getFigiRowsForIsin,
    );

    if (!resolved) {
      const tid = sectorFromToimiala(row.toimialaFi);
      resolved = {
        sectorId: tid,
        source: "seligson_fallback",
        yahooSymbol: null,
        yahooCompanyName: null,
        rawLabel: row.toimialaFi.trim() || null,
      };
    }

    await upsertResolutionCache(p, resolved, fetchedAt);
    resolutionMap.set(serializeSeligsonResolutionCacheKey(p), resolved);
  }

  const sectors: Record<string, number> = {};

  for (const row of rows) {
    const w = row.weight;
    if (isCashHoldingsRow(row)) {
      sectors.cash = (sectors.cash ?? 0) + w;
      continue;
    }

    const iso = resolveRegionKeyToIso(row.countryFi);
    if (!iso) {
      notesOut.push(
        `Unknown Seligson country label: ${row.countryFi} (${row.companyName})`,
      );
    } else {
      countries[iso] = (countries[iso] ?? 0) + w;
    }

    const lk = buildSeligsonResolutionCacheKey(row);
    const res = resolutionMap.get(serializeSeligsonResolutionCacheKey(lk));
    if (!res) {
      const tid = sectorFromToimiala(row.toimialaFi);
      sectors[tid] = (sectors[tid] ?? 0) + w;
      continue;
    }
    sectors[res.sectorId] = (sectors[res.sectorId] ?? 0) + w;
  }

  return {
    payload: { countries, sectors },
    notes: notesOut,
  };
}
