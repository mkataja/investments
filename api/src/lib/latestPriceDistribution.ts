import { distributions, prices } from "@investments/db";
import type { InferSelectModel } from "drizzle-orm";
import { desc, inArray } from "drizzle-orm";
import type { DbClient } from "../db.js";

/**
 * Latest row per instrument by `price_date` (first row wins after sorting desc).
 * Zero or one row per id in the result map.
 */
export async function loadLatestPriceRowsByInstrumentIds(
  d: DbClient,
  instrumentIds: number[],
): Promise<Map<number, InferSelectModel<typeof prices>>> {
  if (instrumentIds.length === 0) {
    return new Map();
  }
  const uniq = [...new Set(instrumentIds)];
  const rows = await d
    .select()
    .from(prices)
    .where(inArray(prices.instrumentId, uniq))
    .orderBy(desc(prices.priceDate), desc(prices.fetchedAt));
  const m = new Map<number, InferSelectModel<typeof prices>>();
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
): Promise<Map<number, InferSelectModel<typeof distributions>>> {
  if (instrumentIds.length === 0) {
    return new Map();
  }
  const uniq = [...new Set(instrumentIds)];
  const rows = await d
    .select()
    .from(distributions)
    .where(inArray(distributions.instrumentId, uniq))
    .orderBy(desc(distributions.snapshotDate), desc(distributions.fetchedAt));
  const m = new Map<number, InferSelectModel<typeof distributions>>();
  for (const r of rows) {
    if (!m.has(r.instrumentId)) {
      m.set(r.instrumentId, r);
    }
  }
  return m;
}
