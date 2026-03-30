import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateHoldingsDistributionUrl } from "@investments/db";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseIsharesHoldingsCsv } from "./parseIsharesHoldingsCsv.js";
import { parseSsgaHoldingsXlsx } from "./parseSsgaHoldingsXlsx.js";
import { parseXtrackersHoldingsXlsx } from "./parseXtrackersHoldingsXlsx.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "../../..");

describe("validateHoldingsDistributionUrl", () => {
  it("accepts ishares.com HTTPS", () => {
    const r = validateHoldingsDistributionUrl(
      "https://www.ishares.com/uk/individual/en/products/253743/x.ajax?fileType=csv",
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.provider).toBe("ishares_csv");
    }
  });
  it("accepts ssga.com HTTPS", () => {
    const r = validateHoldingsDistributionUrl(
      "https://www.ssga.com/library-content/products/fund-data/etfs/emea/h.xlsx",
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.provider).toBe("ssga_xlsx");
    }
  });
  it("accepts etf.dws.com HTTPS", () => {
    const r = validateHoldingsDistributionUrl(
      "https://etf.dws.com/etfdata/export/GBR/ENG/excel/product/constituent/IE00BLNMYC90/",
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.provider).toBe("xtrackers_xlsx");
    }
  });
  it("rejects unsupported host", () => {
    const r = validateHoldingsDistributionUrl("https://example.com/h.csv");
    expect(r.ok).toBe(false);
  });
});

describe("parseIsharesHoldingsCsv", () => {
  it.skipIf(!existsSync(join(repoRoot, "CSPX_holdings.csv")))(
    "aggregates CSPX sample",
    () => {
      const csv = readFileSync(join(repoRoot, "CSPX_holdings.csv"), "utf-8");
      const { countries, sectors } = parseIsharesHoldingsCsv(csv);
      expect(countries.US).toBeGreaterThan(0.9);
      expect(Object.keys(sectors).length).toBeGreaterThan(0);
    },
  );

  it("counts cash rows as sector cash and excludes them from countries", () => {
    const csv = [
      "Ticker,Name,Sector,Asset Class,Weight (%),Location",
      "CASH,USD Cash,Cash,Cash,5.00,United States",
      "AAPL,Apple Inc,Technology,Equity,95.00,United States",
    ].join("\n");
    const { countries, sectors } = parseIsharesHoldingsCsv(csv);
    expect(sectors.cash).toBeCloseTo(0.05, 5);
    expect(countries.US).toBeCloseTo(0.95, 5);
  });
});

describe("parseSsgaHoldingsXlsx", () => {
  it("aggregates SSGA sample from /tmp or repo", () => {
    const path = join(repoRoot, "holdings-daily-emea-en-spyi-gy.xlsx");
    let buf: Buffer;
    try {
      buf = readFileSync(path);
    } catch {
      buf = readFileSync("/tmp/ssga_test.xlsx");
    }
    const { countries, sectors } = parseSsgaHoldingsXlsx(new Uint8Array(buf));
    expect(countries.US).toBeGreaterThan(0.1);
    expect(Object.keys(sectors).length).toBeGreaterThan(0);
  });
});

function minimalXtrackersHoldingsXlsx(): Uint8Array {
  const rows: unknown[][] = [
    ["Disclaimer"],
    [""],
    [
      "",
      "Name",
      "ISIN",
      "Country",
      "Currency",
      "Exchange",
      "Type of Security",
      "Rating",
      "Primary Listing",
      "Industry Classification",
      "Weighting",
    ],
    [
      1,
      "EXAMPLE",
      "US0378331005",
      "United States",
      "USD",
      "NASDAQ",
      "Equity",
      "-",
      "-",
      "Information Technology",
      0.6,
    ],
    [
      2,
      "US DOLLAR",
      "_CURRENCYUSD",
      "United States",
      "USD",
      "-",
      "Cash",
      "-",
      "-",
      "unknown",
      0.04,
    ],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "2026-03-30");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new Uint8Array(buf);
}

describe("parseXtrackersHoldingsXlsx", () => {
  it("aggregates equity and cash from minimal workbook", () => {
    const { countries, sectors } = parseXtrackersHoldingsXlsx(
      minimalXtrackersHoldingsXlsx(),
    );
    expect(countries.US).toBeCloseTo(0.6, 5);
    expect(sectors.cash).toBeCloseTo(0.04, 5);
    expect(sectors.technology).toBeCloseTo(0.6, 5);
  });

  it.skipIf(!existsSync("/tmp/xtrackers_test.xlsx"))(
    "aggregates DWS export from /tmp/xtrackers_test.xlsx when present",
    () => {
      const buf = readFileSync("/tmp/xtrackers_test.xlsx");
      const { countries, sectors } = parseXtrackersHoldingsXlsx(
        new Uint8Array(buf),
      );
      expect(countries.US).toBeGreaterThan(0.5);
      expect(Object.keys(sectors).length).toBeGreaterThan(0);
    },
  );
});
