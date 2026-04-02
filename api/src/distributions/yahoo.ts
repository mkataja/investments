import type { DistributionPayload } from "@investments/lib/distributionPayload";
import { normalizeIsinForStorage } from "@investments/lib/isin";
import type { QuoteSummaryResult } from "yahoo-finance2/modules/quoteSummary-iface";
import { calendarDateUtcFromInstant } from "../lib/calendarDateUtc.js";
import { yahooFinance } from "../lib/yahooClient.js";
import {
  acquireYahooIntervalSlot,
  withYahooRetries,
} from "../service/yahoo/yahooUpstream.js";
import {
  mapSectorLabelToCanonicalIdWithWarn,
  normalizeRegionWeightsToIsoKeys,
} from "./distributionNormalize.js";
import { mergeYahooWeightRows } from "./types.js";

function mapSectorWeightsToCanonical(
  sectors: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, w] of Object.entries(sectors)) {
    const id = mapSectorLabelToCanonicalIdWithWarn(k);
    out[id] = (out[id] ?? 0) + w;
  }
  return out;
}

const MODULES = [
  "topHoldings",
  "fundProfile",
  "assetProfile",
  "summaryDetail",
  "quoteType",
  "price",
] as const;

export type YahooQuoteSummaryRaw = QuoteSummaryResult;

export async function fetchYahooQuoteSummaryRaw(
  symbol: string,
): Promise<YahooQuoteSummaryRaw> {
  await acquireYahooIntervalSlot();
  return withYahooRetries(() =>
    yahooFinance.quoteSummary(symbol, { modules: [...MODULES] }),
  );
}

export type YahooInstrumentLookup = {
  symbol: string;
  shortName: string | null;
  longName: string | null;
  isin: string | null;
  sector: string | null;
  industry: string | null;
  country: string | null;
  quoteType: string | null;
};

/**
 * Yahoo puts ISIN on `assetProfile` for many listings; some ETFs expose it on
 * other `quoteSummary` modules. Coalesce and normalize.
 */
export function extractIsinFromQuoteSummaryRaw(
  raw: YahooQuoteSummaryRaw,
): string | null {
  const blocks: unknown[] = [
    raw.assetProfile,
    raw.fundProfile,
    raw.quoteType,
    raw.price,
    raw.summaryDetail,
  ];
  for (const b of blocks) {
    if (b && typeof b === "object" && "isin" in b) {
      const v = (b as { isin?: unknown }).isin;
      if (typeof v === "string") {
        const n = normalizeIsinForStorage(v);
        if (n) {
          return n;
        }
      }
    }
  }
  return null;
}

export function buildYahooInstrumentLookup(
  raw: YahooQuoteSummaryRaw,
  symbol: string,
): YahooInstrumentLookup {
  const asset = raw.assetProfile;
  const price = raw.price;
  const shortName =
    typeof price?.shortName === "string" ? price.shortName : null;
  const longNameFromPrice =
    typeof price?.longName === "string" ? price.longName : null;
  const longNameFromAsset =
    typeof asset?.longName === "string" ? asset.longName : null;
  const longName = longNameFromPrice ?? longNameFromAsset;
  return {
    symbol,
    shortName,
    longName,
    isin: extractIsinFromQuoteSummaryRaw(raw),
    sector: typeof asset?.sector === "string" ? asset.sector : null,
    industry: typeof asset?.industry === "string" ? asset.industry : null,
    country: typeof asset?.country === "string" ? asset.country : null,
    quoteType: typeof price?.quoteType === "string" ? price.quoteType : null,
  };
}

export function displayNameFromYahooLookup(
  lookup: YahooInstrumentLookup,
  symbol: string,
): string {
  const a = lookup.longName?.trim();
  const b = lookup.shortName?.trim();
  return (a || b || symbol).trim();
}

/**
 * Map Yahoo `quoteSummary.price.marketState` to stored `prices.price_type`.
 * `REGULAR` is the live regular session; other states use the last regular price
 * (session close or stale prior close), so we store `close`.
 */
