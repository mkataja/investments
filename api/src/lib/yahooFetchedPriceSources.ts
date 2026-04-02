import { prices } from "@investments/db";
import { and, eq, inArray } from "drizzle-orm";
import type { DbClient } from "../db.js";

/**
 * `prices.source` values that indicate a Yahoo-derived quote (excludes Seligson NAV, trade seed, etc.).
 */
export const YAHOO_FETCHED_PRICE_SOURCES = [
  "yahoo_quote_summary",
  "yahoo_fx_cross",
  "yahoo_chart_backfill",
] as const;

export async function instrumentHasYahooFetchedPrice(
  d: DbClient,
  instrumentId: number,
): Promise<boolean> {
  const [row] = await d
    .select({ instrumentId: prices.instrumentId })
    .from(prices)
    .where(
      and(
        eq(prices.instrumentId, instrumentId),
        inArray(prices.source, [...YAHOO_FETCHED_PRICE_SOURCES]),
      ),
    )
    .limit(1);
  return row != null;
}

export async function loadInstrumentIdsWithYahooFetchedPrices(
  d: DbClient,
): Promise<Set<number>> {
  const rows = await d
    .select({ instrumentId: prices.instrumentId })
    .from(prices)
    .where(inArray(prices.source, [...YAHOO_FETCHED_PRICE_SOURCES]));
  return new Set(rows.map((r) => r.instrumentId));
}
