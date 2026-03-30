/**
 * Formats a numeric string for UI: rounds to at most three fraction digits (half-up via Intl).
 * Uses a fixed locale and no grouping so the table stays consistent.
 */
export function formatUnitPriceForDisplay(raw: string): string {
  const t = raw.trim();
  const n = Number(t);
  if (!Number.isFinite(n)) return t;
  return new Intl.NumberFormat("en-US", {
    useGrouping: false,
    maximumFractionDigits: 3,
    minimumFractionDigits: 0,
  }).format(n);
}
