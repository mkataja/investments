/** Minimal row shape for the transaction / import instrument dropdown label. */
export type TransactionInstrumentSelectRow = {
  kind: string;
  displayName: string;
  yahooSymbol: string | null;
  seligsonFund: { name: string } | null;
};

export function transactionInstrumentSelectLabel(
  row: TransactionInstrumentSelectRow,
): string {
  const name = row.displayName.trim();
  if (row.kind === "etf" || row.kind === "stock" || row.kind === "commodity") {
    const t = row.yahooSymbol?.trim();
    if (t) {
      return `${t} - ${name}`;
    }
    return name;
  }
  if (row.kind === "custom") {
    const n = row.seligsonFund?.name?.trim();
    return n && n.length > 0 ? n : name;
  }
  if (row.kind === "cash_account") {
    return `Cash account - ${name}`;
  }
  return name;
}
