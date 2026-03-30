import { describe, expect, it } from "vitest";
import {
  DEGIRO_TRANSACTIONS_HEADER,
  fingerprintDegiroRow,
  parseDegiroTradeDateDdMmYyyy,
  parseDegiroTransactionsCsv,
  parseEuropeanDecimalString,
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
    expect(row?.tradeDate).toBe("2026-03-25");
    expect(row?.isin).toBe("IE00B5BMR087");
    expect(row?.side).toBe("sell");
    expect(row?.quantity).toBe("1");
    expect(row?.currency).toBe("EUR");
    expect(row?.unitPrice).toBe("612.7400");
    expect(row?.externalId).toMatch(/^[a-f0-9]{64}$/);
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
});

describe("fingerprintDegiroRow", () => {
  it("throws when column count mismatches", () => {
    expect(() => fingerprintDegiroRow(["a", "b"])).toThrow();
  });
});
