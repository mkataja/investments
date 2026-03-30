import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateHoldingsDistributionUrl } from "@investments/db";
import { describe, expect, it } from "vitest";
import { parseIsharesHoldingsCsv } from "./parseIsharesHoldingsCsv.js";
import { parseSsgaHoldingsXlsx } from "./parseSsgaHoldingsXlsx.js";

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
