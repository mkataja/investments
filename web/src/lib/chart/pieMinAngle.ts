/**
 * Bump small pie/doughnut slice values so tiny wedges stay visible.
 * Each non-zero slice is at least `minDegrees` of the circle (capped when
 * there are many slices). `original` stays the real data for tooltips;
 * `display` is only for Chart.js arc sizes and need not sum to the same total.
 */
export function adjustPieValuesForMinAngleDegrees(
  values: readonly number[],
  minDegrees: number,
): { display: number[]; original: number[] } {
  const original = [...values];
  const sum = values.reduce((a, b) => a + b, 0);
  if (!(sum > 0)) {
    return { display: original, original };
  }

  const positiveCount = values.filter((v) => v > 0).length;
  if (positiveCount === 0) {
    return { display: original, original };
  }

  const maxMinDeg = 360 / positiveCount;
  const effectiveMinDeg = Math.min(minDegrees, maxMinDeg);
  const floor = (effectiveMinDeg / 360) * sum;

  const display = values.map((v) => (v > 0 ? Math.max(v, floor) : 0));
  return { display, original };
}
