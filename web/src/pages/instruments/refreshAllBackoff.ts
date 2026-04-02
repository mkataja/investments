import type { InstrumentListItem } from "./types";

/** Bulk min interval: refresh-all distribution and Yahoo chart backfill all-instruments runs. */
const BULK_MIN_INTERVAL_MS = 3 * 60 * 60 * 1000;

/** Refresh-all skips POST if distribution was fetched within this window. Individual refresh ignores this. */
export function isSkippedByRefreshAllBackoff(i: InstrumentListItem): boolean {
  if (i.kind === "cash_account") {
    return false;
  }
  const raw = i.distribution?.fetchedAt;
  if (raw == null || raw === "") {
    return false;
  }
  const t = new Date(raw).getTime();
  if (Number.isNaN(t)) {
    return false;
  }
  return Date.now() - t < BULK_MIN_INTERVAL_MS;
}

/**
 * Backfill-all skips POST if any `yahoo_chart_backfill` price row was written within this window.
 * Individual instrument backfill (API) ignores this.
 */
export function isSkippedByBackfillAllBackoff(i: InstrumentListItem): boolean {
  const raw = i.yahooChartBackfillLastFetchedAt;
  if (raw == null || raw === "") {
    return false;
  }
  const t = new Date(raw).getTime();
  if (Number.isNaN(t)) {
    return false;
  }
  return Date.now() - t < BULK_MIN_INTERVAL_MS;
}

/** Bulk Seligson CSV backfill skips POST if `seligson_csv_backfill` was written within this window. */
export function isSkippedBySeligsonBackfillAllBackoff(
  i: InstrumentListItem,
): boolean {
  const raw = i.seligsonCsvBackfillLastFetchedAt;
  if (raw == null || raw === "") {
    return false;
  }
  const t = new Date(raw).getTime();
  if (Number.isNaN(t)) {
    return false;
  }
  return Date.now() - t < BULK_MIN_INTERVAL_MS;
}
