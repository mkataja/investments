import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseVanguardUkProfessionalHoldingsPortId,
  validateHoldingsDistributionUrl,
  validateProviderBreakdownDataUrl,
} from "@investments/lib/holdingsUrl";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseIsharesHoldingsCsv } from "./parseIsharesHoldingsCsv.js";
import { parseJpmHoldingsXlsx } from "./parseJpmHoldingsXlsx.js";
import {
  extractJpmProductDataRawSectorNames,
  parseJpmProductDataSectorBreakdown,
} from "./parseJpmProductDataSectorBreakdown.js";
import { parseSsgaHoldingsXlsx } from "./parseSsgaHoldingsXlsx.js";
import { parseVanguardUkGpxHoldingsJson } from "./parseVanguardUkGpxHoldings.js";
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
  it("accepts am.jpmorgan.com HTTPS", () => {
    const r = validateHoldingsDistributionUrl(
      "https://am.jpmorgan.com/FundsMarketingHandler/excel?type=dailyETFHoldings&cusip=IE00BJRCLL96&country=gb&role=per&fundType=N_ETF&locale=en-GB&isUnderlyingHolding=false&isProxyHolding=false",
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.provider).toBe("jpm_xlsx");
    }
  });
  it("accepts sec.gov EDGAR 13F information table XML", () => {
    const r = validateHoldingsDistributionUrl(
      "https://www.sec.gov/Archives/edgar/data/1067983/000119312526054580/50240.xml",
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.provider).toBe("sec_13f_xml");
    }
  });
  it("rejects unsupported host", () => {
    const r = validateHoldingsDistributionUrl("https://example.com/h.csv");
    expect(r.ok).toBe(false);
  });
  it("accepts Vanguard UK Professional product HTTPS URL", () => {
    const r = validateHoldingsDistributionUrl(
      "https://www.vanguard.co.uk/professional/product/etf/equity/9678/ftse-emerging-markets-ucits-etf-usd-accumulating",
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.provider).toBe("vanguard_uk_gpx");
    }
  });
  it("rejects Vanguard host without professional product path", () => {
    const r = validateHoldingsDistributionUrl(
      "https://www.vanguard.co.uk/professional/",
    );
    expect(r.ok).toBe(false);
  });
});

describe("parseVanguardUkProfessionalHoldingsPortId", () => {
  it("extracts port id from product URL", () => {
    expect(
      parseVanguardUkProfessionalHoldingsPortId(
        "https://www.vanguard.co.uk/professional/product/etf/equity/9678/ftse-emerging-markets-ucits-etf-usd-accumulating",
      ),
    ).toBe("9678");
  });
  it("returns null for non-UK Vanguard host", () => {
    expect(
      parseVanguardUkProfessionalHoldingsPortId(
        "https://www.ie.vanguard/products/etf/equity/9678/foo",
      ),
    ).toBeNull();
  });
});

describe("parseVanguardUkGpxHoldingsJson", () => {
  it("aggregates Bloomberg ISO country and GICS sector weights", () => {
    const { countries, sectors } = parseVanguardUkGpxHoldingsJson([
      {
        marketValuePercentage: 60,
        bloombergIsoCountry: "US",
        gicsSectorDescription: "Technology",
        securityType: "EQ.STOCK",
      },
      {
        marketValuePercentage: 40,
        bloombergIsoCountry: "GB",
        gicsSectorDescription: "Financials",
        securityType: "EQ.STOCK",
      },
    ]);
    expect(countries.US).toBeCloseTo(0.6, 5);
    expect(countries.GB).toBeCloseTo(0.4, 5);
    expect(sectors.technology).toBeCloseTo(0.6, 5);
    expect(sectors.financials).toBeCloseTo(0.4, 5);
  });

  it("attributes cash to sectors.cash and skips countries", () => {
    const { countries, sectors } = parseVanguardUkGpxHoldingsJson([
      {
        marketValuePercentage: 2,
        bloombergIsoCountry: "US",
        securityType: "MM.TBILL",
        issuerName: "Cash",
      },
      {
        marketValuePercentage: 98,
        bloombergIsoCountry: "US",
        gicsSectorDescription: "Technology",
        securityType: "EQ.STOCK",
      },
    ]);
    expect(countries.US).toBeCloseTo(0.98, 5);
    expect(sectors.cash).toBeCloseTo(0.02, 5);
  });
});

describe("validateProviderBreakdownDataUrl", () => {
  it("accepts FundsMarketingHandler product-data on am.jpmorgan.com", () => {
    const r = validateProviderBreakdownDataUrl(
      "https://am.jpmorgan.com/FundsMarketingHandler/product-data?cusip=IE00BJRCLL96&country=gb&role=adv&language=en&userLoggedIn=false&version=9.5_1",
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.normalized).toContain("product-data");
    }
  });
  it("rejects JPM excel holdings URL", () => {
    const r = validateProviderBreakdownDataUrl(
      "https://am.jpmorgan.com/FundsMarketingHandler/excel?type=dailyETFHoldings&cusip=IE00BJRCLL96",
    );
    expect(r.ok).toBe(false);
  });
});

