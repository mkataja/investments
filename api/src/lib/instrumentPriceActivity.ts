import { prices } from "@investments/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { DbClient } from "../db.js";
import { SELIGSON_ARVOHISTORIA_CSV_PRICE_SOURCE } from "./seligsonArvohistoriaCsv.js";
import { YAHOO_FETCHED_PRICE_SOURCES } from "./yahooFetchedPriceSources.js";
import { YAHOO_CHART_BACKFILL_PRICE_SOURCE } from "./yahooPriceHistoryBackfill.js";

type InstrumentPriceActivity = {
  yahooPricesLastFetchedAt: string | null;
  yahooChartBackfillLastFetchedAt: string | null;
  /** Latest `fetched_at` for `seligson_csv_backfill` only (bulk CSV backfill 3h backoff); null if never. */
  seligsonCsvBackfillLastFetchedAt: string | null;
  /**
   * Instruments list "Prices": latest `fetched_at` among bulk history imports only
   * (`seligson_csv_backfill`, `yahoo_chart_backfill`).
   */
  pricesLastFetchedAt: string | null;
};

const PRICES_LABEL_SOURCES = [
  SELIGSON_ARVOHISTORIA_CSV_PRICE_SOURCE,
  YAHOO_CHART_BACKFILL_PRICE_SOURCE,
] as const;

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
 * Per-instrument `prices` timestamps: Yahoo quote/FX rows, chart backfill (backoff), and
 * CSV/chart bulk history for the instruments list "Prices" line.
 */
export async function loadInstrumentPriceActivityByInstrumentIds(
  d: DbClient,
  instrumentIds: number[],
): Promise<Map<number, InstrumentPriceActivity>> {
  if (instrumentIds.length === 0) {
    return new Map();
  }

  const [anyRows, chartRows, seligsonCsvRows, pricesLabelRows] =
    await Promise.all([
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
        .where(
          and(
            inArray(prices.instrumentId, instrumentIds),
            eq(prices.source, SELIGSON_ARVOHISTORIA_CSV_PRICE_SOURCE),
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
            inArray(prices.source, [...PRICES_LABEL_SOURCES]),
          ),
        )
        .groupBy(prices.instrumentId),
    ]);

  const out = new Map<number, InstrumentPriceActivity>();
  for (const r of anyRows) {
    out.set(r.instrumentId, {
      yahooPricesLastFetchedAt: fetchedAtToIso(r.lastAt),
      yahooChartBackfillLastFetchedAt: null,
      seligsonCsvBackfillLastFetchedAt: null,
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
        seligsonCsvBackfillLastFetchedAt: null,
        pricesLastFetchedAt: null,
      });
    }
  }
  for (const r of seligsonCsvRows) {
    const iso = fetchedAtToIso(r.lastAt);
    const existing = out.get(r.instrumentId);
    if (existing) {
      existing.seligsonCsvBackfillLastFetchedAt = iso;
    } else {
      out.set(r.instrumentId, {
        yahooPricesLastFetchedAt: null,
        yahooChartBackfillLastFetchedAt: null,
        seligsonCsvBackfillLastFetchedAt: iso,
        pricesLastFetchedAt: null,
      });
    }
  }
  for (const r of pricesLabelRows) {
    const iso = fetchedAtToIso(r.lastAt);
    const existing = out.get(r.instrumentId);
    if (existing) {
      existing.pricesLastFetchedAt = iso;
    } else {
      out.set(r.instrumentId, {
        yahooPricesLastFetchedAt: null,
        yahooChartBackfillLastFetchedAt: null,
        seligsonCsvBackfillLastFetchedAt: null,
        pricesLastFetchedAt: iso,
      });
    }
  }
  return out;
}
