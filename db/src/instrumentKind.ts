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

/** Minimal row shape for instruments table “Kind” column text. */
export type InstrumentKindColumnRow = {
  kind: string;
  broker: { name: string } | null;
};

/**
 * Plain-text label for an instruments list “Kind” column: `custom` uses the linked broker name,
 * `cash_account` uses “Cash” plus optional broker name; ETF/stock use the standard kind label.
 */
export function instrumentKindColumnLabel(
  row: InstrumentKindColumnRow,
): string {
  switch (row.kind) {
    case "custom": {
      const n = row.broker?.name?.trim();
      return n && n.length > 0 ? n : "—";
    }
    case "cash_account": {
      const base = instrumentKindDisplayLabel("cash_account");
      const n = row.broker?.name?.trim();
      return n && n.length > 0 ? `${base} · ${n}` : base;
    }
    default:
      return instrumentKindDisplayLabel(row.kind);
  }
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
