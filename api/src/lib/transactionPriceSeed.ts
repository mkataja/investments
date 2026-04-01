import { instruments, prices } from "@investments/db";
import { and, eq } from "drizzle-orm";
import type { DbOrTx } from "../db.js";
import { calendarDateUtcFromInstant } from "./calendarDateUtc.js";

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
  await d.insert(prices).values({
    instrumentId: txn.instrumentId,
    priceDate,
    quotedPrice: String(txn.unitPrice),
    currency: String(txn.currency).toUpperCase(),
    priceType: "intraday",
    fetchedAt: new Date(txn.tradeDate),
    source: "transaction_seed",
  });
}

export async function seedIntradayPriceForInstrumentIfMissing(
  d: DbOrTx,
  instrumentId: number,
  txn: TxnRow,
): Promise<void> {
  const [inst] = await d
    .select({ kind: instruments.kind })
    .from(instruments)
    .where(eq(instruments.id, instrumentId))
    .limit(1);
  if (!inst) {
    return;
  }
  await seedIntradayPriceFromTransactionIfMissing(d, txn, inst.kind);
}
