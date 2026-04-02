import type { HoldingsProviderKind } from "@investments/lib/holdingsUrl";
import { normalizeIsinForStorage } from "@investments/lib/isin";
import { normalizeYahooSymbolForStorage } from "@investments/lib/yahooSymbol";
import * as XLSX from "xlsx";

type ProviderDocumentIdentifiers = {
  isins: string[];
  tickers: string[];
  names: string[];
};

type InstrumentMatchFields = {
  displayName: string;
  yahooSymbol: string | null;
  isin: string | null;
};

const STOP_TOKENS = new Set([
  "acc",
  "accumulating",
  "and",
  "distributing",
  "etf",
  "for",
  "fund",
  "inc",
  "plc",
  "the",
  "trust",
  "ucits",
  "usd",
]);

function uniq(xs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of xs) {
    const k = x.trim().toLowerCase();
    if (k.length === 0 || seen.has(k)) {
      continue;
    }
    seen.add(k);
    out.push(x.trim());
  }
  return out;
}

function normalizeIsinFromText(s: string): string | null {
  return normalizeIsinForStorage(s);
}

function extractIsinsFromText(text: string): string[] {
  const re = /\b([A-Z]{2}[A-Z0-9]{10})\b/gi;
  const out: string[] = [];
  for (const m of text.matchAll(re)) {
    const n = normalizeIsinFromText(m[1] ?? "");
    if (n) {
      out.push(n);
    }
  }
  return uniq(out);
}

function baseTicker(symbol: string): string {
  const u = normalizeYahooSymbolForStorage(symbol);
  const dot = u.indexOf(".");
  return dot >= 0 ? u.slice(0, dot) : u;
}

function normalizeNameForTokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_TOKENS.has(t));
}

function namesLikelyMatch(instrumentName: string, candidate: string): boolean {
  const a = instrumentName.trim();
  const b = candidate.trim();
  if (a.length < 2 || b.length < 2) {
    return false;
  }
  const na = a
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const nb = b
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (na.length >= 8 && nb.includes(na)) {
    return true;
  }
  if (nb.length >= 8 && na.includes(nb)) {
    return true;
  }
  const ta = new Set(normalizeNameForTokens(a));
  const tb = new Set(normalizeNameForTokens(b));
  if (ta.size === 0 || tb.size === 0) {
    return false;
  }
  let inter = 0;
  for (const t of ta) {
    if (tb.has(t)) {
      inter++;
    }
  }
  const minSize = Math.min(ta.size, tb.size);
  return inter >= Math.min(2, minSize);
}

function tickersMatch(yahooSymbol: string | null, tickers: string[]): boolean {
  if (!yahooSymbol?.trim()) {
    return false;
  }
  const inst = baseTicker(yahooSymbol);
  if (inst.length < 1) {
    return false;
  }
  for (const t of tickers) {
    if (baseTicker(t) === inst) {
      return true;
    }
  }
  return false;
}

function hasAnyIdentifiers(doc: ProviderDocumentIdentifiers): boolean {
  return doc.isins.length > 0 || doc.tickers.length > 0 || doc.names.length > 0;
}

export function mergeProviderDocumentIdentifiers(
  ...parts: ProviderDocumentIdentifiers[]
): ProviderDocumentIdentifiers {
  const isins: string[] = [];
  const tickers: string[] = [];
  const names: string[] = [];
  for (const p of parts) {
    isins.push(...p.isins);
    tickers.push(...p.tickers);
    names.push(...p.names);
  }
  return {
    isins: uniq(isins),
    tickers: uniq(tickers),
    names: uniq(names),
  };
}

/**
 * URL-level identifiers (fund ISIN in path/query — not constituents).
 */
export function extractHoldingsUrlIdentifiers(
  normalizedUrl: string,
  provider: HoldingsProviderKind,
): ProviderDocumentIdentifiers {
  const isins: string[] = [];
  const tickers: string[] = [];
  const names: string[] = [];

  let u: URL;
  try {
    u = new URL(normalizedUrl);
  } catch {
    return { isins, tickers, names };
  }

  if (provider === "jpm_xlsx") {
    const cusip = u.searchParams.get("cusip")?.trim();
    const n = normalizeIsinFromText(cusip ?? "");
    if (n) {
      isins.push(n);
    }
    return mergeProviderDocumentIdentifiers({ isins, tickers, names });
  }

  if (provider === "vanguard_uk_gpx") {
    const parts = u.pathname.split("/").filter(Boolean);
    const slug = parts[parts.length - 1] ?? "";
    if (slug.length > 0) {
      const phrase = slug
        .replace(/-/g, " ")
        .replace(/\bucits\b/gi, "UCITS")
        .trim();
      if (phrase.length >= 6) {
        names.push(phrase);
      }
    }
    return mergeProviderDocumentIdentifiers({ isins, tickers, names });
  }

  return { isins, tickers, names };
}

export function extractJpmProductDataUrlIdentifiers(
  normalizedUrl: string,
): ProviderDocumentIdentifiers {
  return extractHoldingsUrlIdentifiers(normalizedUrl, "jpm_xlsx");
}

function findSsgaHeaderRow(data: unknown[][]): number {
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
        return r;
      }
    }
  }
  return -1;
}

