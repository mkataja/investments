const DECIMALS = 6;
const MULT = 10 ** DECIMALS;

/**
 * Round weight map to `DECIMALS` fractional digits and force the sum to 1 by adjusting the largest key.
 */
export function roundWeights(
  weights: Record<string, number>,
): Record<string, number> {
  const entries = Object.entries(weights).filter(
    ([, v]) => typeof v === "number" && Number.isFinite(v) && v > 0,
  );
  if (entries.length === 0) {
    return {};
  }
  const sum = entries.reduce((s, [, v]) => s + v, 0);
  if (!(sum > 0)) {
    return {};
  }
  const normalized = Object.fromEntries(
    entries.map(([k, v]) => [k, v / sum] as const),
  );
  const keys = Object.keys(normalized);
  const rounded: Record<string, number> = {};
  let sumR = 0;
  for (const k of keys) {
    const r = Math.round((normalized[k] ?? 0) * MULT) / MULT;
    rounded[k] = r;
    sumR += r;
  }
  const delta = 1 - sumR;
  let largestKey = keys[0] as string;
  for (const k of keys) {
    if ((normalized[k] ?? 0) > (normalized[largestKey] ?? 0)) {
      largestKey = k;
    }
  }
  const cur = rounded[largestKey] ?? 0;
  rounded[largestKey] = Math.round((cur + delta) * MULT) / MULT;
  return rounded;
}
