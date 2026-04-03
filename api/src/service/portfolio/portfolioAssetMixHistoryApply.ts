import type { prices } from "@investments/db";
import { DEFAULT_CASH_CURRENCY } from "@investments/lib/currencies";
import type { InferSelectModel } from "drizzle-orm";
import { calendarDateUtcFromInstant } from "../../lib/calendarDateUtc.js";
import {
  type InstrumentRow,
  buildFxEurPerUnitMapAsOf,
  eurToNativeCashUnits,
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

type HodlInstrumentRef = Pick<InstrumentRow, "kind" | "cashCurrency">;

function sumCashAccountsEur(
  qty: Map<number, number>,
  instrumentById: ReadonlyMap<number, HodlInstrumentRef>,
  fxMap: Map<string, number>,
): number {
  return [...qty.entries()].reduce((sum, [id, q]) => {
    if (!(q > 0)) {
      return sum;
    }
    const inst = instrumentById.get(id);
    if (!inst || inst.kind !== "cash_account") {
      return sum;
    }
    const cur =
      inst.cashCurrency?.trim().toUpperCase() ?? DEFAULT_CASH_CURRENCY;
    return sum + nativeToEur(q, cur, fxMap);
  }, 0);
}

function drainCashUpToEur(
  qty: Map<number, number>,
  instrumentById: ReadonlyMap<number, HodlInstrumentRef>,
  fxMap: Map<string, number>,
  capEur: number,
): number {
  if (!(capEur > 0)) {
    return 0;
  }
  let removedEur = 0;
  let remaining = capEur;
  const cashIds = [...instrumentById.keys()]
    .filter((id) => instrumentById.get(id)?.kind === "cash_account")
    .filter((id) => (qty.get(id) ?? 0) > 0)
    .sort((a, b) => a - b);
  for (const id of cashIds) {
    if (!(remaining > 0)) {
      break;
    }
    const q = qty.get(id) ?? 0;
    if (!(q > 0)) {
      continue;
    }
    const inst = instrumentById.get(id);
    if (!inst || inst.kind !== "cash_account") {
      continue;
    }
    const cur =
      inst.cashCurrency?.trim().toUpperCase() ?? DEFAULT_CASH_CURRENCY;
    const capNativeEur = nativeToEur(q, cur, fxMap);
    const takeEur = Math.min(remaining, capNativeEur);
    const deltaNative = eurToNativeCashUnits(takeEur, cur, fxMap);
    const actualDelta = Math.min(q, deltaNative);
    const actualRemovedEur = nativeToEur(actualDelta, cur, fxMap);
    const newQ = q - actualDelta;
    if (newQ === 0) {
      qty.delete(id);
    } else {
      qty.set(id, newQ);
    }
    removedEur += actualRemovedEur;
    remaining -= actualRemovedEur;
  }
  return removedEur;
}

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
  virtualLeverageEur: { value: number },
  asOfEnd: Date,
  instrumentById: ReadonlyMap<number, HodlInstrumentRef>,
  fxInstRows: InstrumentRow[],
  fxPricesByInstrument: Map<number, InferSelectModel<typeof prices>[]>,
  fxMapByTradeDate: Map<string, Map<string, number>>,
  /**
   * Portfolio cash in EUR (FX as of trade date) is not reduced below this total: reversing security
   * sells and cash withdrawals only remove `max(0, totalCashEur - target)` EUR from accounts.
   */
  emergencyFundTargetEur = 0,
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
      if (instrumentById.get(t.instrumentId)?.kind === "cash_account") {
        const inst = instrumentById.get(t.instrumentId);
        if (!inst) {
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
        const up = Number.parseFloat(String(t.unitPrice));
        const depositNative = Number.isFinite(up) ? q * up : q;
        const depositEur = nativeToEur(depositNative, t.currency, fxMap);
        const cur =
          inst.cashCurrency?.trim().toUpperCase() ?? DEFAULT_CASH_CURRENCY;
        const prev = qty.get(t.instrumentId) ?? 0;
        if (virtualLeverageEur.value < 0 && depositEur > 0) {
          const debtEur = -virtualLeverageEur.value;
          const towardDebtEur = Math.min(depositEur, debtEur);
          virtualLeverageEur.value += towardDebtEur;
          const toCashEur = depositEur - towardDebtEur;
          const addNative = eurToNativeCashUnits(toCashEur, cur, fxMap);
          const next = prev + addNative;
          if (next === 0) {
            qty.delete(t.instrumentId);
          } else {
            qty.set(t.instrumentId, next);
          }
        } else {
          const next = prev + q;
          if (next === 0) {
            qty.delete(t.instrumentId);
          } else {
            qty.set(t.instrumentId, next);
          }
        }
        continue;
      }
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
      const inst = instrumentById.get(t.instrumentId);
      if (!inst) {
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
      const up = Number.parseFloat(String(t.unitPrice));
      const prev = qty.get(t.instrumentId) ?? 0;
      const proceedsNative = Number.isFinite(up) ? q * up : q;
      const proceedsEur = nativeToEur(proceedsNative, t.currency, fxMap);
      const cur =
        inst.cashCurrency?.trim().toUpperCase() ?? DEFAULT_CASH_CURRENCY;
      const totalCashEur = sumCashAccountsEur(qty, instrumentById, fxMap);
      const maxRemovableEur = Math.max(
        0,
        totalCashEur - emergencyFundTargetEur,
      );
      const availableCashEur = nativeToEur(Math.max(0, prev), cur, fxMap);
      const targetRemovalEur = Math.min(
        proceedsEur,
        maxRemovableEur,
        availableCashEur,
      );
      let actualDelta = 0;
      if (targetRemovalEur > 0) {
        const deltaNative = eurToNativeCashUnits(targetRemovalEur, cur, fxMap);
        actualDelta = Math.min(prev, deltaNative);
      }
      const removedEur = nativeToEur(actualDelta, cur, fxMap);
      const overflowEur = proceedsEur - removedEur;
      if (overflowEur > 0) {
        virtualLeverageEur.value -= overflowEur;
      }
      const next = prev - actualDelta;
      if (next <= 0) {
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
    const proceedsEur = nativeToEur(proceedsNative, t.currency, fxMap);
    const totalCashEur = sumCashAccountsEur(qty, instrumentById, fxMap);
    const maxDrainableEur = Math.max(0, totalCashEur - emergencyFundTargetEur);
    const drainCapEur = Math.min(proceedsEur, maxDrainableEur);
    const fromCashEur = drainCashUpToEur(
      qty,
      instrumentById,
      fxMap,
      drainCapEur,
    );
    virtualLeverageEur.value -= proceedsEur - fromCashEur;
  }
}
