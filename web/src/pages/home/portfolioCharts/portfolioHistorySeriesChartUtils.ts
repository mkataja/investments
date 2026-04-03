import type { Chart } from "chart.js";

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
  if (v >= 1_000_000) {
    return `${(v / 1_000_000).toFixed(1)}M`;
  }
  if (v >= 1000) {
    return `${(v / 1000).toFixed(0)}k`;
  }
  return String(v);
}

export function totalPositiveEurAtDataIndex(
  chart: Chart,
  dataIndex: number,
): number {
  let s = 0;
  for (const ds of chart.data.datasets) {
    const row = ds.data;
    const raw = Array.isArray(row) ? row[dataIndex] : undefined;
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
      s += raw;
    }
  }
  return s;
}
