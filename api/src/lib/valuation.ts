import { instruments, type prices } from "@investments/db";
import { DEFAULT_CASH_CURRENCY } from "@investments/lib";
import type { InferSelectModel } from "drizzle-orm";
import { eq } from "drizzle-orm";
import type { DbClient } from "../db.js";
import { db } from "../db.js";
import {
  loadLatestPriceRowsByInstrumentIds,
  pickLatestPriceRowAsOf,
} from "./latestPriceDistribution.js";

export type InstrumentRow = InferSelectModel<typeof instruments>;
type ValuationResult = {
  valueEur: number;
  source: "cached_price" | "cash" | "none";
  detail: string;
};

/** Fallback when no `fx` instrument price exists for USD. */
const STUB_EUR_PER_USD = 0.92;

function nativeToEur(
  amount: number,
  currency: string | undefined,
  eurPerUnitByForeign: Map<string, number>,
): number {
  const c = (currency ?? "EUR").toUpperCase();
  if (c === "EUR") {
    return amount;
  }
  const rate = eurPerUnitByForeign.get(c);
  if (rate !== undefined && Number.isFinite(rate) && rate > 0) {
    return amount * rate;
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

/**
 * Latest EUR per 1 unit of each foreign currency from `kind = fx` instruments (`prices.currency` EUR).
 */
async function loadEurPerUnitByForeignCurrency(
  d: DbClient,
): Promise<Map<string, number>> {
  const fxRows = await d
    .select()
    .from(instruments)
    .where(eq(instruments.kind, "fx"));
  const ids = fxRows.map((r) => r.id);
  if (ids.length === 0) {
    return new Map();
  }
  const pricesMap = await loadLatestPriceRowsByInstrumentIds(d, ids);
  const out = new Map<string, number>();
  for (const inst of fxRows) {
    const fc = inst.fxForeignCurrency?.trim().toUpperCase();
    if (!fc) {
      continue;
    }
    const p = pricesMap.get(inst.id);
    if (!p) {
      continue;
    }
    const qp = Number.parseFloat(String(p.quotedPrice));
    if (!Number.isFinite(qp) || !(qp > 0)) {
      continue;
    }
    if (p.currency.trim().toUpperCase() !== "EUR") {
      continue;
    }
    out.set(fc, qp);
  }
  return out;
}

/**
 * EUR per 1 unit of foreign currency as of `asOfDate` (from `fx` instrument price rows).
 */
export function buildFxEurPerUnitMapAsOf(
  fxInsts: InstrumentRow[],
  fxPricesByInstrument: Map<number, InferSelectModel<typeof prices>[]>,
  asOfDate: string,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const inst of fxInsts) {
    if (inst.kind !== "fx") {
      continue;
    }
    const fc = inst.fxForeignCurrency?.trim().toUpperCase();
    if (!fc) {
      continue;
    }
    const rows = fxPricesByInstrument.get(inst.id);
    if (!rows?.length) {
      continue;
    }
    const p = pickLatestPriceRowAsOf(rows, asOfDate);
    if (!p) {
      continue;
    }
    const qp = Number.parseFloat(String(p.quotedPrice));
    if (!Number.isFinite(qp) || !(qp > 0)) {
      continue;
    }
    if (p.currency.trim().toUpperCase() !== "EUR") {
      continue;
    }
    out.set(fc, qp);
  }
  return out;
}

/** Uses a pre-fetched map of one `prices` row per instrument (caller picks which row, e.g. latest as-of date). */
export function valuePortfolioRowsFromPriceMap(
  rows: Array<{ inst: InstrumentRow; qty: number }>,
  priceByInstrument: Map<number, InferSelectModel<typeof prices>>,
  eurPerUnitByForeign: Map<string, number> = new Map(),
): ValuationResult[] {
  return rows.map(({ inst, qty }) => {
    if (inst.kind === "cash_account") {
      const cur =
        inst.cashCurrency?.trim().toUpperCase() ?? DEFAULT_CASH_CURRENCY;
      const valueEur = nativeToEur(qty, cur, eurPerUnitByForeign);
      return {
        valueEur,
        source: "cash",
        detail: `Cash ${qty} ${cur}`,
      };
    }
    if (inst.kind === "fx") {
      return noQuoteResult();
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
    const valueEur = nativeToEur(native, p.currency, eurPerUnitByForeign);
    return {
      valueEur,
      source: "cached_price",
      detail: `${inst.displayName} @ ${qp} ${p.currency}`,
    };
  });
}

export async function valuePortfolioRowsEur(
  rows: Array<{ inst: InstrumentRow; qty: number }>,
): Promise<ValuationResult[]> {
  const eurPerUnitByForeign = await loadEurPerUnitByForeignCurrency(db);
  const nonCashIds = [
    ...new Set(
      rows.filter((r) => r.inst.kind !== "cash_account").map((r) => r.inst.id),
    ),
  ];
  const priceByInstrument = await loadLatestPriceRowsByInstrumentIds(
    db,
    nonCashIds,
  );

  return rows.map(({ inst, qty }) => {
    if (inst.kind === "cash_account") {
      const cur =
        inst.cashCurrency?.trim().toUpperCase() ?? DEFAULT_CASH_CURRENCY;
      const valueEur = nativeToEur(qty, cur, eurPerUnitByForeign);
      return {
        valueEur,
        source: "cash",
        detail: `Cash ${qty} ${cur}`,
      };
    }
    if (inst.kind === "fx") {
      return noQuoteResult();
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
    const valueEur = nativeToEur(native, p.currency, eurPerUnitByForeign);
    return {
      valueEur,
      source: "cached_price",
      detail: `${inst.displayName} @ ${qp} ${p.currency}`,
    };
  });
}
