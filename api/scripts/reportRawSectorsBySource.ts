/**
 * One-off report: unique raw sector-related strings from distribution caches,
 * grouped by cache source. JPM: fetches live `product-data` JSON per
 * `instruments.provider_breakdown_data_url` (not XLSX Asset class). Run from repo root:
 * `pnpm --filter @investments/api exec tsx scripts/reportRawSectorsBySource.ts`
 */
import { Buffer } from "node:buffer";
import {
  instruments,
  providerHoldingsCache,
  seligsonDistributionCache,
  yahooFinanceCache,
} from "@investments/db";
import * as cheerio from "cheerio";
import { parse } from "csv-parse/sync";
import { asc, eq } from "drizzle-orm";
import * as XLSX from "xlsx";
import { db, pool } from "../src/db.js";
import { fetchJpmProductDataJson } from "../src/distributions/fetchJpmProductData.js";
import { extractAmundiRawSectorLabels } from "../src/distributions/parseAmundiHoldingsComposition.js";
import { extractJpmProductDataRawSectorNames } from "../src/distributions/parseJpmProductDataSectorBreakdown.js";
import { mergeYahooWeightRows } from "../src/distributions/types.js";

type CountMap = Map<string, number>;

function bump(m: CountMap, key: string) {
  const k = key.trim();
  if (!k) {
    return;
  }
  m.set(k, (m.get(k) ?? 0) + 1);
}

function mergeIntoGlobal(global: CountMap, local: Iterable<string>) {
  for (const s of local) {
    bump(global, s);
  }
}

function printSection(title: string, global: CountMap, rowCount: number) {
  console.log(`\n## ${title}`);
  console.log(`Cache rows: ${rowCount}`);
  const entries = [...global.entries()].sort((a, b) => {
    const d = b[1] - a[1];
    return d !== 0 ? d : a[0].localeCompare(b[0]);
  });
  console.log(`Unique labels: ${entries.length}`);
  for (const [label, n] of entries) {
    console.log(`  ${n}\t${JSON.stringify(label)}`);
  }
}

function printJpmProductDataSection(
  global: CountMap,
  totalJpmCacheRows: number,
  included: number,
  skippedLegacy: number,
) {
  console.log(
    "\n## Provider holdings — JPM (`jpm_holdings_xlsx` + live product-data JSON)",
  );
  console.log(
    "Raw sector strings: `FundsMarketingHandler/product-data` JSON → `emeaSectorBreakdown.data[].name` (same rows as `parseJpmProductDataSectorBreakdown`; Total/Grand total excluded). Instruments with JPM holdings URL but no `instruments.provider_breakdown_data_url` are skipped (legacy XLSX-only path used Asset class, not sector names).",
  );
  console.log(`\`provider_holdings_cache\` JPM rows: ${totalJpmCacheRows}`);
  console.log(`Fetched product-data (included): ${included}`);
  console.log(`Skipped legacy (no provider breakdown URL): ${skippedLegacy}`);
  const entries = [...global.entries()].sort((a, b) => {
    const d = b[1] - a[1];
    return d !== 0 ? d : a[0].localeCompare(b[0]);
  });
  console.log(`Unique labels: ${entries.length}`);
  for (const [label, n] of entries) {
    console.log(`  ${n}\t${JSON.stringify(label)}`);
  }
}

function extractYahooRawSectorLabels(raw: unknown): string[] {
  const obj = raw as Record<string, unknown>;
  const top = obj.topHoldings as Record<string, unknown> | undefined;
  const fund = obj.fundProfile as Record<string, unknown> | undefined;
  let rawSectors = mergeYahooWeightRows(top?.sectorWeightings);
  if (Object.keys(rawSectors).length === 0) {
    rawSectors = mergeYahooWeightRows(fund?.sectorWeightings);
  }
  const asset = obj.assetProfile as { sector?: string } | undefined;
  if (Object.keys(rawSectors).length === 0 && asset?.sector) {
    rawSectors = { [asset.sector]: 1 };
  }
  return Object.keys(rawSectors);
}

function extractSeligsonFirstColumnLabels(holdingsHtml: string): string[] {
  const out: string[] = [];
  const $ = cheerio.load(holdingsHtml);
  $("table.fundprobe.company tbody tr").each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.length < 5) {
      return;
    }
    const first = $(tds[0]).text().trim();
    if (first) {
      out.push(first);
    }
  });
  return out;
}

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function extractIsharesSectorLabels(csvText: string): string[] {
  const text = stripBom(csvText.trimStart());
  const lines = text.split(/\r?\n/);
  let headerLineIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.includes("Ticker") && line.includes("Location")) {
      headerLineIdx = i;
      break;
    }
  }
  if (headerLineIdx < 0) {
    return [];
  }
  const body = lines.slice(headerLineIdx).join("\n");
  const records = parse(body, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
  }) as Record<string, string>[];
  const labels: string[] = [];
  for (const row of records) {
    const sectorLabel = (row.Sector ?? "").trim();
    if (sectorLabel) {
      labels.push(sectorLabel);
    }
  }
  return labels;
}

