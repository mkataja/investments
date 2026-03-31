import type { Sec13FInfoTableRow } from "./parseSec13FInfoTableXml.js";

/** Minimum fraction of total filing value (sum of `value` cells) to resolve via OpenFIGI/Yahoo. */
export const SEC_13F_MIN_POSITION_FRACTION_OF_FILING = 0.0025;

/**
 * Keeps 13F lines whose reported value is at least `SEC_13F_MIN_POSITION_FRACTION_OF_FILING`
 * of the filing total, to cut OpenFIGI/Yahoo work on tiny positions.
 * If that would remove every row, returns the original rows (same as no filter).
 */
export function filterSec13FRowsByMinFilingWeight(
  rows: readonly Sec13FInfoTableRow[],
): Sec13FInfoTableRow[] {
  const total = rows.reduce((s, r) => s + r.valueRaw, 0);
  if (!(total > 0)) {
    return [...rows];
  }
  const min = SEC_13F_MIN_POSITION_FRACTION_OF_FILING;
  const filtered = rows.filter((r) => r.valueRaw / total >= min);
  return filtered.length > 0 ? filtered : [...rows];
}
