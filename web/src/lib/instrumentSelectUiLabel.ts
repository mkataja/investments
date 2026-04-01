import { transactionInstrumentSelectLabel } from "@investments/lib";

/** Same label as the add-transaction instrument dropdown. */
export function instrumentSelectUiLabel(i: {
  kind: string;
  displayName: string;
  yahooSymbol: string | null;
  seligsonFund: { name: string } | null;
}): string {
  return transactionInstrumentSelectLabel(i);
}
