import { transactions } from "@investments/db";
import { and, eq } from "drizzle-orm";
import type { DbOrTx } from "../../db.js";

export function parseMultipartBooleanField(
  body: Record<string, unknown>,
  key: string,
): boolean {
  const raw = body[key];
  return raw === true || raw === "true" || raw === "1";
}

export async function deleteTransactionsForBrokerImport(
  tx: DbOrTx,
  brokerId: number,
  userId: number,
): Promise<number> {
  const del = await tx
    .delete(transactions)
    .where(
      and(eq(transactions.brokerId, brokerId), eq(transactions.userId, userId)),
    )
    .returning({ id: transactions.id });
  return del.length;
}

export async function deleteTransactionsForSveaCashAccountImport(
  tx: DbOrTx,
  brokerId: number,
  userId: number,
  instrumentId: number,
): Promise<number> {
  const del = await tx
    .delete(transactions)
    .where(
      and(
        eq(transactions.brokerId, brokerId),
        eq(transactions.userId, userId),
        eq(transactions.instrumentId, instrumentId),
      ),
    )
    .returning({ id: transactions.id });
  return del.length;
}
