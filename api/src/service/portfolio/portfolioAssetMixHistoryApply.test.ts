import { describe, expect, it } from "vitest";
import {
  type AssetMixHistoryTxRow,
  applyTransactionsUpToActual,
  applyTransactionsUpToHodl,
} from "./portfolioAssetMixHistoryApply.js";
import type { InstrumentRow } from "./valuation.js";

const d = (s: string) => new Date(`${s}T12:00:00.000Z`);
const end = (s: string) => new Date(`${s}T23:59:59.999Z`);

const emptyFxInsts: InstrumentRow[] = [];
const emptyFxPrices = new Map();

const inst = (
  kind: InstrumentRow["kind"],
  cashCurrency?: string | null,
): Pick<InstrumentRow, "kind" | "cashCurrency"> => ({
  kind,
  cashCurrency: cashCurrency ?? null,
});

describe("applyTransactionsUpToActual", () => {
  it("reduces quantity on sell", () => {
    const txs: AssetMixHistoryTxRow[] = [
      {
        tradeDate: d("2020-01-01"),
        instrumentId: 1,
        side: "buy",
        quantity: "10",
        unitPrice: "1",
        currency: "EUR",
      },
      {
        tradeDate: d("2020-01-02"),
        instrumentId: 1,
        side: "sell",
        quantity: "4",
        unitPrice: "2",
        currency: "EUR",
      },
    ];
    const qty = new Map<number, number>();
    const state = { i: 0 };
    applyTransactionsUpToActual(txs, state, qty, end("2020-01-03"));
    expect(qty.get(1)).toBe(6);
  });

  it("stops at asOf end", () => {
    const txs: AssetMixHistoryTxRow[] = [
      {
        tradeDate: d("2020-01-01"),
        instrumentId: 1,
        side: "buy",
        quantity: "10",
        unitPrice: "1",
        currency: "EUR",
      },
      {
        tradeDate: d("2020-01-10"),
        instrumentId: 1,
        side: "sell",
        quantity: "10",
        unitPrice: "1",
        currency: "EUR",
      },
    ];
    const qty = new Map<number, number>();
    const state = { i: 0 };
    applyTransactionsUpToActual(txs, state, qty, end("2020-01-05"));
    expect(qty.get(1)).toBe(10);
    expect(state.i).toBe(1);
  });
});

