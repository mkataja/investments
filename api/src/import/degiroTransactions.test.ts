import { parse } from "csv-parse/sync";
import { describe, expect, it } from "vitest";
import {
  DEGIRO_TRANSACTIONS_HEADER,
  degiroDateWallTimeToIsoUtc,
  extractDegiroOrderId,
  fingerprintDegiroRow,
  normalizeDegiroDataRow,
  parseDegiroTradeDateDdMmYyyy,
  parseDegiroTradeTimeHhMm,
  parseDegiroTransactionsCsv,
  parseEuropeanDecimalString,
  shouldSkipDegiroNonTradeRow,
} from "./degiroTransactions.js";

const SAMPLE_ROW =
  '25-03-2026,15:39,ISHARES CORE S&P 500 UCITS ETF USD (ACC),IE00B5BMR087,XET,XETA,−1,"612,7400",EUR,"612,74",EUR,"612,74",,"0,00","−3,00","609,74",,b295869f-bb2d-4824-9a1a-39d3e968bb5d';

function headerLine(): string {
  return `${DEGIRO_TRANSACTIONS_HEADER.join(",")}\n`;
}

describe("parseEuropeanDecimalString", () => {
  it("parses comma decimals and unicode minus", () => {
    expect(parseEuropeanDecimalString("612,7400")).toBe("612.7400");
    expect(parseEuropeanDecimalString("−3,00")).toBe("-3.00");
    expect(parseEuropeanDecimalString("-1,00")).toBe("-1.00");
  });

  it("returns null for invalid input", () => {
    expect(parseEuropeanDecimalString("")).toBeNull();
    expect(parseEuropeanDecimalString("abc")).toBeNull();
  });
});

describe("parseDegiroTradeDateDdMmYyyy", () => {
  it("maps to ISO date", () => {
    expect(parseDegiroTradeDateDdMmYyyy("25-03-2026")).toBe("2026-03-25");
  });

  it("returns null for bad format", () => {
    expect(parseDegiroTradeDateDdMmYyyy("2026-03-25")).toBeNull();
  });
});

describe("parseDegiroTradeTimeHhMm", () => {
  it("normalizes hour and minute", () => {
    expect(parseDegiroTradeTimeHhMm("15:39")).toBe("15:39");
    expect(parseDegiroTradeTimeHhMm("9:05")).toBe("09:05");
  });
});

describe("degiroDateWallTimeToIsoUtc", () => {
  it("combines calendar date and time as UTC wall clock", () => {
    expect(degiroDateWallTimeToIsoUtc("2026-03-25", "15:39")).toBe(
      "2026-03-25T15:39:00.000Z",
    );
  });
});

