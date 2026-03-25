import type { DistributionPayload } from "@investments/db";
import yahooFinance from "yahoo-finance2";
import { mergeYahooWeightRows } from "./types.js";

const MODULES = [
  "topHoldings",
  "fundProfile",
  "assetProfile",
  "summaryDetail",
] as const;

export type YahooQuoteSummaryRaw = Awaited<
  ReturnType<typeof yahooFinance.quoteSummary>
>;

export async function fetchYahooQuoteSummaryRaw(
  symbol: string,
): Promise<YahooQuoteSummaryRaw> {
  return yahooFinance.quoteSummary(symbol, { modules: [...MODULES] });
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