function findSsgaHeaderRow(data: unknown[][]): {
  rowIdx: number;
  col: Record<string, number>;
} | null {
  for (let r = 0; r < data.length; r++) {
    const row = data[r];
    if (!Array.isArray(row) || row.length === 0) {
      continue;
    }
    if (String(row[0]).trim() === "ISIN") {
      const col: Record<string, number> = {};
      for (let c = 0; c < row.length; c++) {
        const name = String(row[c] ?? "").trim();
        if (name) {
          col[name] = c;
        }
      }
      const need = [
        "Percent of Fund",
        "Trade Country Name",
        "Sector Classification",
      ];
      if (need.every((k) => k in col)) {
        return { rowIdx: r, col };
      }
    }
  }
  return null;
}

function extractSsgaSectorLabels(buf: Uint8Array): string[] {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: false });
  const sheetName = wb.SheetNames.includes("holdings")
    ? "holdings"
    : wb.SheetNames[0];
  if (!sheetName) {
    return [];
  }
  const sh = wb.Sheets[sheetName];
  if (!sh) {
    return [];
  }
  const data = XLSX.utils.sheet_to_json(sh, {
    header: 1,
    defval: "",
    raw: true,
  }) as unknown[][];
  const found = findSsgaHeaderRow(data);
  if (!found) {
    return [];
  }
  const { rowIdx, col } = found;
  const labels: string[] = [];
  const sc = col["Sector Classification"];
  if (typeof sc !== "number") {
    return [];
  }
  for (let r = rowIdx + 1; r < data.length; r++) {
    const row = data[r];
    if (!Array.isArray(row)) {
      continue;
    }
    const sectorLabel = String(row[sc] ?? "").trim();
    if (sectorLabel) {
      labels.push(sectorLabel);
    }
  }
  return labels;
}

function findXtrackersHeaderRow(data: unknown[][]): {
  rowIdx: number;
  col: Record<string, number>;
} | null {
  for (let r = 0; r < data.length; r++) {
    const row = data[r];
    if (!Array.isArray(row) || row.length === 0) {
      continue;
    }
    const col: Record<string, number> = {};
    for (let c = 0; c < row.length; c++) {
      const name = String(row[c] ?? "").trim();
      if (name) {
        col[name] = c;
      }
    }
    const need = ["ISIN", "Country", "Weighting", "Industry Classification"];
    if (need.every((k) => k in col) && "Type of Security" in col) {
      return { rowIdx: r, col };
    }
  }
  return null;
}

function extractXtrackersIndustryLabels(buf: Uint8Array): string[] {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return [];
  }
  const sh = wb.Sheets[sheetName];
  if (!sh) {
    return [];
  }
  const data = XLSX.utils.sheet_to_json(sh, {
    header: 1,
    defval: "",
    raw: true,
  }) as unknown[][];
  const found = findXtrackersHeaderRow(data);
  if (!found) {
    return [];
  }
  const { rowIdx, col } = found;
  const ic = col["Industry Classification"];
  if (typeof ic !== "number") {
    return [];
  }
  const labels: string[] = [];
  for (let r = rowIdx + 1; r < data.length; r++) {
    const row = data[r];
    if (!Array.isArray(row)) {
      continue;
    }
    const industryLabel = String(row[ic] ?? "").trim();
    if (industryLabel) {
      labels.push(industryLabel);
    }
  }
  return labels;
}

