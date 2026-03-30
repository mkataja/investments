import { describe, expect, it } from "vitest";
import { yahooSymbolLookupCandidates } from "./ibkrResolveInstruments.js";
import {
  ibkrUnitPriceToEurStub,
  isIbkrFxRow,
  normalizeIbkrIsin,
  parseIbkrDecimalString,
  parseIbkrTransactionsCsv,
} from "./ibkrTransactions.js";

/** Minimal IBKR Activity CSV shape (Statement / Summary rows ignored). */
const SAMPLE_IBKR_CSV = `Statement,Header,Field Name,Field Value
Transaction History,Header,Date,Account,Description,Transaction Type,Symbol,Quantity,Price,Price Currency,Gross Amount ,Commission,Net Amount
Transaction History,Data,2026-03-27,U***73172,SP MS ALL CO WI MKT UC ET-AC,Buy,SPYI,50.0,9.752,EUR,-487.6,-1.2914544,-488.89145440000004
Transaction History,Data,2026-03-25,U***73172,Electronic Fund Transfer,Deposit,-,-,-,-,400.0,-,400.0
Transaction History,Data,2025-11-14,U***73172,SPDR S&P 500 UCITS ETF ACC,Buy,SPYL,20.0,14.292,EUR,-285.84,-1.25,-287.09
Transaction History,Data,2025-10-13,U***73172,Net Amount in Base from Forex Trade: -0.06 EUR.USD,Forex Trade Component,EUR.USD,-0.06,1.15673,USD,-1.5683735999992565E-5,-,-1.5683735999992565E-5
Transaction History,Data,2025-10-13,U***73172,BERKSHIRE HATHAWAY INC-CL B,Buy,BRK B,1.0,491.71,USD,-424.9751188,-0.30291220619000003,-425.27803100618996
Transaction History,Data,2025-10-11,U***73172,Electronic Fund Transfer,Deposit,-,-,-,-,1000.0,-,1000.0
`;

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

const SAMPLE_IBKR_FLAT_CSV = `"ClientAccountID","DateTime","Symbol","ISIN","Description","Exchange","TransactionType","Quantity","TradePrice","CurrencyPrimary","IBCommission","IBCommissionCurrency"
"U22473172","2026-03-27 11:51:58 EDT","SPYI","IE00B3YLTY66","SP MS ALL CO WI MKT UC ET-AC","IBIS2","ExchTrade","50","9.752","EUR","-1.2914544","EUR"
"U22473172","2025-11-14 11:36:04 EST","SPYL","IE000XZSV718","SPDR S&P 500 UCITS ETF ACC","GETTEX2","ExchTrade","20","14.292","EUR","-1.25","EUR"
"U22473172","2025-10-13 14:45:07 EDT","BRK B","US0846707026","BERKSHIRE HATHAWAY INC-CL B","IBKRATS","ExchTrade","1","491.71","USD","-0.35047925","USD"
"U22473172","2025-10-13 14:45:08 EDT","EUR.USD","","EUR.USD","IDEALFX","ExchTrade","-0.31","1.15666","USD","0","EUR"
"U22473172","2025-10-13 14:45:08 EDT","EUR.USD","","EUR.USD","IDEALFX","ExchTrade","-425.02","1.15673","USD","0","EUR"
`;

/** Flat trades export: `Date/Time`, `Buy/Sell`, `Price` (not `DateTime` / `ExchTrade` / `TradePrice`). */
const SAMPLE_IBKR_FLAT_TRADES_CSV = `"ClientAccountID","Date/Time","Symbol","ISIN","Description","Exchange","Buy/Sell","Quantity","Price","Commission","CommissionCurrency"
"U22473172","2026-03-30 11:23:43 EDT","SPYI","IE00B3YLTY66","SP MS ALL CO WI MKT UC ET-AC","IBIS2","BUY","50","9.76","-1.291472","EUR"
`;

describe("parseIbkrTransactionsCsv", () => {
  it("imports only Transaction History equity rows", () => {
    const result = parseIbkrTransactionsCsv(SAMPLE_IBKR_CSV);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.rows).toHaveLength(3);
    const spyi = result.rows.find((r) => r.symbolRaw === "SPYI");
    expect(spyi?.side).toBe("buy");
    expect(spyi?.quantity).toBe("50");
    expect(spyi?.currency).toBe("EUR");
    expect(spyi?.unitPriceEur).toBe("9.752");
    expect(spyi?.isin).toBeNull();
    const brk = result.rows.find((r) => r.symbolRaw === "BRK B");
    expect(brk?.currency).toBe("USD");
    expect(brk?.unitPrice).toBe("491.71");
    expect(brk?.unitPriceEur).toBe(ibkrUnitPriceToEurStub(491.71, "USD"));
    expect(brk?.isin).toBeNull();
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
    const brk = result.rows.find((r) => r.symbolRaw === "BRK B");
    expect(brk?.isin).toBe("US0846707026");
  });

  it("parses flat trades CSV (Date/Time, Buy/Sell, Price, CommissionCurrency)", () => {
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
    expect(spyi.unitPriceEur).toBe("9.76");
  });

  it("rejects invalid dates in Transaction History data", () => {
    const csv = [
      "Transaction History,Header,Date,Account,Description,Transaction Type,Symbol,Quantity,Price,Price Currency,Gross Amount ,Commission,Net Amount",
      "Transaction History,Data,bad-date,U***1,X,Buy,ABC,1,10,EUR,-10,-,-10",
    ].join("\n");
    const result = parseIbkrTransactionsCsv(csv);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errors.some((e) => e.includes("invalid Date"))).toBe(true);
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
