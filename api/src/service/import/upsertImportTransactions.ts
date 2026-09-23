import { transactions } from "@investments/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { DbOrTx } from "../../db.js";

type TransactionInsertRow = typeof transactions.$inferInsert;

async function insertImportTransactions(
  client: DbOrTx,
  values: TransactionInsertRow[],
) {
  return client
    .insert(transactions)
    .values(values)
    .onConflictDoUpdate({
      target: [
        transactions.brokerId,
        transactions.externalSource,
        transactions.externalId,
      ],
      set: {
        userId: sql`excluded.user_id`,
        portfolioId: sql`excluded.portfolio_id`,
        tradeDate: sql`excluded.trade_date`,
        side: sql`excluded.side`,
        instrumentId: sql`excluded.instrument_id`,
        quantity: sql`excluded.quantity`,
        unitPrice: sql`excluded.unit_price`,
        currency: sql`excluded.currency`,
        tradeOrderKey: sql`excluded.trade_order_key`,
      },
      setWhere: sql`(
        ${transactions.tradeDate} IS DISTINCT FROM ${sql.raw("excluded.trade_date")}
        OR ${transactions.side} IS DISTINCT FROM ${sql.raw("excluded.side")}
        OR ${transactions.instrumentId} IS DISTINCT FROM ${sql.raw("excluded.instrument_id")}
        OR ${transactions.quantity} IS DISTINCT FROM ${sql.raw("excluded.quantity")}
        OR ${transactions.unitPrice} IS DISTINCT FROM ${sql.raw("excluded.unit_price")}
        OR ${transactions.currency} IS DISTINCT FROM ${sql.raw("excluded.currency")}
        OR ${transactions.portfolioId} IS DISTINCT FROM ${sql.raw("excluded.portfolio_id")}
        OR ${transactions.tradeOrderKey} IS DISTINCT FROM ${sql.raw("excluded.trade_order_key")}
      )`,
    })
    .returning({ id: transactions.id, externalId: transactions.externalId });
}

export async function upsertImportTransactionsWithCounts(
  client: DbOrTx,
  values: TransactionInsertRow[],
): Promise<{
  processed: number;
  changed: number;
  unchanged: number;
  added: number;
  updated: number;
}> {
  const first = values[0];
  if (first === undefined) {
    throw new Error("upsertImportTransactionsWithCounts: empty values");
  }
  const brokerId = first.brokerId;
  const externalSource = first.externalSource;
  if (brokerId == null || externalSource == null) {
    throw new Error(
      "upsertImportTransactionsWithCounts: missing brokerId or externalSource",
    );
  }
  const uniqueIds = [
    ...new Set(
      values.map((v) => v.externalId).filter((id): id is string => id != null),
    ),
  ];
  const existingRows =
    uniqueIds.length === 0
      ? []
      : await client
          .select({ externalId: transactions.externalId })
          .from(transactions)
          .where(
            and(
              eq(transactions.brokerId, brokerId),
              eq(transactions.externalSource, externalSource),
              inArray(transactions.externalId, uniqueIds),
            ),
          );
  const existingBefore = new Set(
    existingRows
      .map((r) => r.externalId)
      .filter((id): id is string => id != null),
  );
  const written = await insertImportTransactions(client, values);
  const returned = new Set(
    written.map((w) => w.externalId).filter((id): id is string => id != null),
  );
  let added = 0;
  let updated = 0;
  for (const v of values) {
    const ext = v.externalId;
    if (ext == null) {
      continue;
    }
    if (returned.has(ext)) {
      if (existingBefore.has(ext)) {
        updated++;
      } else {
        added++;
      }
    }
  }
  const processed = values.length;
  const changed = written.length;
  return {
    processed,
    changed,
    unchanged: processed - changed,
    added,
    updated,
  };
}
