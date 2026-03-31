/**
 * Y-axis for distribution bar charts: 0-based domain, evenly spaced ticks with integer
 * percentage labels (no fractional tick values when formatted as %).
 */

/** Default tick count (including 0) for {@link distributionBarYAxisFromMax}. */
export const DEFAULT_DISTRIBUTION_BAR_Y_AXIS_TICK_COUNT = 5;

export function maxDistributionBarChartValue(
  rows: readonly { value?: number; primary?: number; compare?: number }[],
  compare: boolean,
): number {
  let m = 0;
  for (const r of rows) {
    if (compare) {
      const p = r.primary;
      const c = r.compare;
      if (typeof p === "number" && Number.isFinite(p)) m = Math.max(m, p);
      if (typeof c === "number" && Number.isFinite(c)) m = Math.max(m, c);
    } else {
      const v = r.value;
      if (typeof v === "number" && Number.isFinite(v)) m = Math.max(m, v);
    }
  }
  return m;
}

/**
 * Domain [0, d] and `tickCount` ticks at i·d/(tickCount−1), i = 0…tickCount−1,
 * with d = (tickCount−1)·k/100 for integer k ≥ 1, choosing the smallest d that is ≥ `maxData01`
 * (weights in 0–1). `tickCount` is the number of labeled ticks (including 0), minimum 2.
 */
export function distributionBarYAxisFromMax(
  maxData01: number,
  tickCount: number = DEFAULT_DISTRIBUTION_BAR_Y_AXIS_TICK_COUNT,
): {
  domain: [number, number];
  ticks: number[];
} {
  const nTicks = Math.max(2, Math.floor(tickCount));
  const intervals = nTicks - 1;
  const m = Math.max(0, maxData01);
  const k = m <= 0 ? 1 : Math.max(1, Math.ceil((100 * m) / intervals));
  const d = (intervals * k) / 100;
  const ticks = Array.from({ length: nTicks }, (_, i) => (i * k) / 100);
  return {
    domain: [0, d],
    ticks,
  };
}
