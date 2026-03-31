/** Cash instrument denominations; extend in one place for API validation and UI. */
export const SUPPORTED_CASH_CURRENCY_CODES = ["EUR", "USD"] as const;

export type CashCurrencyCode = (typeof SUPPORTED_CASH_CURRENCY_CODES)[number];

export function isCashCurrencyCode(s: string): s is CashCurrencyCode {
  return (SUPPORTED_CASH_CURRENCY_CODES as readonly string[]).includes(s);
}

export const DEFAULT_CASH_CURRENCY: CashCurrencyCode = "EUR";