async function main() {
  console.log("# Raw sector-related strings by cache source");
  console.log(
    "Counts are occurrences across instruments (one row per label per instrument holding that label).",
  );

  const yahooGlobal: CountMap = new Map();
  const yahooRows = await db
    .select({
      id: instruments.id,
      name: instruments.displayName,
      raw: yahooFinanceCache.raw,
    })
    .from(yahooFinanceCache)
    .innerJoin(instruments, eq(yahooFinanceCache.instrumentId, instruments.id))
    .orderBy(asc(instruments.id));

  let yahooOk = 0;
  for (const row of yahooRows) {
    try {
      const labels = extractYahooRawSectorLabels(row.raw);
      mergeIntoGlobal(yahooGlobal, labels);
      yahooOk++;
    } catch {
      console.warn(`Yahoo parse failed instrument ${row.id} ${row.name}`);
    }
  }
  printSection(
    "Yahoo Finance (`yahoo_finance_cache.raw` quoteSummary JSON)",
    yahooGlobal,
    yahooOk,
  );

  const seligsonGlobal: CountMap = new Map();
  const seligsonRows = await db
    .select({
      id: instruments.id,
      name: instruments.displayName,
      holdingsHtml: seligsonDistributionCache.holdingsHtml,
      allocationHtml: seligsonDistributionCache.allocationHtml,
    })
    .from(seligsonDistributionCache)
    .innerJoin(
      instruments,
      eq(seligsonDistributionCache.instrumentId, instruments.id),
    )
    .orderBy(asc(instruments.id));

  for (const row of seligsonRows) {
    const html = row.holdingsHtml?.trim() || row.allocationHtml?.trim() || "";
    if (!html) {
      continue;
    }
    const labels = extractSeligsonFirstColumnLabels(html);
    mergeIntoGlobal(seligsonGlobal, labels);
  }
  printSection(
    "Seligson (`holdings_html` view=10 company column, else `allocation_html`)",
    seligsonGlobal,
    seligsonRows.length,
  );

  const providerRows = await db
    .select({
      id: instruments.id,
      name: instruments.displayName,
      source: providerHoldingsCache.source,
      raw: providerHoldingsCache.raw,
      providerBreakdownDataUrl: instruments.providerBreakdownDataUrl,
    })
    .from(providerHoldingsCache)
    .innerJoin(
      instruments,
      eq(providerHoldingsCache.instrumentId, instruments.id),
    )
    .orderBy(asc(providerHoldingsCache.source), asc(instruments.id));

  const bySource = new Map<string, CountMap>();
  for (const row of providerRows) {
    if (row.source === "jpm_holdings_xlsx") {
      continue;
    }
    let m = bySource.get(row.source);
    if (!m) {
      m = new Map();
      bySource.set(row.source, m);
    }
    try {
      if (row.source === "ishares_holdings_csv") {
        mergeIntoGlobal(m, extractIsharesSectorLabels(row.raw));
      } else if (row.source === "ssga_holdings_xlsx") {
        const buf = Buffer.from(row.raw, "base64");
        mergeIntoGlobal(m, extractSsgaSectorLabels(buf));
      } else if (row.source === "xtrackers_holdings_xlsx") {
        const buf = Buffer.from(row.raw, "base64");
        mergeIntoGlobal(m, extractXtrackersIndustryLabels(buf));
      } else if (row.source === "sec_13f_infotable_xml") {
        // Filing XML has no sector column; sectors come from Yahoo per holding at refresh time.
        bump(
          m,
          "(no sector strings in cached XML — resolved via Yahoo assetProfile in pipeline)",
        );
      } else if (row.source === "amundi_etf_composition_api") {
        mergeIntoGlobal(m, extractAmundiRawSectorLabels(row.raw));
      }
    } catch (e) {
      console.warn(
        `Provider parse failed ${row.source} instrument ${row.id} ${row.name}:`,
        e,
      );
    }
  }

  const jpmRows = providerRows.filter((r) => r.source === "jpm_holdings_xlsx");
  const jpmGlobal: CountMap = new Map();
  let jpmLegacySkipped = 0;
  let jpmIncluded = 0;
  for (const row of jpmRows) {
    const url = row.providerBreakdownDataUrl?.trim();
    if (!url) {
      jpmLegacySkipped++;
      continue;
    }
    try {
      const json = await fetchJpmProductDataJson(url);
      const names = extractJpmProductDataRawSectorNames(json);
      if (names.length === 0) {
        console.warn(
          `JPM product-data: no sector names in JSON for instrument ${row.id} ${row.name}`,
        );
      }
      mergeIntoGlobal(jpmGlobal, names);
      jpmIncluded++;
    } catch (e) {
      console.warn(
        `JPM product-data fetch/parse failed instrument ${row.id} ${row.name}:`,
        e,
      );
    }
  }
  bySource.set("jpm_holdings_xlsx", jpmGlobal);

  const sourceOrder = [
    "ishares_holdings_csv",
    "ssga_holdings_xlsx",
    "xtrackers_holdings_xlsx",
    "jpm_holdings_xlsx",
    "sec_13f_infotable_xml",
    "amundi_etf_composition_api",
  ];
  for (const src of sourceOrder) {
    const m = bySource.get(src);
    if (!m) {
      continue;
    }
    if (src === "jpm_holdings_xlsx") {
      printJpmProductDataSection(
        m,
        jpmRows.length,
        jpmIncluded,
        jpmLegacySkipped,
      );
      continue;
    }
    const n = providerRows.filter((r) => r.source === src).length;
    printSection(
      `Provider holdings (\`provider_holdings_cache\`, source=${src})`,
      m,
      n,
    );
  }
  for (const [src, m] of [...bySource.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    if (sourceOrder.includes(src)) {
      continue;
    }
    const n = providerRows.filter((r) => r.source === src).length;
    printSection(`Provider holdings (source=${src})`, m, n);
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
