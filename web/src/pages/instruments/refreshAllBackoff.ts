import type { InstrumentListItem } from "./types";

/** Refresh-all skips POST if distribution was fetched within this window. Individual refresh ignores this. */
const REFRESH_ALL_MIN_INTERVAL_MS = 3 * 60 * 60 * 1000;

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
  return Date.now() - t < REFRESH_ALL_MIN_INTERVAL_MS;
}
