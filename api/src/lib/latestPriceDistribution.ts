import { distributions, prices } from "@investments/db";
import type { InferSelectModel } from "drizzle-orm";
import { and, asc, desc, inArray, lte } from "drizzle-orm";
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
 * Latest `prices` row per instrument with `price_date <= asOfDate` (UTC calendar).
 * One query; first row per id after sort order.
 */
export async function loadLatestPriceRowsByInstrumentIdsAsOf(
  d: DbClient,
  instrumentIds: number[],
  asOfDate: string,
): Promise<Map<number, InferSelectModel<typeof prices>>> {
  if (instrumentIds.length === 0) {
    return new Map();
  }
  const uniq = [...new Set(instrumentIds)];
  const rows = await d
    .select()
    .from(prices)
    .where(
      and(inArray(prices.instrumentId, uniq), lte(prices.priceDate, asOfDate)),
    )
    .orderBy(
      asc(prices.instrumentId),
      desc(prices.priceDate),
      desc(prices.fetchedAt),
    );
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

/**
 * Latest `distributions` row per instrument with `snapshot_date <= asOfDate` (UTC calendar).
 */
export async function loadLatestDistributionRowsByInstrumentIdsAsOf(
  d: DbClient,
  instrumentIds: number[],
  asOfDate: string,
): Promise<Map<number, InferSelectModel<typeof distributions>>> {
  if (instrumentIds.length === 0) {
    return new Map();
  }
  const uniq = [...new Set(instrumentIds)];
  const rows = await d
    .select()
    .from(distributions)
    .where(
      and(
        inArray(distributions.instrumentId, uniq),
        lte(distributions.snapshotDate, asOfDate),
      ),
    )
    .orderBy(
      asc(distributions.instrumentId),
      desc(distributions.snapshotDate),
      desc(distributions.fetchedAt),
    );
  const m = new Map<number, InferSelectModel<typeof distributions>>();
  for (const r of rows) {
    if (!m.has(r.instrumentId)) {
      m.set(r.instrumentId, r);
    }
  }
  return m;
}
