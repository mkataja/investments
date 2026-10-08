import { instruments, prices } from "@investments/db";
import { and, eq, inArray } from "drizzle-orm";
import type { DbOrTx } from "../../db.js";
import { calendarDateUtcFromInstant } from "../../lib/calendarDateUtc.js";
import { processFxBackfillQueue } from "../fx/fxEurPriceBackfill.js";
import { upsertPriceForDate } from "./priceDistributionWrite.js";

type TxnRow = {
  instrumentId: number;
  tradeDate: Date;
  unitPrice: string;
  currency: string;
};

/** If there is no `prices` row for the trade’s UTC calendar day, insert `intraday` from the trade. */
async function seedIntradayPriceFromTransactionIfMissing(
  d: DbOrTx,
  txn: TxnRow,
  instrumentKind: string,
): Promise<void> {
  if (instrumentKind === "cash_account") {
    return;
  }
  const priceDate = calendarDateUtcFromInstant(new Date(txn.tradeDate));
  const [existing] = await d
    .select({ instrumentId: prices.instrumentId })
    .from(prices)
    .where(
      and(
        eq(prices.instrumentId, txn.instrumentId),
        eq(prices.priceDate, priceDate),
      ),
    )
    .limit(1);
  if (existing) {
    return;
  }
  await upsertPriceForDate(d, {
    instrumentId: txn.instrumentId,
    priceDate,
    quotedPrice: String(txn.unitPrice),
    currency: String(txn.currency).toUpperCase(),
    priceType: "intraday",
    fetchedAt: new Date(txn.tradeDate),
    source: "transaction_seed",
  });
}

/** Seeds missing `intraday` prices from the transactions, then drains the FX queue once. */
export async function seedIntradayPricesFromTransactionsIfMissing(
  d: DbOrTx,
  txns: TxnRow[],
): Promise<void> {
  if (txns.length === 0) {
    return;
  }
  const instRows = await d
    .select({ id: instruments.id, kind: instruments.kind })
    .from(instruments)
    .where(
      inArray(instruments.id, [...new Set(txns.map((t) => t.instrumentId))]),
    );
  const kindById = new Map(instRows.map((r) => [r.id, r.kind]));
  for (const txn of txns) {
    const kind = kindById.get(txn.instrumentId);
    if (kind !== undefined) {
      await seedIntradayPriceFromTransactionIfMissing(d, txn, kind);
    }
  }
  await processFxBackfillQueue();
}
