import { transactions } from "@investments/db";
import { sql } from "drizzle-orm";
import { db } from "../db.js";

export type PositionQty = {
  instrumentId: number;
  quantity: number;
};

export async function loadOpenPositions(): Promise<PositionQty[]> {
  const rows = await db
    .select({
      instrumentId: transactions.instrumentId,
      qty: sql<string>`SUM(CASE WHEN ${transactions.side} = 'buy' THEN ${transactions.quantity}::numeric ELSE -${transactions.quantity}::numeric END)`,
    })
    .from(transactions)
    .groupBy(transactions.instrumentId);

  return rows
    .map((r) => ({
      instrumentId: r.instrumentId,
      quantity: Number.parseFloat(r.qty),
    }))
    .filter((r) => r.quantity !== 0 && Number.isFinite(r.quantity));
}
