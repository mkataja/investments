/**
 * Yahoo forex symbols for EUR valuation: `quoted_price` stored as **EUR per 1 unit** of the foreign
 * currency, `prices.currency = EUR`. Pair-specific: Yahoo may quote USD per EUR (`EURUSD=X`) or
 * EUR per GBP (`GBPEUR=X`); `invertToEurPerUnit` converts to EUR per 1 foreign unit.
 */

export type FxYahooPairConfig = {
  yahooSymbol: string;
  /** When true, `eurPerUnit = 1 / yahooRegularMarketPrice`; when false, `eurPerUnit = price`. */
  invertToEurPerUnit: boolean;
};

/** ISO 4217 foreign codes supported for lazy FX instruments (extend as needed). */
const FX_YAHOO_BY_FOREIGN: Record<string, FxYahooPairConfig> = {
  USD: { yahooSymbol: "EURUSD=X", invertToEurPerUnit: true },
  GBP: { yahooSymbol: "GBPEUR=X", invertToEurPerUnit: false },
  CHF: { yahooSymbol: "EURCHF=X", invertToEurPerUnit: true },
  JPY: { yahooSymbol: "EURJPY=X", invertToEurPerUnit: true },
};

export function fxYahooPairConfigForForeign(
  foreignIso: string,
): FxYahooPairConfig | null {
  const k = foreignIso.trim().toUpperCase();
  if (k === "EUR" || k.length === 0) {
    return null;
  }
  return FX_YAHOO_BY_FOREIGN[k] ?? null;
}

export function eurPerUnitOfForeignFromYahooPrice(
  yahooRegularMarketPrice: number,
  invertToEurPerUnit: boolean,
): number {
  if (
    !(yahooRegularMarketPrice > 0) ||
    !Number.isFinite(yahooRegularMarketPrice)
  ) {
    return Number.NaN;
  }
  return invertToEurPerUnit
    ? 1 / yahooRegularMarketPrice
    : yahooRegularMarketPrice;
}
