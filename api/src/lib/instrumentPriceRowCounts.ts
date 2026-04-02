import { prices } from "@investments/db";
import { count, inArray } from "drizzle-orm";
import type { DbClient } from "../db.js";

/** Row count in `prices` per instrument (one row per calendar date). */
export async function loadPriceRowCountsByInstrumentIds(
  d: DbClient,
  instrumentIds: number[],
): Promise<Map<number, number>> {
  if (instrumentIds.length === 0) {
    return new Map();
  }
  const rows = await d
    .select({
      instrumentId: prices.instrumentId,
      n: count(),
    })
    .from(prices)
    .where(inArray(prices.instrumentId, instrumentIds))
    .groupBy(prices.instrumentId);
  const out = new Map<number, number>();
  for (const r of rows) {
    out.set(r.instrumentId, Number(r.n));
  }
  return out;
}
