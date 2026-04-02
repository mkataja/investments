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
 * All `prices` rows per instrument with `price_date <= maxDate`, each instrument's rows in
 * `price_date` desc order (newest first).
 */
export async function loadPriceRowsByInstrumentIdsUpToDate(
  d: DbClient,
  instrumentIds: number[],
  maxDate: string,
): Promise<Map<number, InferSelectModel<typeof prices>[]>> {
  if (instrumentIds.length === 0) {
    return new Map();
  }
  const uniq = [...new Set(instrumentIds)];
  const rows = await d
    .select()
    .from(prices)
    .where(
      and(inArray(prices.instrumentId, uniq), lte(prices.priceDate, maxDate)),
    )
    .orderBy(
      asc(prices.instrumentId),
      desc(prices.priceDate),
      desc(prices.fetchedAt),
    );
  const m = new Map<number, InferSelectModel<typeof prices>[]>();
  for (const r of rows) {
    const arr = m.get(r.instrumentId) ?? [];
    arr.push(r);
    m.set(r.instrumentId, arr);
  }
  return m;
}

/**
 * All `distributions` rows per instrument with `snapshot_date <= maxDate`, each instrument's rows
 * in `snapshot_date` desc order.
 */
export async function loadDistributionRowsByInstrumentIdsUpToDate(
  d: DbClient,
  instrumentIds: number[],
  maxDate: string,
): Promise<Map<number, InferSelectModel<typeof distributions>[]>> {
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
        lte(distributions.snapshotDate, maxDate),
      ),
    )
    .orderBy(
      asc(distributions.instrumentId),
      desc(distributions.snapshotDate),
      desc(distributions.fetchedAt),
    );
  const m = new Map<number, InferSelectModel<typeof distributions>[]>();
  for (const r of rows) {
    const arr = m.get(r.instrumentId) ?? [];
    arr.push(r);
    m.set(r.instrumentId, arr);
  }
  return m;
}

/** `rows` must be sorted by `price_date` descending (newest first). */
export function pickLatestPriceRowAsOf(
  rows: InferSelectModel<typeof prices>[],
  asOfDate: string,
): InferSelectModel<typeof prices> | undefined {
  for (const r of rows) {
    const pd = String(r.priceDate).slice(0, 10);
    if (pd <= asOfDate) {
      return r;
    }
  }
  return undefined;
}

/** `rows` must be sorted by `snapshot_date` descending (newest first). */
export function pickLatestDistributionRowAsOf(
  rows: InferSelectModel<typeof distributions>[],
  asOfDate: string,
): InferSelectModel<typeof distributions> | undefined {
  for (const r of rows) {
    const sd = String(r.snapshotDate).slice(0, 10);
    if (sd <= asOfDate) {
      return r;
    }
  }
  return undefined;
}
