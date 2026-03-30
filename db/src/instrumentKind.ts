/**
 * Stored `instruments.kind` values and human-readable labels for UI.
 */
export const INSTRUMENT_KINDS = [
  "etf",
  "stock",
  "custom",
  "cash_account",
] as const;

export type InstrumentKind = (typeof INSTRUMENT_KINDS)[number];

export const INSTRUMENT_KIND_DISPLAY: Record<InstrumentKind, string> = {
  etf: "ETF",
  stock: "Stock",
  custom: "Custom",
  cash_account: "Cash",
};

export function instrumentKindDisplayLabel(kind: string): string {
  return INSTRUMENT_KIND_DISPLAY[kind as InstrumentKind] ?? kind;
}

/** Row shape for list/detail ticker: Yahoo symbol, Seligson FID, or none for cash. */
export function instrumentTickerDisplay(row: {
  kind: string;
  yahooSymbol: string | null;
  seligsonFund: { fid: number } | null;
}): string | null {
  if (row.kind === "etf" || row.kind === "stock") {
    return row.yahooSymbol;
  }
  if (row.kind === "custom" && row.seligsonFund) {
    return String(row.seligsonFund.fid);
  }
  return null;
}
