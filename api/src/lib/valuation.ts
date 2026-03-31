import { type instruments, prices } from "@investments/db";
import { DEFAULT_CASH_CURRENCY } from "@investments/lib";
import type { InferSelectModel } from "drizzle-orm";
import { inArray } from "drizzle-orm";
import { db } from "../db.js";

export type InstrumentRow = InferSelectModel<typeof instruments>;

/** Stub until persisted FX or `quoted_price_eur` on `prices` (see plan). */
const STUB_EUR_PER_USD = 0.92;

function nativeToEurStub(amount: number, currency: string | undefined): number {
  const c = (currency ?? "EUR").toUpperCase();
  if (c === "EUR") {
    return amount;
  }
  if (c === "USD") {
    return amount * STUB_EUR_PER_USD;
  }
  return amount;
}

function noQuoteResult(): ValuationResult {
  return {
    valueEur: 0,
    source: "none",
    detail: "No cached price",
  };
}

export type ValuationResult = {
  valueEur: number;
  source: "cached_price" | "cash" | "none";
  detail: string;
};

export async function valuePortfolioRowsEur(
  rows: Array<{ inst: InstrumentRow; qty: number }>,
): Promise<ValuationResult[]> {
  const nonCashIds = [
    ...new Set(
      rows.filter((r) => r.inst.kind !== "cash_account").map((r) => r.inst.id),
    ),
  ];
  const priceRows =
    nonCashIds.length === 0
      ? []
      : await db
          .select()
          .from(prices)
          .where(inArray(prices.instrumentId, nonCashIds));
  const priceByInstrument = new Map(
    priceRows.map((p) => [p.instrumentId, p] as const),
  );

  return rows.map(({ inst, qty }) => {
    if (inst.kind === "cash_account") {
      const cur =
        inst.cashCurrency?.trim().toUpperCase() ?? DEFAULT_CASH_CURRENCY;
      const valueEur = nativeToEurStub(qty, cur);
      return {
        valueEur,
        source: "cash",
        detail: `Cash ${qty} ${cur}`,
      };
    }
    const p = priceByInstrument.get(inst.id);
    if (!p) {
      return noQuoteResult();
    }
    const qp = Number.parseFloat(String(p.quotedPrice));
    if (!Number.isFinite(qp)) {
      return noQuoteResult();
    }
    const native = qty * qp;
    const valueEur = nativeToEurStub(native, p.currency);
    return {
      valueEur,
      source: "cached_price",
      detail: `${inst.displayName} @ ${qp} ${p.currency}`,
    };
  });
}