describe("parseJpmProductDataSectorBreakdown", () => {
  it("aggregates emeaSectorBreakdown.data portfolio weights", () => {
    const sectors = parseJpmProductDataSectorBreakdown({
      emeaSectorBreakdown: {
        data: [
          {
            name: "Technology",
            secondaryValueMap: { PORTFOLIO_MARKET_VALUE_PC: 30 },
          },
          {
            name: "Financials",
            secondaryValueMap: { PORTFOLIO_MARKET_VALUE_PC: 20 },
          },
        ],
      },
    });
    expect(sectors.technology).toBeCloseTo(0.3, 5);
    expect(sectors.financials).toBeCloseTo(0.2, 5);
  });

  it("reads emeaSectorBreakdown from fundData wrapper", () => {
    const sectors = parseJpmProductDataSectorBreakdown({
      fundData: {
        emeaSectorBreakdown: {
          data: [
            {
              name: "Technology",
              secondaryValueMap: { PORTFOLIO_MARKET_VALUE_PC: 25 },
            },
            {
              name: "Health Care",
              secondaryValueMap: { PORTFOLIO_MARKET_VALUE_PC: 15 },
            },
          ],
        },
      },
    });
    expect(sectors.technology).toBeCloseTo(0.25, 5);
    expect(sectors.healthcare).toBeCloseTo(0.15, 5);
  });

  it("drops Total row so weights do not double and land in other", () => {
    const sectors = parseJpmProductDataSectorBreakdown({
      emeaSectorBreakdown: {
        data: [
          {
            name: "Technology",
            secondaryValueMap: { PORTFOLIO_MARKET_VALUE_PC: 30 },
          },
          {
            name: "Total",
            value: 100,
            secondaryValue: 100,
            secondaryValueMap: { en: "PORTFOLIO_MARKET_VALUE_PC" },
          },
        ],
      },
    });
    expect(sectors.technology).toBeCloseTo(0.3, 5);
    expect(sectors.other).toBeUndefined();
  });

  it("uses value as portfolio percent when only locale secondaryValueMap keys exist", () => {
    const sectors = parseJpmProductDataSectorBreakdown({
      emeaSectorBreakdown: {
        data: [
          {
            name: "Health Care",
            value: 11.9,
            secondaryValue: 9.3,
            secondaryValueMap: { en: "BENCHMARK_MARKET_VALUE_PC" },
          },
          {
            name: "Financials",
            value: 9.8,
            secondaryValue: 14.7,
            secondaryValueMap: { en: "BENCHMARK_MARKET_VALUE_PC" },
          },
        ],
      },
    });
    expect(sectors.healthcare).toBeCloseTo(0.119, 5);
    expect(sectors.financials).toBeCloseTo(0.098, 5);
  });

  it("extractJpmProductDataRawSectorNames returns name fields excluding Total", () => {
    const names = extractJpmProductDataRawSectorNames({
      emeaSectorBreakdown: {
        data: [
          { name: "Technology" },
          { name: "Total" },
          { name: "Financials" },
        ],
      },
    });
    expect(names).toEqual(["Technology", "Financials"]);
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

  it("maps iShares Location Korea (South) to KR (EIMI-style label)", () => {
    const csv = [
      "Ticker,Name,Sector,Asset Class,Weight (%),Location",
      '005930,SAMSUNG ELECTRONICS LTD,Information Technology,Equity,4.00,"Korea (South)"',
      "2330,TAIWAN SEMICONDUCTOR,Information Technology,Equity,6.00,Taiwan",
    ].join("\n");
    const { countries } = parseIsharesHoldingsCsv(csv);
    expect(countries.KR).toBeCloseTo(0.04, 5);
    expect(countries.TW).toBeCloseTo(0.06, 5);
  });
});

describe("parseSsgaHoldingsXlsx", () => {
  const repoSamplePath = join(repoRoot, "holdings-daily-emea-en-spyi-gy.xlsx");
  const tmpSamplePath = "/tmp/ssga_test.xlsx";
  it.skipIf(!existsSync(repoSamplePath) && !existsSync(tmpSamplePath))(
    "aggregates SSGA sample from /tmp or repo",
    () => {
      let buf: Buffer;
      try {
        buf = readFileSync(repoSamplePath);
      } catch {
        buf = readFileSync(tmpSamplePath);
      }
      const { countries, sectors } = parseSsgaHoldingsXlsx(new Uint8Array(buf));
      expect(countries.US).toBeGreaterThan(0.1);
      expect(Object.keys(sectors).length).toBeGreaterThan(0);
    },
  );
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

function minimalJpmHoldingsXlsx(): Uint8Array {
  const rows: unknown[][] = [
    ["Daily holdings", "Example", "", "", "", "", "", "", ""],
    ["", "", "", "", "", "", "", "", ""],
    [
      "Name",
      "ISIN",
      "Asset class",
      "Country",
      "Currency",
      "Weight",
      "Base market\nvalue",
      "Price",
      "",
    ],
    [
      "EXAMPLE CORP",
      "US0378331005",
      "Common Stock",
      "United States",
      "USD",
      0.5,
      1,
      100,
      "",
    ],
    [
      "Cash and Cash Equivalent",
      "",
      "Cash",
      "United States",
      "USD",
      0.02,
      1,
      1,
      "",
    ],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Holdings");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new Uint8Array(buf);
}

describe("parseJpmHoldingsXlsx", () => {
  it("aggregates equity and cash from minimal workbook", () => {
    const { countries, sectors } = parseJpmHoldingsXlsx(
      minimalJpmHoldingsXlsx(),
    );
    expect(countries.US).toBeCloseTo(0.5, 5);
    expect(sectors.cash).toBeCloseTo(0.02, 5);
    expect(sectors.other).toBeCloseTo(0.5, 5);
  });

  it.skipIf(!existsSync("/tmp/jpm_sample.xlsx"))(
    "aggregates JPM export from /tmp/jpm_sample.xlsx when present",
    () => {
      const buf = readFileSync("/tmp/jpm_sample.xlsx");
      const { countries, sectors } = parseJpmHoldingsXlsx(new Uint8Array(buf));
      expect(countries.US).toBeGreaterThan(0.5);
      expect(Object.keys(sectors).length).toBeGreaterThan(0);
    },
  );
});

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
