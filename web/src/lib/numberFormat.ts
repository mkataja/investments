import { APP_LOCALE } from "./locale";

function formatNumber(
  value: number,
  options: Intl.NumberFormatOptions = {},
): string {
  return new Intl.NumberFormat(APP_LOCALE, options).format(value);
}

export function formatIntegerForDisplay(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  return formatNumber(value, { maximumFractionDigits: 0 });
}

export function formatDecimalForDisplay(
  value: number,
  {
    decimalPlaces = 2,
    useGrouping = true,
  }: { decimalPlaces?: number; useGrouping?: boolean } = {},
): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  return formatNumber(value, {
    useGrouping,
    maximumFractionDigits: decimalPlaces,
    minimumFractionDigits: decimalPlaces,
  });
}

/**
 * Formats a numeric string for UI: rounds to at most three fraction digits (half-up via Intl).
 * Uses app locale and no grouping so the table stays consistent.
 */
export function formatUnitPriceForDisplay(raw: string): string {
  const t = raw.trim();
  const n = Number(t);
  if (!Number.isFinite(n)) return t;
  return formatNumber(n, {
    useGrouping: false,
    maximumFractionDigits: 3,
    minimumFractionDigits: 0,
  });
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
 * If a quantity is within this distance of {@link Math.round}, it is shown as that integer
 * (avoids floating-point noise; fractional shares and fund units use decimals otherwise).
 */
export const QUANTITY_NEAR_INTEGER_EPS = 1e-5;

/**
 * Formats a quantity string for tables: integers when numerically near a whole number,
 * otherwise up to three fraction digits (same rules as {@link formatUnitPriceForDisplay}).
 */
export function formatQuantityForDisplay(raw: string): string {
  const t = raw.trim();
  const n = Number(t);
  if (!Number.isFinite(n)) return t;
  const nearest = Math.round(n);
  if (Math.abs(n - nearest) <= QUANTITY_NEAR_INTEGER_EPS) {
    return formatIntegerForDisplay(nearest);
  }
  return formatUnitPriceForDisplay(t);
}

export const formatToPercentage = (
  v: number,
  { decimalPlaces }: { decimalPlaces?: number } = {},
) => {
  if (!Number.isFinite(v)) {
    return "";
  }
  const digits = decimalPlaces ?? 1;
  return formatNumber(v, {
    style: "percent",
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
};

/** Formats a percentage value where `value` is already in percent units (0-100). */
export function formatPercentageValueForDisplay(
  value: number,
  { decimalPlaces }: { decimalPlaces?: number } = {},
): string {
  return formatToPercentage(value / 100, { decimalPlaces });
}
