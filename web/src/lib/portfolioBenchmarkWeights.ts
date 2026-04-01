/** One row in the benchmark portfolio weight editor (Edit portfolio modal). */
export type BenchmarkWeightFormRow = {
  instrumentId: number | "";
  weightStr: string;
};

/**
 * Turns form rows into the payload for PUT benchmark weights. Skips blank
 * instrument lines and non-positive weights; parses localized decimals; rejects
 * duplicate instruments so the API never gets ambiguous rows.
 */
export function normalizeWeightRowsForApi(
  rows: BenchmarkWeightFormRow[],
): Array<{ instrumentId: number; weight: number }> {
  const out: Array<{ instrumentId: number; weight: number }> = [];
  const seen = new Set<number>();
  for (const r of rows) {
    if (r.instrumentId === "") {
      continue;
    }
    const w = Number.parseFloat(r.weightStr.trim().replace(",", "."));
    if (!Number.isFinite(w) || w <= 0) {
      continue;
    }
    if (seen.has(r.instrumentId)) {
      throw new Error("Each instrument can only appear once.");
    }
    seen.add(r.instrumentId);
    out.push({ instrumentId: r.instrumentId, weight: w });
  }
  return out;
}

/**
 * Exact equality of form rows (same length; same instrument id and weight text per index).
 * Used in Edit portfolio to compare current rows to the snapshot loaded from the API for
 * dirty state and confirm-before-close.
 */
export function weightRowsEqual(
  a: BenchmarkWeightFormRow[],
  b: BenchmarkWeightFormRow[],
): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x === undefined || y === undefined) {
      return false;
    }
    if (x.instrumentId !== y.instrumentId || x.weightStr !== y.weightStr) {
      return false;
    }
  }
  return true;
}