function findJpmHeaderRow(data: unknown[][]): number {
  for (let r = 0; r < data.length; r++) {
    const row = data[r];
    if (!Array.isArray(row) || row.length === 0) {
      continue;
    }
    if (String(row[0]).trim() !== "Name") {
      continue;
    }
    const col: Record<string, number> = {};
    for (let c = 0; c < row.length; c++) {
      const name = String(row[c] ?? "").trim();
      if (name) {
        col[name] = c;
      }
    }
    const need = ["ISIN", "Asset class", "Country", "Weight"];
    if (need.every((k) => k in col)) {
      return r;
    }
  }
  return -1;
}

function ssgaSheetMatrix(buf: Uint8Array): unknown[][] | null {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: false });
  const sheetName = wb.SheetNames.includes("holdings")
    ? "holdings"
    : wb.SheetNames[0];
  if (!sheetName) {
    return null;
  }
  const sh = wb.Sheets[sheetName];
  if (!sh) {
    return null;
  }
  return XLSX.utils.sheet_to_json(sh, {
    header: 1,
    defval: "",
    raw: true,
  }) as unknown[][];
}

function collectMetadataCells(
  data: unknown[][],
  headerRowIdx: number,
): string[] {
  const out: string[] = [];
  const limit = headerRowIdx >= 0 ? headerRowIdx : Math.min(3, data.length);
  for (let r = 0; r < limit; r++) {
    const row = data[r];
    if (!Array.isArray(row)) {
      continue;
    }
    for (const cell of row) {
      const s = String(cell ?? "").trim();
      if (s.length >= 8 && s.length <= 260) {
        out.push(s);
      }
    }
  }
  return out;
}

export function extractSsgaXlsxMetadataIdentifiers(
  buf: Uint8Array,
): ProviderDocumentIdentifiers {
  const data = ssgaSheetMatrix(buf);
  if (!data) {
    return { isins: [], tickers: [], names: [] };
  }
  const headerRow = findSsgaHeaderRow(data);
  const cells = collectMetadataCells(data, headerRow);
  const blob = cells.join("\n");
  return mergeProviderDocumentIdentifiers({
    isins: extractIsinsFromText(blob),
    tickers: [],
    names: cells,
  });
}

export function extractJpmXlsxMetadataIdentifiers(
  buf: Uint8Array,
): ProviderDocumentIdentifiers {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: false });
  const sheetName = wb.SheetNames.includes("Holdings")
    ? "Holdings"
    : wb.SheetNames[0];
  if (!sheetName) {
    return { isins: [], tickers: [], names: [] };
  }
  const sh = wb.Sheets[sheetName];
  if (!sh) {
    return { isins: [], tickers: [], names: [] };
  }
  const data = XLSX.utils.sheet_to_json(sh, {
    header: 1,
    defval: "",
    raw: true,
  }) as unknown[][];
  const headerRow = findJpmHeaderRow(data);
  const names: string[] = [];
  for (
    let r = 0;
    r < data.length && r < (headerRow >= 0 ? headerRow : 3);
    r++
  ) {
    const row = data[r];
    if (!Array.isArray(row)) {
      continue;
    }
    const a = String(row[0] ?? "")
      .trim()
      .toLowerCase();
    if (a.includes("daily") && a.includes("holding")) {
      for (let c = 1; c < row.length; c++) {
        const t = String(row[c] ?? "").trim();
        if (t.length >= 6 && t.length <= 220) {
          names.push(t);
        }
      }
    }
  }
  const metaEnd = headerRow >= 0 ? headerRow : 3;
  const cells = collectMetadataCells(data, metaEnd);
  const blob = cells.join("\n");
  return mergeProviderDocumentIdentifiers({
    isins: extractIsinsFromText(blob),
    tickers: [],
    names: [...names, ...cells],
  });
}

export function vanguardIdentifiersFromFundName(
  fundFullName: string | null | undefined,
): ProviderDocumentIdentifiers {
  const n = fundFullName?.trim();
  if (!n || n.length < 4) {
    return { isins: [], tickers: [], names: [] };
  }
  return { isins: [], tickers: [], names: [n] };
}

export function documentMatchesInstrument(
  instrument: InstrumentMatchFields,
  doc: ProviderDocumentIdentifiers,
): boolean {
  if (!hasAnyIdentifiers(doc)) {
    return true;
  }

  const instIsin = normalizeIsinForStorage(instrument.isin);
  if (instIsin && doc.isins.length > 0) {
    if (doc.isins.includes(instIsin)) {
      return true;
    }
    return false;
  }

  if (tickersMatch(instrument.yahooSymbol, doc.tickers)) {
    return true;
  }

  const dn = instrument.displayName.trim();
  for (const n of doc.names) {
    if (namesLikelyMatch(dn, n)) {
      return true;
    }
  }

  return false;
}

export function assertProviderDocumentMatchesInstrument(
  instrument: InstrumentMatchFields,
  doc: ProviderDocumentIdentifiers,
): void {
  if (!hasAnyIdentifiers(doc)) {
    return;
  }
  if (documentMatchesInstrument(instrument, doc)) {
    return;
  }
  const name = instrument.displayName.trim() || "(empty name)";
  const ticker = instrument.yahooSymbol?.trim() || "—";
  throw new Error(
    `Holdings document does not match this instrument. Instrument name: ${name}. Ticker: ${ticker}. Check that the URL or file is for the same fund (name, symbol, or ISIN).`,
  );
}
