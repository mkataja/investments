/** One row in the benchmark portfolio weight editor (Edit portfolio modal). */
export type BenchmarkWeightFormRow = {
  instrumentId: number | "";
  weightStr: string;
};

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
