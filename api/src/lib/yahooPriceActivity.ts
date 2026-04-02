import { prices } from "@investments/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { DbClient } from "../db.js";
import { YAHOO_FETCHED_PRICE_SOURCES } from "./yahooFetchedPriceSources.js";
import { YAHOO_CHART_BACKFILL_PRICE_SOURCE } from "./yahooPriceHistoryBackfill.js";

type YahooPriceActivity = {
  yahooPricesLastFetchedAt: string | null;
  yahooChartBackfillLastFetchedAt: string | null;
  /** Latest `fetched_at` among all `prices` rows (Seligson, Yahoo, seed, etc.). */
  pricesLastFetchedAt: string | null;
};

/** pg/node may return `timestamp` as `Date` or ISO `string` depending on driver/settings. */
function fetchedAtToIso(v: unknown): string | null {
  if (v == null) {
    return null;
  }
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString();
  }
  if (typeof v === "string" && v.trim() !== "") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

/**
 * Latest Yahoo price activity per instrument: any Yahoo `prices.source`, chart backfill only
 * (for bulk backfill 3h backoff), and max `fetched_at` over all `prices` rows (instruments list UI).
 */
export async function loadYahooPriceActivityByInstrumentIds(
  d: DbClient,
  instrumentIds: number[],
): Promise<Map<number, YahooPriceActivity>> {
  if (instrumentIds.length === 0) {
    return new Map();
  }

  const [anyRows, chartRows, allRows] = await Promise.all([
    d
      .select({
        instrumentId: prices.instrumentId,
        lastAt: sql<unknown>`max(${prices.fetchedAt})`,
      })
      .from(prices)
      .where(
        and(
          inArray(prices.instrumentId, instrumentIds),
          inArray(prices.source, [...YAHOO_FETCHED_PRICE_SOURCES]),
        ),
      )
      .groupBy(prices.instrumentId),
    d
      .select({
        instrumentId: prices.instrumentId,
        lastAt: sql<unknown>`max(${prices.fetchedAt})`,
      })
      .from(prices)
      .where(
        and(
          inArray(prices.instrumentId, instrumentIds),
          eq(prices.source, YAHOO_CHART_BACKFILL_PRICE_SOURCE),
        ),
      )
      .groupBy(prices.instrumentId),
    d
      .select({
        instrumentId: prices.instrumentId,
        lastAt: sql<unknown>`max(${prices.fetchedAt})`,
      })
      .from(prices)
      .where(inArray(prices.instrumentId, instrumentIds))
      .groupBy(prices.instrumentId),
  ]);

  const out = new Map<number, YahooPriceActivity>();
  for (const r of anyRows) {
    out.set(r.instrumentId, {
      yahooPricesLastFetchedAt: fetchedAtToIso(r.lastAt),
      yahooChartBackfillLastFetchedAt: null,
      pricesLastFetchedAt: null,
    });
  }
  for (const r of chartRows) {
    const iso = fetchedAtToIso(r.lastAt);
    const existing = out.get(r.instrumentId);
    if (existing) {
      existing.yahooChartBackfillLastFetchedAt = iso;
    } else {
      out.set(r.instrumentId, {
        yahooPricesLastFetchedAt: null,
        yahooChartBackfillLastFetchedAt: iso,
        pricesLastFetchedAt: null,
      });
    }
  }
  for (const r of allRows) {
    const iso = fetchedAtToIso(r.lastAt);
    const existing = out.get(r.instrumentId);
    if (existing) {
      existing.pricesLastFetchedAt = iso;
    } else {
      out.set(r.instrumentId, {
        yahooPricesLastFetchedAt: null,
        yahooChartBackfillLastFetchedAt: null,
        pricesLastFetchedAt: iso,
      });
    }
  }
  return out;
}
