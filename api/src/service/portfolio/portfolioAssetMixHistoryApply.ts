import type { prices } from "@investments/db";
import type { InferSelectModel } from "drizzle-orm";
import { calendarDateUtcFromInstant } from "../../lib/calendarDateUtc.js";
import {
  type InstrumentRow,
  buildFxEurPerUnitMapAsOf,
  nativeToEur,
} from "./valuation.js";

export type AssetMixHistoryTxRow = {
  tradeDate: Date;
  instrumentId: number;
  side: string;
  quantity: string;
  unitPrice: string;
  currency: string;
};

export function applyTransactionsUpToActual(
  txRows: AssetMixHistoryTxRow[],
  state: { i: number },
  qty: Map<number, number>,
  asOfEnd: Date,
): void {
  while (state.i < txRows.length) {
    const t = txRows[state.i];
    if (!t || t.tradeDate > asOfEnd) {
      break;
    }
    state.i++;
    const q = Number.parseFloat(String(t.quantity));
    if (!Number.isFinite(q)) {
      continue;
    }
    const delta = t.side === "buy" ? q : -q;
    const prev = qty.get(t.instrumentId) ?? 0;
    const next = prev + delta;
    if (next === 0) {
      qty.delete(t.instrumentId);
    } else {
      qty.set(t.instrumentId, next);
    }
  }
}

export function applyTransactionsUpToHodl(
  txRows: AssetMixHistoryTxRow[],
  state: { i: number },
  qty: Map<number, number>,
  virtualInputMoneyEur: { value: number },
  asOfEnd: Date,
  instrumentById: ReadonlyMap<number, { kind: string }>,
  fxInstRows: InstrumentRow[],
  fxPricesByInstrument: Map<number, InferSelectModel<typeof prices>[]>,
  fxMapByTradeDate: Map<string, Map<string, number>>,
): void {
  while (state.i < txRows.length) {
    const t = txRows[state.i];
    if (!t || t.tradeDate > asOfEnd) {
      break;
    }
    state.i++;
    const q = Number.parseFloat(String(t.quantity));
    if (!Number.isFinite(q)) {
      continue;
    }
    if (t.side === "buy") {
      const prev = qty.get(t.instrumentId) ?? 0;
      const next = prev + q;
      if (next === 0) {
        qty.delete(t.instrumentId);
      } else {
        qty.set(t.instrumentId, next);
      }
      continue;
    }
    if (instrumentById.get(t.instrumentId)?.kind === "cash_account") {
      const prev = qty.get(t.instrumentId) ?? 0;
      const next = prev - q;
      if (next === 0) {
        qty.delete(t.instrumentId);
      } else {
        qty.set(t.instrumentId, next);
      }
      continue;
    }
    const up = Number.parseFloat(String(t.unitPrice));
    if (!Number.isFinite(up)) {
      continue;
    }
    const tradeDateStr = calendarDateUtcFromInstant(new Date(t.tradeDate));
    let fxMap = fxMapByTradeDate.get(tradeDateStr);
    if (!fxMap) {
      fxMap = buildFxEurPerUnitMapAsOf(
        fxInstRows,
        fxPricesByInstrument,
        tradeDateStr,
      );
      fxMapByTradeDate.set(tradeDateStr, fxMap);
    }
    const proceedsNative = q * up;
    virtualInputMoneyEur.value -= nativeToEur(
      proceedsNative,
      t.currency,
      fxMap,
    );
  }
}
