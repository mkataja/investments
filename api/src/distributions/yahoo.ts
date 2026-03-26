import type { DistributionPayload } from "@investments/db";
import { resolveRegionKeyToIso } from "@investments/db";
import yahooFinance from "yahoo-finance2";
import { mergeYahooWeightRows } from "./types.js";

function normalizeYahooRegionsToIsoKeys(
  regions: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, w] of Object.entries(regions)) {
    const iso = resolveRegionKeyToIso(k);
    if (iso) {
      out[iso] = (out[iso] ?? 0) + w;
    } else {
      out[k] = w;
    }
  }
  return out;
}

const MODULES = [
  "topHoldings",
  "fundProfile",
  "assetProfile",
  "summaryDetail",
  "price",
] as const;

export type YahooQuoteSummaryRaw = Awaited<
  ReturnType<typeof yahooFinance.quoteSummary>
>;

export async function fetchYahooQuoteSummaryRaw(
  symbol: string,
): Promise<YahooQuoteSummaryRaw> {
  return yahooFinance.quoteSummary(symbol, { modules: [...MODULES] });
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
  const longName = longNameFromPrice ?? asset?.longName ?? null;
  return {
    symbol,
    shortName,
    longName,
    isin: asset?.isin ?? null,
    sector: asset?.sector ?? null,
    industry: asset?.industry ?? null,
    country: asset?.country ?? null,
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

export function normalizeYahooDistribution(
  raw: YahooQuoteSummaryRaw,
  symbol: string,
): { payload: DistributionPayload; notes: string[] } {
  const notes: string[] = [];
  const top = raw.topHoldings as Record<string, unknown> | undefined;
  const fund = raw.fundProfile as Record<string, unknown> | undefined;

  let sectors = mergeYahooWeightRows(top?.sectorWeightings);
  if (Object.keys(sectors).length === 0) {
    sectors = mergeYahooWeightRows(fund?.sectorWeightings);
  }

  const asset = raw.assetProfile;
  if (Object.keys(sectors).length === 0 && asset?.sector) {
    sectors = { [asset.sector]: 1 };
    notes.push(
      `Stock ${symbol}: single sector from assetProfile (${asset.industry ?? "n/a"}).`,
    );
  }

  let regions = mergeYahooWeightRows(top?.countryWeightings);
  if (Object.keys(regions).length === 0) {
    regions = mergeYahooWeightRows(fund?.countryWeightings);
  }

  if (Object.keys(regions).length === 0 && asset?.country) {
    regions = { [asset.country]: 1 };
    notes.push(`Stock ${symbol}: geography set to issuer country only.`);
  }

  regions = normalizeYahooRegionsToIsoKeys(regions);

  if (Object.keys(sectors).length === 0) {
    notes.push(`No sector breakdown for ${symbol}.`);
  }
  if (Object.keys(regions).length === 0) {
    notes.push(`No region breakdown for ${symbol}.`);
  }

  return {
    payload: { regions, sectors },
    notes,
  };
}
