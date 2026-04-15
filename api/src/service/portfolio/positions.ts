import { transactions } from "@investments/db";
import { USER_ID } from "@investments/lib/appUser";
import { eq, sql } from "drizzle-orm";
import { db } from "../../db.js";

type PositionQty = {
  instrumentId: number;
  quantity: number;
};

async function netPositionsForPortfolio(
  portfolioId: number,
): Promise<PositionQty[]> {
  const rows = await db
    .select({
      instrumentId: transactions.instrumentId,
      qty: sql<string>`SUM(CASE WHEN ${transactions.side} = 'buy' THEN ${transactions.quantity}::numeric ELSE -${transactions.quantity}::numeric END)`,
    })
    .from(transactions)
    .where(eq(transactions.portfolioId, portfolioId))
    .groupBy(transactions.instrumentId);

  return rows
    .map((r) => ({
      instrumentId: r.instrumentId,
      quantity: Number.parseFloat(r.qty),
    }))
    .filter((r) => Number.isFinite(r.quantity));
}

/** Open positions only (non-zero net quantity). */
export async function loadOpenPositionsForPortfolio(
  portfolioId: number,
): Promise<PositionQty[]> {
  return (await netPositionsForPortfolio(portfolioId)).filter(
    (r) => r.quantity !== 0,
  );
}

/**
 * Net quantity per instrument, including zero (fully closed). Used for holdings list with bucket assignment for closed lines.
 */
export async function loadNetPositionsForPortfolio(
  portfolioId: number,
): Promise<PositionQty[]> {
  return netPositionsForPortfolio(portfolioId);
}

/** Sum positions across all portfolios for the default user (e.g. cache refresh). */
export async function loadOpenPositionsAggregateForUser(): Promise<
  PositionQty[]
> {
  const rows = await db
    .select({
      instrumentId: transactions.instrumentId,
      qty: sql<string>`SUM(CASE WHEN ${transactions.side} = 'buy' THEN ${transactions.quantity}::numeric ELSE -${transactions.quantity}::numeric END)`,
    })
    .from(transactions)
    .where(eq(transactions.userId, USER_ID))
    .groupBy(transactions.instrumentId);

  return rows
    .map((r) => ({
      instrumentId: r.instrumentId,
      quantity: Number.parseFloat(r.qty),
    }))
    .filter((r) => r.quantity !== 0 && Number.isFinite(r.quantity));
}
