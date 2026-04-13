import { describe, expect, it } from "vitest";
import { yahooSymbolLookupCandidates } from "./ibkrResolveInstruments.js";
import {
  isIbkrFxRow,
  normalizeIbkrIsin,
  parseIbkrDecimalString,
  parseIbkrTransactionsCsv,
} from "./ibkrTransactions.js";

describe("parseIbkrDecimalString", () => {
  it("accepts dot decimals", () => {
    expect(parseIbkrDecimalString("50.0")).toBe("50.0");
    expect(parseIbkrDecimalString("9.752")).toBe("9.752");
  });

  it("returns null for dash placeholder", () => {
    expect(parseIbkrDecimalString("-")).toBeNull();
  });
});

describe("yahooSymbolLookupCandidates", () => {
  it("includes space variants", () => {
    expect(yahooSymbolLookupCandidates("BRK B")).toEqual(
      expect.arrayContaining(["BRK B", "BRKB", "BRK-B", "BRK.B"]),
    );
  });
});

const SAMPLE_IBKR_FLAT_CSV = `"ClientAccountID","DateTime","Symbol","ISIN","Description","Exchange","TransactionType","Quantity","TradePrice","CurrencyPrimary","IBCommission"
"U22473172","2026-03-27 11:51:58 EDT","SPYI","IE00B3YLTY66","SP MS ALL CO WI MKT UC ET-AC","IBIS2","ExchTrade","50","9.752","EUR","-1.2914544"
"U22473172","2025-11-14 11:36:04 EST","SPYL","IE000XZSV718","SPDR S&P 500 UCITS ETF ACC","GETTEX2","ExchTrade","20","14.292","EUR","-1.25"
"U22473172","2025-10-13 14:45:07 EDT","BRK B","US0846707026","BERKSHIRE HATHAWAY INC-CL B","IBKRATS","ExchTrade","1","491.71","USD","-0.35047925"
"U22473172","2025-10-13 14:45:08 EDT","EUR.USD","","EUR.USD","IDEALFX","ExchTrade","-0.31","1.15666","USD","0"
"U22473172","2025-10-13 14:45:08 EDT","EUR.USD","","EUR.USD","IDEALFX","ExchTrade","-425.02","1.15673","USD","0"
`;

/** Flat trades export: `Date/Time`, `Buy/Sell`, `Price` (not `DateTime` / `ExchTrade` / `TradePrice`). */
const SAMPLE_IBKR_FLAT_TRADES_CSV = `"ClientAccountID","Date/Time","Symbol","ISIN","Description","Exchange","Buy/Sell","Quantity","Price","Commission","CurrencyPrimary"
"U22473172","2026-03-30 11:23:43 EDT","SPYI","IE00B3YLTY66","SP MS ALL CO WI MKT UC ET-AC","IBIS2","BUY","50","9.76","-1.291472","EUR"
`;

describe("parseIbkrTransactionsCsv", () => {
  it("rejects Statement-style Transaction History CSV", () => {
    const csv = [
      "Transaction History,Header,Date,Account,Description,Transaction Type,Symbol,Quantity,Price,Price Currency,Gross Amount ,Commission,Net Amount",
      "Transaction History,Data,2026-03-27,U***1,X,Buy,ABC,1,10,EUR,-10,-,-10",
    ].join("\n");
    const result = parseIbkrTransactionsCsv(csv);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errors.some((e) => e.includes("Statement-style"))).toBe(true);
  });

  it("parses flat Activity CSV with ISIN and skips FX", () => {
    const result = parseIbkrTransactionsCsv(SAMPLE_IBKR_FLAT_CSV);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.rows).toHaveLength(3);
    const spyi = result.rows.find((r) => r.symbolRaw === "SPYI");
    expect(spyi?.isin).toBe("IE00B3YLTY66");
    expect(spyi?.side).toBe("buy");
    expect(spyi?.quantity).toBe("50");
    expect(spyi?.tradeDate).toBe("2026-03-27T15:51:58.000Z");
    const spyl = result.rows.find((r) => r.symbolRaw === "SPYL");
    expect(spyl?.tradeDate).toBe("2025-11-14T16:36:04.000Z");
    const brk = result.rows.find((r) => r.symbolRaw === "BRK B");
    expect(brk?.isin).toBe("US0846707026");
    expect(brk?.tradeDate).toBe("2025-10-13T18:45:07.000Z");
  });

  it("parses flat trades CSV (Date/Time, Buy/Sell, Price, CurrencyPrimary)", () => {
    const result = parseIbkrTransactionsCsv(SAMPLE_IBKR_FLAT_TRADES_CSV);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.rows).toHaveLength(1);
    const spyi = result.rows[0];
    expect(spyi).toBeDefined();
    if (spyi === undefined) {
      return;
    }
    expect(spyi.symbolRaw).toBe("SPYI");
    expect(spyi.isin).toBe("IE00B3YLTY66");
    expect(spyi.side).toBe("buy");
    expect(spyi.quantity).toBe("50");
    expect(spyi.unitPrice).toBe("9.76");
    expect(spyi.currency).toBe("EUR");
    expect(spyi.tradeDate).toBe("2026-03-30T15:23:43.000Z");
  });
});

describe("normalizeIbkrIsin", () => {
  it("accepts 12-char ISIN", () => {
    expect(normalizeIbkrIsin("IE00B3YLTY66")).toBe("IE00B3YLTY66");
  });

  it("returns null for empty or dash placeholder", () => {
    expect(normalizeIbkrIsin("")).toBeNull();
    expect(normalizeIbkrIsin("-")).toBeNull();
  });
});

describe("isIbkrFxRow", () => {
  it("detects IDEALFX and EUR.USD", () => {
    expect(isIbkrFxRow("EUR.USD", "IDEALFX")).toBe(true);
    expect(isIbkrFxRow("SPYI", "IBIS2")).toBe(false);
  });
});
