/**
 * JSON body for POST /transactions or PATCH /transactions/:id (new/edit transaction modal).
 */
type TransactionMutationInput = {
  portfolioId: number;
  brokerId: number;
  tradeDateIso: string;
  instrumentId: number;
  /** Already uppercased or trim-only; still normalized here. */
  currency: string;
  isCashAccount: boolean;
  side: "buy" | "sell";
  quantity: string;
  unitPrice: string;
  unitPriceEur: string;
};

export function buildTransactionMutationBody(
  input: TransactionMutationInput,
): Record<string, unknown> {
  const currency = input.currency.trim().toUpperCase();
  const body: Record<string, unknown> = {
    portfolioId: input.portfolioId,
    brokerId: input.brokerId,
    tradeDate: input.tradeDateIso,
    instrumentId: input.instrumentId,
    currency,
  };
  if (input.isCashAccount) {
    const sum = Number.parseFloat(input.quantity.replace(",", "."));
    body.side = input.side;
    body.quantity = String(sum);
    body.unitPrice = "1";
  } else {
    body.side = input.side;
    body.quantity = input.quantity;
    body.unitPrice = input.unitPrice;
    if (input.unitPriceEur) {
      body.unitPriceEur = input.unitPriceEur;
    }
  }
  return body;
}