export function yahooPriceTypeFromMarketState(
  marketState: unknown,
): "close" | "intraday" {
  if (typeof marketState !== "string") {
    return "close";
  }
  return marketState.trim().toUpperCase() === "REGULAR" ? "intraday" : "close";
}

/** Parse Yahoo `regularMarketTime` (Date, epoch sec/ms, ISO string, or `{ raw }`). */
function parseYahooRegularMarketTimeValue(v: unknown): Date | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v;
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    const ms = v > 1e12 ? v : v * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof v === "string" && v.trim() !== "") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (v && typeof v === "object" && "raw" in v) {
    return parseYahooRegularMarketTimeValue((v as { raw: unknown }).raw);
  }
  return null;
}

/**
 * UTC `YYYY-MM-DD` for the quote: from `price.regularMarketTime` when present so
 * pre-market fetches (still showing prior session close) do not use the fetch
 * day. Falls back to `fetchedAt` if the time is missing.
 */
export function yahooQuoteCalendarDateUtc(
  raw: YahooQuoteSummaryRaw,
  fetchedAt: Date,
): string {
  const p = raw.price as Record<string, unknown> | undefined;
  const t = p ? parseYahooRegularMarketTimeValue(p.regularMarketTime) : null;
  if (t !== null) {
    return calendarDateUtcFromInstant(t);
  }
  return calendarDateUtcFromInstant(fetchedAt);
}

/** `quoteSummary` `price` module — used for `prices` upsert (no `quote()` call). */
export function extractYahooPriceFromQuoteSummaryRaw(
  raw: YahooQuoteSummaryRaw,
): { price: number; currency: string; priceType: "close" | "intraday" } | null {
  const p = raw.price as Record<string, unknown> | undefined;
  if (!p) {
    return null;
  }
  const rp = p.regularMarketPrice;
  let n: number | null = null;
  if (typeof rp === "number" && Number.isFinite(rp)) {
    n = rp;
  } else if (rp && typeof rp === "object" && "raw" in rp) {
    const x = (rp as { raw?: unknown }).raw;
    if (typeof x === "number" && Number.isFinite(x)) {
      n = x;
    }
  }
  const cur = p.currency;
  const c =
    typeof cur === "string" && cur.trim().length > 0
      ? cur.trim().toUpperCase()
      : null;
  if (n === null || !(n > 0) || !c) {
    return null;
  }
  return {
    price: n,
    currency: c,
    priceType: yahooPriceTypeFromMarketState(p.marketState),
  };
}

export function normalizeYahooDistribution(
  raw: YahooQuoteSummaryRaw,
  symbol: string,
): { payload: DistributionPayload; notes: string[] } {
  const notes: string[] = [];
  const top = raw.topHoldings as Record<string, unknown> | undefined;
  const fund = raw.fundProfile as Record<string, unknown> | undefined;

  let rawSectors = mergeYahooWeightRows(top?.sectorWeightings);
  if (Object.keys(rawSectors).length === 0) {
    rawSectors = mergeYahooWeightRows(fund?.sectorWeightings);
  }

  const asset = raw.assetProfile;
  if (Object.keys(rawSectors).length === 0 && asset?.sector) {
    rawSectors = { [asset.sector]: 1 };
    notes.push(
      `Stock ${symbol}: single sector from assetProfile (${asset.industry ?? "n/a"}).`,
    );
  }

  let countries = mergeYahooWeightRows(top?.countryWeightings);
  if (Object.keys(countries).length === 0) {
    countries = mergeYahooWeightRows(fund?.countryWeightings);
  }

  if (Object.keys(countries).length === 0 && asset?.country) {
    countries = { [asset.country]: 1 };
    notes.push(`Stock ${symbol}: geography set to issuer country only.`);
  }

  countries = normalizeRegionWeightsToIsoKeys(countries);
  const sectors = mapSectorWeightsToCanonical(rawSectors);

  if (Object.keys(sectors).length === 0) {
    notes.push(`No sector breakdown for ${symbol}.`);
  }
  if (Object.keys(countries).length === 0) {
    notes.push(`No country breakdown for ${symbol}.`);
  }

  return {
    payload: { countries, sectors },
    notes,
  };
}
