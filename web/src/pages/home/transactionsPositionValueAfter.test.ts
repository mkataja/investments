import { describe, expect, it } from "vitest";
import {
  parseTransactionNumericField,
  positionValueAfterLabelByTransactionId,
} from "./transactionsPositionValueAfter";
import type { HomeInstrument, HomeTransaction } from "./types";

function cashInst(id: number): HomeInstrument {
  return {
    id,
    kind: "cash_account",
    displayName: "EUR",
    yahooSymbol: null,
    seligsonFund: null,
    cashCurrency: "EUR",
    distribution: null,
  };
}

describe("parseTransactionNumericField", () => {
  it("parses comma decimals and strips spaces", () => {
    expect(parseTransactionNumericField("1 000,50")).toBe(1000.5);
    expect(parseTransactionNumericField("1000,00")).toBe(1000);
  });

  it("accepts numbers from JSON", () => {
    expect(parseTransactionNumericField(17000)).toBe(17000);
  });
});

describe("positionValueAfterLabelByTransactionId", () => {
  it("adds quantity × unit price for cash deposits", () => {
    const instrumentById = new Map<number, HomeInstrument>([[1, cashInst(1)]]);
    const transactions: HomeTransaction[] = [
      {
        id: 1,
        portfolioId: 1,
        brokerId: 1,
        tradeDate: "2026-01-01T12:00:00.000Z",
        side: "buy",
        instrumentId: 1,
        quantity: "17000",
        unitPrice: "1",
        currency: "EUR",
      },
      {
        id: 2,
        portfolioId: 1,
        brokerId: 1,
        tradeDate: "2026-01-02T12:00:00.000Z",
        side: "buy",
        instrumentId: 1,
        quantity: "1",
        unitPrice: "1000",
        currency: "EUR",
      },
    ];
    const m = positionValueAfterLabelByTransactionId(
      transactions,
      instrumentById,
    );
    expect(m.get(1)).toContain("17000");
    expect(m.get(2)).toContain("18000");
  });

  it("parses European amount strings so the running balance updates", () => {
    const instrumentById = new Map<number, HomeInstrument>([[1, cashInst(1)]]);
    const transactions: HomeTransaction[] = [
      {
        id: 1,
        portfolioId: 1,
        brokerId: 1,
        tradeDate: "2026-01-01T12:00:00.000Z",
        side: "buy",
        instrumentId: 1,
        quantity: "17000,00",
        unitPrice: "1",
        currency: "EUR",
      },
      {
        id: 2,
        portfolioId: 1,
        brokerId: 1,
        tradeDate: "2026-01-02T12:00:00.000Z",
        side: "buy",
        instrumentId: 1,
        quantity: "1000,00",
        unitPrice: "1",
        currency: "EUR",
      },
    ];
    const m = positionValueAfterLabelByTransactionId(
      transactions,
      instrumentById,
    );
    expect(m.get(2)).toContain("18000");
  });
});
