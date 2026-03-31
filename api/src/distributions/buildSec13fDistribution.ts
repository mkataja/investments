import type { DistributionPayload } from "@investments/db";
import { fetchOpenFigiMappingsByCusips } from "../import/openFigi.js";
import {
  mapSectorLabelToCanonicalIdWithWarn,
  normalizeRegionWeightsToIsoKeys,
} from "./distributionNormalize.js";
import { parseSec13FInfoTableXml } from "./parseSec13FInfoTableXml.js";
import { filterSec13FRowsByMinFilingWeight } from "./sec13fMaterialRows.js";
import {
  type YahooQuoteSummaryRaw,
  fetchYahooQuoteSummaryRaw,
} from "./yahoo.js";
import { yahooSymbolCandidatesFromCusipFigiRows } from "./yahooSymbolFromOpenFigi.js";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function yahooRefreshGapMs(): number {
  const n = Number.parseInt(process.env.YAHOO_MIN_INTERVAL_MS ?? "900", 10);
  return Number.isFinite(n) && n >= 0 ? n : 900;
}

async function quoteSummaryFirstWorkingSymbol(
  candidates: string[],
): Promise<{ raw: YahooQuoteSummaryRaw; symbol: string } | null> {
  let lastErr: unknown;
  for (const symbol of candidates) {
    try {
      const raw = await fetchYahooQuoteSummaryRaw(symbol);
      return { raw, symbol };
    } catch (e) {
      lastErr = e;
    }
  }
  if (lastErr) {
    console.warn(
      `SEC 13F: could not load Yahoo quoteSummary for any candidate: ${String(lastErr)}`,
    );
  }
  return null;
}

function sectorAndCountryFromYahooRaw(raw: YahooQuoteSummaryRaw): {
  sectorLabel: string | null;
  countryLabel: string | null;
} {
  const asset = raw.assetProfile as
    | { sector?: unknown; country?: unknown }
    | undefined;
  const sector =
    typeof asset?.sector === "string" && asset.sector.trim().length > 0
      ? asset.sector.trim()
      : null;
  const country =
    typeof asset?.country === "string" && asset.country.trim().length > 0
      ? asset.country.trim()
      : null;
  return { sectorLabel: sector, countryLabel: country };
}

/**
 * Value-weighted sector and country mix from a 13F information table XML,
 * resolving each line via OpenFIGI (CUSIP) and Yahoo `assetProfile`.
 */
export async function buildDistributionFromSec13FInfoTableXml(
  xmlText: string,
): Promise<DistributionPayload> {
  const parsed = parseSec13FInfoTableXml(xmlText);
  if (parsed.length === 0) {
    throw new Error(
      "No usable 13F infoTable rows (CUSIP / value / options filter).",
    );
  }

  const rows = filterSec13FRowsByMinFilingWeight(parsed);
  const cusips = [...new Set(rows.map((r) => r.cusip))];
  const figiByCusip = await fetchOpenFigiMappingsByCusips(cusips);

  const gap = yahooRefreshGapMs();
  const profileByCusip = new Map<
    string,
    { sectorLabel: string | null; countryLabel: string | null }
  >();

  for (let i = 0; i < cusips.length; i++) {
    const cusip = cusips[i] ?? "";
    if (i > 0) {
      await sleep(gap);
    }
    const figiRows = figiByCusip.get(cusip) ?? [];
    if (figiRows.length === 0) {
      console.warn(`SEC 13F: OpenFIGI returned no listings for CUSIP ${cusip}`);
      continue;
    }
    const candidates = yahooSymbolCandidatesFromCusipFigiRows(figiRows, cusip);
    if (candidates.length === 0) {
      console.warn(`SEC 13F: no Yahoo symbol candidates for CUSIP ${cusip}`);
      continue;
    }
    const got = await quoteSummaryFirstWorkingSymbol(candidates);
    if (got) {
      profileByCusip.set(cusip, sectorAndCountryFromYahooRaw(got.raw));
    }
  }

  let resolvedValue = 0;
  for (const row of rows) {
    if (profileByCusip.has(row.cusip)) {
      resolvedValue += row.valueRaw;
    }
  }
  if (!(resolvedValue > 0)) {
    throw new Error(
      "Could not resolve any 13F line to Yahoo sector/country (OpenFIGI or Yahoo failure).",
    );
  }

  const sectors: Record<string, number> = {};
  const countries: Record<string, number> = {};

  for (const row of rows) {
    if (!profileByCusip.has(row.cusip)) {
      continue;
    }
    const w = row.valueRaw / resolvedValue;
    const p = profileByCusip.get(row.cusip);
    if (!p) {
      continue;
    }
    if (p.sectorLabel) {
      const sid = mapSectorLabelToCanonicalIdWithWarn(p.sectorLabel);
      sectors[sid] = (sectors[sid] ?? 0) + w;
    }
    if (p.countryLabel) {
      const isoMap = normalizeRegionWeightsToIsoKeys({
        [p.countryLabel]: w,
      });
      for (const [k, v] of Object.entries(isoMap)) {
        countries[k] = (countries[k] ?? 0) + v;
      }
    }
  }

  if (
    Object.keys(sectors).length === 0 &&
    Object.keys(countries).length === 0
  ) {
    throw new Error(
      "13F resolution produced no sector or country weights (Yahoo assetProfile empty).",
    );
  }

  return { countries, sectors };
}
