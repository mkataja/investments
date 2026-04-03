/**
 * Line chart: keep positive values; use `0` only next to a positive value so
 * segments meet the axis without drawing long runs along y = 0.
 */
export function lineChartValueFromRawSeries(
  raw: readonly number[],
  index: number,
): number | null {
  const v = raw[index] ?? 0;
  if (Number.isFinite(v) && v > 0) {
    return v;
  }
  const n = raw.length;
  const prev = index > 0 ? (raw[index - 1] ?? 0) : Number.NaN;
  const next = index < n - 1 ? (raw[index + 1] ?? 0) : Number.NaN;
  const prevPos = index > 0 && Number.isFinite(prev) && prev > 0;
  const nextPos = index < n - 1 && Number.isFinite(next) && next > 0;
  if (prevPos || nextPos) {
    return 0;
  }
  return null;
}

export function yTickShort(v: number): string {
  if (!Number.isFinite(v)) {
    return "";
  }
  const sign = v < 0 ? "-" : "";
  const a = Math.abs(v);
  if (a >= 1_000_000) {
    return `${sign}${(a / 1_000_000).toFixed(1)}M`;
  }
  if (a >= 1000) {
    return `${sign}${(a / 1000).toFixed(0)}k`;
  }
  return `${sign}${a}`;
}

/**
 * Line chart: keep negative values; use `0` only next to a negative value so segments meet the axis.
 */
export function lineChartValueFromRawSeriesNonPositive(
  raw: readonly number[],
  index: number,
): number | null {
  const v = raw[index] ?? 0;
  const n = raw.length;
  if (Number.isFinite(v) && v < 0) {
    return v;
  }
  if (!Number.isFinite(v) || v !== 0) {
    return null;
  }
  const prev = index > 0 ? (raw[index - 1] ?? 0) : Number.NaN;
  const next = index < n - 1 ? (raw[index + 1] ?? 0) : Number.NaN;
  const prevNeg = index > 0 && Number.isFinite(prev) && prev < 0;
  const nextNeg = index < n - 1 && Number.isFinite(next) && next < 0;
  if (prevNeg || nextNeg) {
    return 0;
  }
  return null;
}
