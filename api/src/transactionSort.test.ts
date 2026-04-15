import {
  assignTradeOrderKeysInEncounterOrder,
  compareTransactionsChronological,
  compareTransactionsNewestFirst,
  formatTradeOrderOrdinal,
} from "@investments/lib/transactionSort";
import { describe, expect, it } from "vitest";

describe("formatTradeOrderOrdinal", () => {
  it("zero-pads", () => {
    expect(formatTradeOrderOrdinal(0)).toBe("000000");
    expect(formatTradeOrderOrdinal(42)).toBe("000042");
  });
});

describe("assignTradeOrderKeysInEncounterOrder", () => {
  it("counts per calendar day from ISO timestamps", () => {
    const rows: { tradeDate: string; tradeOrderKey?: string }[] = [
      { tradeDate: "2026-01-01T00:00:00.000Z" },
      { tradeDate: "2026-01-01T12:00:00.000Z" },
      { tradeDate: "2026-01-02T00:00:00.000Z" },
    ];
    assignTradeOrderKeysInEncounterOrder(rows);
    expect(rows[0]?.tradeOrderKey).toBe("000000");
    expect(rows[1]?.tradeOrderKey).toBe("000001");
    expect(rows[2]?.tradeOrderKey).toBe("000000");
  });
});

describe("compareTransactionsNewestFirst", () => {
  it("orders same day by ascending tradeOrderKey then id desc", () => {
    const a = {
      tradeDate: "2026-01-01T00:00:00.000Z",
      tradeOrderKey: "000001",
      id: 1,
    };
    const b = {
      tradeDate: "2026-01-01T00:00:00.000Z",
      tradeOrderKey: "000000",
      id: 2,
    };
    expect(compareTransactionsNewestFirst(a, b)).toBeGreaterThan(0);
    expect(compareTransactionsNewestFirst(b, a)).toBeLessThan(0);
  });
});

describe("compareTransactionsChronological", () => {
  it("orders same day by descending tradeOrderKey then id asc", () => {
    const top = {
      tradeDate: "2026-01-01T00:00:00.000Z",
      tradeOrderKey: "000000",
      id: 1,
    };
    const bottom = {
      tradeDate: "2026-01-01T00:00:00.000Z",
      tradeOrderKey: "000001",
      id: 2,
    };
    expect(compareTransactionsChronological(bottom, top)).toBeLessThan(0);
    expect(compareTransactionsChronological(top, bottom)).toBeGreaterThan(0);
  });
});
