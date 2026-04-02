import { instruments, seligsonFunds, transactions } from "@investments/db";
import { eq } from "drizzle-orm";
import type { DbOrTx } from "../db.js";

export async function deleteInstrumentWithLinkedSeligsonFund(
  tx: DbOrTx,
  instrumentId: number,
  seligsonFundId: number | null,
): Promise<void> {
  await tx
    .delete(transactions)
    .where(eq(transactions.instrumentId, instrumentId));
  await tx.delete(instruments).where(eq(instruments.id, instrumentId));
  if (seligsonFundId != null) {
    await tx.delete(seligsonFunds).where(eq(seligsonFunds.id, seligsonFundId));
  }
}
