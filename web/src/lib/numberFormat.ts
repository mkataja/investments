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

/**
 * Unit price in the transactions table: buys shown as negative (cash out), sells unchanged.
 */
export function formatTransactionUnitPriceForDisplay(
  side: string,
  raw: string,
): string {
  const t = raw.trim();
  const n = Number(t);
  if (!Number.isFinite(n)) return t;
  const signed = side === "buy" ? -n : n;
  return formatUnitPriceForDisplay(String(signed));
}

/**
 * Line notional in trade currency: `quantity × unitPrice`, signed like
 * {@link formatTransactionUnitPriceForDisplay} for non-cash; cash accounts use unsigned sum.
 */
export function formatTransactionTotalValueForDisplay(
  side: string,
  quantity: string,
  unitPrice: string,
  currency: string,
  instrumentKind?: string,
): string {
  const q = Number(quantity.trim());
  const p = Number(unitPrice.trim());
  if (!Number.isFinite(q) || !Number.isFinite(p)) return "-";
  if (instrumentKind === "cash_account") {
    return `${formatUnitPriceForDisplay(String(q * p))} ${currency}`;
  }
  const signed = side === "buy" ? -q * p : q * p;
  return `${formatUnitPriceForDisplay(String(signed))} ${currency}`;
}

/**
 * Whole-share display: nearest integer via Math.round (ties toward +∞), not truncating
 * (not Math.trunc, |0, or parseInt on fractional strings).
 * Decimal strings that are visually whole numbers use the integer part only to avoid FP drift.
 */
export function roundQuantityForDisplay(raw: string): number {
  const t = raw.trim();
  if (/^-?\d+(\.0+)?$/.test(t)) {
    const dot = t.indexOf(".");
    const intPart = dot === -1 ? t : t.slice(0, dot);
    return Number.parseInt(intPart, 10);
  }
  const n = Number(t);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

export const formatToPercentage = (
  v: number,
  { decimalPlaces }: { decimalPlaces?: number } = {},
) => `${(v * 100).toFixed(decimalPlaces ?? 1)}%`;
