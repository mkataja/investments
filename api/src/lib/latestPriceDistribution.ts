import { distributions, prices } from "@investments/db";
import type { InferSelectModel } from "drizzle-orm";
import { desc, inArray } from "drizzle-orm";
import type { DbClient } from "../db.js";

export type PriceRow = InferSelectModel<typeof prices>;
export type DistributionRow = InferSelectModel<typeof distributions>;

/**
 * Latest row per instrument by `price_date` (first row wins after sorting desc).
 * Zero or one row per id in the result map.
 */
export async function loadLatestPriceRowsByInstrumentIds(
  d: DbClient,
  instrumentIds: number[],
): Promise<Map<number, PriceRow>> {
  if (instrumentIds.length === 0) {
    return new Map();
  }
  const uniq = [...new Set(instrumentIds)];
  const rows = await d
    .select()
    .from(prices)
    .where(inArray(prices.instrumentId, uniq))
    .orderBy(desc(prices.priceDate), desc(prices.fetchedAt));
  const m = new Map<number, PriceRow>();
  for (const r of rows) {
    if (!m.has(r.instrumentId)) {
      m.set(r.instrumentId, r);
    }
  }
  return m;
}

/**
 * Latest row per instrument by `snapshot_date` (first row wins after sorting desc).
 */
export async function loadLatestDistributionRowsByInstrumentIds(
  d: DbClient,
  instrumentIds: number[],
): Promise<Map<number, DistributionRow>> {
  if (instrumentIds.length === 0) {
    return new Map();
  }
  const uniq = [...new Set(instrumentIds)];
  const rows = await d
    .select()
    .from(distributions)
    .where(inArray(distributions.instrumentId, uniq))
    .orderBy(desc(distributions.snapshotDate), desc(distributions.fetchedAt));
  const m = new Map<number, DistributionRow>();
  for (const r of rows) {
    if (!m.has(r.instrumentId)) {
      m.set(r.instrumentId, r);
    }
  }
  return m;
}