describe("parseDegiroTransactionsCsv", () => {
  it("accepts a valid Degiro Transactions export line", () => {
    const csv = `${headerLine()}${SAMPLE_ROW}\n`;
    const result = parseDegiroTransactionsCsv(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];
    expect(row?.tradeDate).toBe("2026-03-25T15:39:00.000Z");
    expect(row?.isin).toBe("IE00B5BMR087");
    expect(row?.product).toContain("ISHARES CORE S&P 500");
    expect(row?.referenceExchange).toBe("XET");
    expect(row?.venue).toBe("XETA");
    expect(row?.side).toBe("sell");
    expect(row?.quantity).toBe("1");
    expect(row?.currency).toBe("EUR");
    expect(row?.unitPrice).toBe("612.7400");
    expect(row?.externalId).toBe("b295869f-bb2d-4824-9a1a-39d3e968bb5d");
  });

  it("rejects wrong headers", () => {
    const csv = "Date,Time,Wrong\nfoo,bar,baz\n";
    const result = parseDegiroTransactionsCsv(csv);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errors[0]).toContain("First row");
  });

  it("rejects ragged rows", () => {
    const csv = `${headerLine()}a,b\n`;
    const result = parseDegiroTransactionsCsv(csv);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(
      result.errors.some(
        (e) =>
          e.includes("CSV parse error") ||
          e.includes("column") ||
          e.includes("Expected"),
      ),
    ).toBe(true);
  });

  it("produces stable fingerprints for identical rows", () => {
    const csv = `${headerLine()}${SAMPLE_ROW}\n`;
    const a = parseDegiroTransactionsCsv(csv);
    const b = parseDegiroTransactionsCsv(csv);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) {
      return;
    }
    expect(a.rows[0]?.externalId).toBe(b.rows[0]?.externalId);
  });

  it("normalizes rows when Degiro omits the empty column before Order ID", () => {
    const shortRow =
      '10-05-2023,15:32,ISHARES CORE S&P 500 UCITS ETF USD (ACC),IE00B5BMR087,XET,XETA,−3,"393,1200",EUR,"1179,36",EUR,"1179,36",,"0,00",,"1179,36",ff5b6ebc-da85-40f2-bef2-67002192af88';
    const csv = `${headerLine()}${shortRow}\n`;
    const result = parseDegiroTransactionsCsv(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.quantity).toBe("3");
  });

  it("skips non-trade rows (e.g. missing ISIN) without failing the CSV", () => {
    const feeRow =
      '25-03-2026,15:39,DEGIRO Transaction Fee,,XET,XETA,−1,"1,00",EUR,"1,00",EUR,"1,00",,"0,00","0,00","1,00",,a0000000-0000-4000-8000-000000000001';
    const csv = `${headerLine()}${SAMPLE_ROW}\n${feeRow}\n`;
    const result = parseDegiroTransactionsCsv(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.isin).toBe("IE00B5BMR087");
  });

  it("merges multiple CSV lines with the same Order ID into one transaction (VWAP)", () => {
    const fillA =
      '11-04-2023,10:41,ISHARES CORE S&P 500 UCITS ETF USD (ACC),IE00B5BMR087,XET,XETA,−1,"391,9400",EUR,"391,94",EUR,"391,94",,"0,00",,"391,94",,695118b5-023c-4d07-be4d-070deb7f3724';
    const fillB =
      '11-04-2023,10:41,ISHARES CORE S&P 500 UCITS ETF USD (ACC),IE00B5BMR087,XET,XETA,−1,"391,9500",EUR,"391,95",EUR,"391,95",,"0,00",,"391,95",,695118b5-023c-4d07-be4d-070deb7f3724';
    const fillC =
      '11-04-2023,10:41,ISHARES CORE S&P 500 UCITS ETF USD (ACC),IE00B5BMR087,XET,XETA,−1,"392,0000",EUR,"392,00",EUR,"392,00",,"0,00",,"392,00",,695118b5-023c-4d07-be4d-070deb7f3724';
    const csv = `${headerLine()}${fillA}\n${fillB}\n${fillC}\n`;
    const result = parseDegiroTransactionsCsv(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];
    expect(row?.quantity).toBe("3");
    expect(row?.side).toBe("sell");
    expect(row?.externalId).toBe("695118b5-023c-4d07-be4d-070deb7f3724");
    expect(row?.unitPrice).toBe("391.963333333333");
  });
});

describe("extractDegiroOrderId", () => {
  it("finds the Order ID UUID in column 16 or 17", () => {
    const records = parse(`${headerLine()}${SAMPLE_ROW}`, {
      relax_column_count: true,
      skip_empty_lines: true,
    }) as string[][];
    const row = records[1];
    expect(row).toBeDefined();
    const normalized = normalizeDegiroDataRow(
      row ?? [],
      DEGIRO_TRANSACTIONS_HEADER.length,
    );
    expect(normalized).not.toBeNull();
    expect(extractDegiroOrderId(normalized ?? [])).toBe(
      "b295869f-bb2d-4824-9a1a-39d3e968bb5d",
    );
  });
});

describe("shouldSkipDegiroNonTradeRow", () => {
  it("returns true when ISIN is missing", () => {
    const feeRow =
      '25-03-2026,15:39,DEGIRO Transaction Fee,,XET,XETA,−1,"1,00",EUR,"1,00",EUR,"1,00",,"0,00","0,00","1,00",,a0000000-0000-4000-8000-000000000001';
    const records = parse(`${headerLine()}${feeRow}`, {
      relax_column_count: true,
      skip_empty_lines: true,
    }) as string[][];
    const row = records[1];
    const normalized = normalizeDegiroDataRow(
      row ?? [],
      DEGIRO_TRANSACTIONS_HEADER.length,
    );
    expect(normalized).not.toBeNull();
    expect(shouldSkipDegiroNonTradeRow(normalized ?? [])).toBe(true);
  });
});

describe("fingerprintDegiroRow", () => {
  it("throws when column count mismatches", () => {
    expect(() => fingerprintDegiroRow(["a", "b"])).toThrow();
  });
});