describe("applyTransactionsUpToHodl", () => {
  it("keeps buy quantity through sells and accumulates negative virtual EUR when no cash", () => {
    const txs: AssetMixHistoryTxRow[] = [
      {
        tradeDate: d("2020-01-01"),
        instrumentId: 1,
        side: "buy",
        quantity: "10",
        unitPrice: "1",
        currency: "EUR",
      },
      {
        tradeDate: d("2020-01-02"),
        instrumentId: 1,
        side: "sell",
        quantity: "4",
        unitPrice: "2",
        currency: "EUR",
      },
    ];
    const qty = new Map<number, number>();
    const state = { i: 0 };
    const virtual = { value: 0 };
    applyTransactionsUpToHodl(
      txs,
      state,
      qty,
      virtual,
      end("2020-01-03"),
      new Map([[1, inst("etf")]]),
      emptyFxInsts,
      emptyFxPrices,
      new Map(),
    );
    expect(qty.get(1)).toBe(10);
    expect(virtual.value).toBe(-8);
  });

  it("drains cash before virtual leverage on security sells", () => {
    const txs: AssetMixHistoryTxRow[] = [
      {
        tradeDate: d("2020-01-01"),
        instrumentId: 99,
        side: "buy",
        quantity: "100",
        unitPrice: "1",
        currency: "EUR",
      },
      {
        tradeDate: d("2020-01-01"),
        instrumentId: 1,
        side: "buy",
        quantity: "10",
        unitPrice: "1",
        currency: "EUR",
      },
      {
        tradeDate: d("2020-01-02"),
        instrumentId: 1,
        side: "sell",
        quantity: "4",
        unitPrice: "2",
        currency: "EUR",
      },
    ];
    const qty = new Map<number, number>();
    const state = { i: 0 };
    const virtual = { value: 0 };
    applyTransactionsUpToHodl(
      txs,
      state,
      qty,
      virtual,
      end("2020-01-03"),
      new Map<number, Pick<InstrumentRow, "kind" | "cashCurrency">>([
        [1, inst("etf")],
        [99, inst("cash_account", "EUR")],
      ]),
      emptyFxInsts,
      emptyFxPrices,
      new Map(),
    );
    expect(qty.get(1)).toBe(10);
    expect(qty.get(99)).toBe(92);
    expect(virtual.value).toBe(0);
  });

  it("does not drain cash reserved for emergency fund when reversing security sells", () => {
    const txs: AssetMixHistoryTxRow[] = [
      {
        tradeDate: d("2020-01-01"),
        instrumentId: 99,
        side: "buy",
        quantity: "100",
        unitPrice: "1",
        currency: "EUR",
      },
      {
        tradeDate: d("2020-01-01"),
        instrumentId: 1,
        side: "buy",
        quantity: "10",
        unitPrice: "1",
        currency: "EUR",
      },
      {
        tradeDate: d("2020-01-02"),
        instrumentId: 1,
        side: "sell",
        quantity: "4",
        unitPrice: "2",
        currency: "EUR",
      },
    ];
    const qty = new Map<number, number>();
    const state = { i: 0 };
    const virtual = { value: 0 };
    applyTransactionsUpToHodl(
      txs,
      state,
      qty,
      virtual,
      end("2020-01-03"),
      new Map<number, Pick<InstrumentRow, "kind" | "cashCurrency">>([
        [1, inst("etf")],
        [99, inst("cash_account", "EUR")],
      ]),
      emptyFxInsts,
      emptyFxPrices,
      new Map(),
      95,
    );
    expect(qty.get(1)).toBe(10);
    expect(qty.get(99)).toBe(95);
    expect(virtual.value).toBe(-3);
  });

  it("spills proceeds past cash to virtual leverage", () => {
    const txs: AssetMixHistoryTxRow[] = [
      {
        tradeDate: d("2020-01-01"),
        instrumentId: 99,
        side: "buy",
        quantity: "5",
        unitPrice: "1",
        currency: "EUR",
      },
      {
        tradeDate: d("2020-01-01"),
        instrumentId: 1,
        side: "buy",
        quantity: "10",
        unitPrice: "1",
        currency: "EUR",
      },
      {
        tradeDate: d("2020-01-02"),
        instrumentId: 1,
        side: "sell",
        quantity: "4",
        unitPrice: "2",
        currency: "EUR",
      },
    ];
    const qty = new Map<number, number>();
    const state = { i: 0 };
    const virtual = { value: 0 };
    applyTransactionsUpToHodl(
      txs,
      state,
      qty,
      virtual,
      end("2020-01-03"),
      new Map<number, Pick<InstrumentRow, "kind" | "cashCurrency">>([
        [1, inst("etf")],
        [99, inst("cash_account", "EUR")],
      ]),
      emptyFxInsts,
      emptyFxPrices,
      new Map(),
    );
    expect(qty.get(1)).toBe(10);
    expect(qty.has(99)).toBe(false);
    expect(virtual.value).toBe(-3);
  });

  it("reduces cash quantity on sell like actual and does not change virtual EUR", () => {
    const txs: AssetMixHistoryTxRow[] = [
      {
        tradeDate: d("2020-01-01"),
        instrumentId: 99,
        side: "buy",
        quantity: "1000",
        unitPrice: "1",
        currency: "EUR",
      },
      {
        tradeDate: d("2020-01-02"),
        instrumentId: 99,
        side: "sell",
        quantity: "200",
        unitPrice: "1",
        currency: "EUR",
      },
    ];
    const qty = new Map<number, number>();
    const state = { i: 0 };
    const virtual = { value: 0 };
    applyTransactionsUpToHodl(
      txs,
      state,
      qty,
      virtual,
      end("2020-01-03"),
      new Map([[99, inst("cash_account", "EUR")]]),
      emptyFxInsts,
      emptyFxPrices,
      new Map(),
    );
    expect(qty.get(99)).toBe(800);
    expect(virtual.value).toBe(0);
  });

  it("books cash withdrawal past balance as virtual leverage", () => {
    const txs: AssetMixHistoryTxRow[] = [
      {
        tradeDate: d("2020-01-01"),
        instrumentId: 99,
        side: "buy",
        quantity: "100",
        unitPrice: "1",
        currency: "EUR",
      },
      {
        tradeDate: d("2020-01-02"),
        instrumentId: 99,
        side: "sell",
        quantity: "150",
        unitPrice: "1",
        currency: "EUR",
      },
    ];
    const qty = new Map<number, number>();
    const state = { i: 0 };
    const virtual = { value: 0 };
    applyTransactionsUpToHodl(
      txs,
      state,
      qty,
      virtual,
      end("2020-01-03"),
      new Map([[99, inst("cash_account", "EUR")]]),
      emptyFxInsts,
      emptyFxPrices,
      new Map(),
    );
    expect(qty.has(99)).toBe(false);
    expect(virtual.value).toBe(-50);
  });
});
