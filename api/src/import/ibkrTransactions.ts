import { createHash } from "node:crypto";
import { normalizeIsinForStorage } from "@investments/lib/isin";
import { normalizeYahooSymbolForStorage } from "@investments/lib/yahooSymbol";
import { parse } from "csv-parse/sync";
import {
  normalizeUnicodeMinus,
  parseEuropeanDecimalString,
} from "./degiroTransactions.js";

export const IBKR_CSV_EXTERNAL_SOURCE = "ibkr_csv" as const;

type IbkrParsedRow = {
  tradeDate: string;
  /** IBKR ticker as in the CSV (before Yahoo normalization). */
  symbolRaw: string;
  /** Normalized 12-char ISIN when the export includes one; otherwise null. */
  isin: string | null;
  side: "buy" | "sell";
  quantity: string;
  unitPrice: string;
  currency: string;
  /** Stable upsert key: sha256 of canonical fields (see builders below). */
  externalId: string;
};

function trimCell(s: string): string {
  return normalizeUnicodeMinus(s).trim();
}

export function normalizeIbkrIsin(raw: string): string | null {
  const s = trimCell(raw);
  if (s === "" || s === "-") {
    return null;
  }
  return normalizeIsinForStorage(s);
}

/** IBKR Activity exports use dot decimals and optional scientific notation. */
export function parseIbkrDecimalString(raw: string): string | null {
  const s = trimCell(raw);
  if (s === "" || s === "-") {
    return null;
  }
  const lower = s.toLowerCase();
  if (lower.includes("e") && /^-?\d+(\.\d+)?e[+-]?\d+$/i.test(lower)) {
    const n = Number.parseFloat(lower);
    if (!Number.isFinite(n)) {
      return null;
    }
    return formatPlainDecimal(n);
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) {
    return null;
  }
  return s;
}

function formatPlainDecimal(n: number): string {
  if (!Number.isFinite(n)) {
    throw new Error("Invalid number");
  }
  let out = n.toFixed(12);
  out = out.replace(/\.?0+$/, "");
  return out === "" ? "0" : out;
}

/**
 * IBKR exports use `YYYY-MM-DD HH:mm:ss TZ` with a space between date and time and a
 * trailing zone abbreviation (e.g. EDT, EST, CET). Map common abbreviations to fixed UTC
 * offsets; unknown abbreviations fall back to `Date.parse` (works for many US zones in V8).
 */
const IBKR_TZ_ABBR_TO_ISO_OFFSET: Record<string, string> = {
  GMT: "+00:00",
  UTC: "+00:00",
  UT: "+00:00",
  WET: "+00:00",
  WEST: "+01:00",
  BST: "+01:00",
  CET: "+01:00",
  MET: "+01:00",
  IST: "+05:30",
  CEST: "+02:00",
  MEST: "+02:00",
  EET: "+02:00",
  EEST: "+03:00",
  MSK: "+03:00",
  HKT: "+08:00",
  SGT: "+08:00",
  JST: "+09:00",
  AEST: "+10:00",
  AEDT: "+11:00",
  AKST: "-09:00",
  AKDT: "-08:00",
  PST: "-08:00",
  PDT: "-07:00",
  MST: "-07:00",
  MDT: "-06:00",
  CST: "-06:00",
  CDT: "-05:00",
  EST: "-05:00",
  EDT: "-04:00",
  HST: "-10:00",
};

/** Parses IBKR `DateTime` / `Date/Time` into UTC ISO for `timestamptz` storage. */
function parseIbkrDateTimeToUtcIso(raw: string): string | null {
  const s = trimCell(raw);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return `${s}T00:00:00.000Z`;
  }
  const m =
    /^(\d{4}-\d{2}-\d{2})\s+(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:\s+([A-Za-z]{2,5}))?$/.exec(
      s,
    );
  if (!m) {
    return null;
  }
  const [, ymd, hh, mm, ss, frac, tzAbbr] = m;
  if (tzAbbr === undefined || tzAbbr === "") {
    return null;
  }
  const mappedOffset = IBKR_TZ_ABBR_TO_ISO_OFFSET[tzAbbr.toUpperCase()];
  if (mappedOffset !== undefined) {
    const subsec =
      frac !== undefined && frac.length > 0
        ? `.${frac.padEnd(3, "0").slice(0, 3)}`
        : "";
    const isoLocal = `${ymd}T${hh}:${mm}:${ss}${subsec}${mappedOffset}`;
    const ms = Date.parse(isoLocal);
    if (!Number.isFinite(ms)) {
      return null;
    }
    return new Date(ms).toISOString();
  }
  const parsed = Date.parse(s);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return new Date(parsed).toISOString();
}

function headerKey(cell: string): string {
  return trimCell(cell);
}

function buildIbkrFlatExternalId(parts: {
  isin: string | null;
  symbolRaw: string;
  quantityRaw: string;
  priceRaw: string;
  dateTimeRaw: string;
}): string {
  const isinPart = parts.isin ?? "";
  const sym = normalizeYahooSymbolForStorage(parts.symbolRaw);
  const q = trimCell(parts.quantityRaw);
  const px = trimCell(parts.priceRaw);
  const dt = trimCell(parts.dateTimeRaw);
  const canonical = `${isinPart}|${sym}|ExchTrade|${q}|${px}|${dt}`;
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

function isFlatExchTrade(t: string): boolean {
  return trimCell(t).toLowerCase() === "exchtrade";
}

export function isIbkrFxRow(symbolRaw: string, exchangeRaw: string): boolean {
  const sym = trimCell(symbolRaw).toUpperCase();
  const ex = trimCell(exchangeRaw).toUpperCase();
  if (ex === "IDEALFX") {
    return true;
  }
  return /^[A-Z]{3}\.[A-Z]{3}$/.test(sym);
}

function shouldSkipIbkrFlatRow(
  transactionType: string,
  symbolRaw: string,
  exchangeRaw: string,
  quantityStr: string | null,
  priceStr: string | null,
): boolean {
  if (!isFlatExchTrade(transactionType)) {
    return true;
  }
  if (isIbkrFxRow(symbolRaw, exchangeRaw)) {
    return true;
  }
  const sym = trimCell(symbolRaw);
  if (sym === "" || sym === "-") {
    return true;
  }
  if (quantityStr === null || priceStr === null) {
    return true;
  }
  const q = Number.parseFloat(quantityStr);
  if (!Number.isFinite(q) || q === 0) {
    return true;
  }
  const p = Number.parseFloat(priceStr);
  if (!Number.isFinite(p) || p === 0) {
    return true;
  }
  return false;
}

function shouldSkipIbkrFlatTradesRow(
  buySellRaw: string,
  symbolRaw: string,
  exchangeRaw: string,
  quantityStr: string | null,
  priceStr: string | null,
): boolean {
  const bs = trimCell(buySellRaw).toUpperCase();
  if (bs !== "BUY" && bs !== "SELL") {
    return true;
  }
  if (isIbkrFxRow(symbolRaw, exchangeRaw)) {
    return true;
  }
  const sym = trimCell(symbolRaw);
  if (sym === "" || sym === "-") {
    return true;
  }
  if (quantityStr === null || priceStr === null) {
    return true;
  }
  const q = Number.parseFloat(quantityStr);
  if (!Number.isFinite(q) || q === 0) {
    return true;
  }
  const p = Number.parseFloat(priceStr);
  if (!Number.isFinite(p) || p === 0) {
    return true;
  }
  return false;
}

type ParseIbkrCsvResult =
  | { ok: true; rows: IbkrParsedRow[] }
  | { ok: false; errors: string[] };

function isFlatIbkrExportHeader(firstRow: string[]): boolean {
  const keys = new Set(firstRow.map((c) => headerKey(String(c ?? ""))));
  return (
    keys.has("ClientAccountID") &&
    keys.has("DateTime") &&
    keys.has("TransactionType") &&
    keys.has("TradePrice")
  );
}

/** Flat trades export: `Date/Time`, `Buy/Sell`, `Price`, `CurrencyPrimary` (no `TransactionType` / `TradePrice`). */
function isFlatIbkrTradesExportHeader(firstRow: string[]): boolean {
  const keys = new Set(firstRow.map((c) => headerKey(String(c ?? ""))));
  return (
    keys.has("ClientAccountID") &&
    keys.has("Date/Time") &&
    keys.has("Buy/Sell") &&
    keys.has("Price") &&
    keys.has("Quantity") &&
    keys.has("CurrencyPrimary") &&
    !keys.has("TransactionType")
  );
}

function parseIbkrFlatActivityCsv(records: string[][]): ParseIbkrCsvResult {
  const errors: string[] = [];
  const headerRow = records[0];
  if (!headerRow || headerRow.length < 2) {
    return { ok: false, errors: ["Flat IBKR CSV: missing header row"] };
  }
  const colIndex = new Map<string, number>();
  for (let j = 0; j < headerRow.length; j++) {
    const key = headerKey(String(headerRow[j] ?? ""));
    if (key.length > 0) {
      colIndex.set(key, j);
    }
  }
  const need = [
    "DateTime",
    "Symbol",
    "ISIN",
    "Exchange",
    "TransactionType",
    "Quantity",
    "TradePrice",
    "CurrencyPrimary",
  ];
  const missing = need.filter((k) => !colIndex.has(k));
  if (missing.length > 0) {
    return {
      ok: false,
      errors: [`Flat IBKR CSV header missing columns: ${missing.join(", ")}`],
    };
  }

  const rows: IbkrParsedRow[] = [];

  for (let i = 1; i < records.length; i++) {
    const line = i + 1;
    const row = records[i];
    if (!row || row.length === 0) {
      continue;
    }

    const dateTimeRaw = String(row[colIndex.get("DateTime") ?? -1] ?? "");
    const symbolRaw = String(row[colIndex.get("Symbol") ?? -1] ?? "");
    const isinRaw = String(row[colIndex.get("ISIN") ?? -1] ?? "");
    const exchangeRaw = String(row[colIndex.get("Exchange") ?? -1] ?? "");
    const txnType = String(row[colIndex.get("TransactionType") ?? -1] ?? "");
    const qtyCell = String(row[colIndex.get("Quantity") ?? -1] ?? "");
    const priceCell = String(row[colIndex.get("TradePrice") ?? -1] ?? "");
    const curCell = String(row[colIndex.get("CurrencyPrimary") ?? -1] ?? "");

    const quantityStr =
      parseIbkrDecimalString(qtyCell) ?? parseEuropeanDecimalString(qtyCell);
    const priceStr =
      parseIbkrDecimalString(priceCell) ??
      parseEuropeanDecimalString(priceCell);

    if (
      shouldSkipIbkrFlatRow(
        txnType,
        symbolRaw,
        exchangeRaw,
        quantityStr,
        priceStr,
      ) ||
      quantityStr === null ||
      priceStr === null
    ) {
      continue;
    }

    const tradeDate = parseIbkrDateTimeToUtcIso(dateTimeRaw);
    if (!tradeDate) {
      errors.push(`Line ${line}: invalid DateTime "${dateTimeRaw}"`);
      continue;
    }

    const currency = trimCell(curCell).toUpperCase();
    if (currency.length === 0 || currency === "-") {
      errors.push(`Line ${line}: missing CurrencyPrimary`);
      continue;
    }

    const qtyNum = Number.parseFloat(quantityStr);
    const priceNum = Number.parseFloat(priceStr);
    if (!Number.isFinite(qtyNum) || !Number.isFinite(priceNum)) {
      errors.push(`Line ${line}: invalid quantity or trade price`);
      continue;
    }

    const side: "buy" | "sell" = qtyNum < 0 ? "sell" : "buy";
    const quantityAbs = Math.abs(qtyNum);
    const quantity = formatPlainDecimal(quantityAbs);
    const unitPrice = formatPlainDecimal(Math.abs(priceNum));

    const isin = normalizeIbkrIsin(isinRaw);

    const externalId = buildIbkrFlatExternalId({
      isin,
      symbolRaw,
      quantityRaw: qtyCell,
      priceRaw: priceCell,
      dateTimeRaw,
    });

    rows.push({
      tradeDate,
      symbolRaw,
      isin,
      side,
      quantity,
      unitPrice,
      currency,
      externalId,
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  rows.sort((a, b) => {
    const d = a.tradeDate.localeCompare(b.tradeDate);
    if (d !== 0) {
      return d;
    }
    return a.externalId.localeCompare(b.externalId);
  });

  return { ok: true, rows };
}

function parseIbkrFlatTradesCsv(records: string[][]): ParseIbkrCsvResult {
  const errors: string[] = [];
  const headerRow = records[0];
  if (!headerRow || headerRow.length < 2) {
    return { ok: false, errors: ["Flat IBKR trades CSV: missing header row"] };
  }
  const colIndex = new Map<string, number>();
  for (let j = 0; j < headerRow.length; j++) {
    const key = headerKey(String(headerRow[j] ?? ""));
    if (key.length > 0) {
      colIndex.set(key, j);
    }
  }
  const need = [
    "Date/Time",
    "Symbol",
    "ISIN",
    "Exchange",
    "Buy/Sell",
    "Quantity",
    "Price",
    "CurrencyPrimary",
  ];
  const missing = need.filter((k) => !colIndex.has(k));
  if (missing.length > 0) {
    return {
      ok: false,
      errors: [
        `Flat IBKR trades CSV header missing columns: ${missing.join(", ")}`,
      ],
    };
  }

  const rows: IbkrParsedRow[] = [];

  for (let i = 1; i < records.length; i++) {
    const line = i + 1;
    const row = records[i];
    if (!row || row.length === 0) {
      continue;
    }

    const dateTimeRaw = String(row[colIndex.get("Date/Time") ?? -1] ?? "");
    const symbolRaw = String(row[colIndex.get("Symbol") ?? -1] ?? "");
    const isinRaw = String(row[colIndex.get("ISIN") ?? -1] ?? "");
    const exchangeRaw = String(row[colIndex.get("Exchange") ?? -1] ?? "");
    const buySellRaw = String(row[colIndex.get("Buy/Sell") ?? -1] ?? "");
    const qtyCell = String(row[colIndex.get("Quantity") ?? -1] ?? "");
    const priceCell = String(row[colIndex.get("Price") ?? -1] ?? "");
    const curCell = String(row[colIndex.get("CurrencyPrimary") ?? -1] ?? "");

    const quantityStr =
      parseIbkrDecimalString(qtyCell) ?? parseEuropeanDecimalString(qtyCell);
    const priceStr =
      parseIbkrDecimalString(priceCell) ??
      parseEuropeanDecimalString(priceCell);

    if (
      shouldSkipIbkrFlatTradesRow(
        buySellRaw,
        symbolRaw,
        exchangeRaw,
        quantityStr,
        priceStr,
      ) ||
      quantityStr === null ||
      priceStr === null
    ) {
      continue;
    }

    const tradeDate = parseIbkrDateTimeToUtcIso(dateTimeRaw);
    if (!tradeDate) {
      errors.push(`Line ${line}: invalid Date/Time "${dateTimeRaw}"`);
      continue;
    }

    const currency = trimCell(curCell).toUpperCase();
    if (currency.length === 0 || currency === "-") {
      errors.push(`Line ${line}: missing CurrencyPrimary`);
      continue;
    }

    const qtyNum = Number.parseFloat(quantityStr);
    const priceNum = Number.parseFloat(priceStr);
    if (!Number.isFinite(qtyNum) || !Number.isFinite(priceNum)) {
      errors.push(`Line ${line}: invalid quantity or price`);
      continue;
    }

    const side: "buy" | "sell" =
      trimCell(buySellRaw).toUpperCase() === "SELL" ? "sell" : "buy";
    const quantityAbs = Math.abs(qtyNum);
    const quantity = formatPlainDecimal(quantityAbs);
    const unitPrice = formatPlainDecimal(Math.abs(priceNum));

    const isin = normalizeIbkrIsin(isinRaw);

    const externalId = buildIbkrFlatExternalId({
      isin,
      symbolRaw,
      quantityRaw: qtyCell,
      priceRaw: priceCell,
      dateTimeRaw,
    });

    rows.push({
      tradeDate,
      symbolRaw,
      isin,
      side,
      quantity,
      unitPrice,
      currency,
      externalId,
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  rows.sort((a, b) => {
    const d = a.tradeDate.localeCompare(b.tradeDate);
    if (d !== 0) {
      return d;
    }
    return a.externalId.localeCompare(b.externalId);
  });

  return { ok: true, rows };
}

const IBKR_UNSUPPORTED_CSV_MESSAGE =
  "IBKR CSV must be a flat Activity export (ClientAccountID, DateTime, TransactionType, TradePrice, ...) or a flat trades export (ClientAccountID, Date/Time, Buy/Sell, Price, ...). Statement-style Transaction History exports are not supported.";

/**
 * Interactive Brokers CSV: **flat Activity** export (**`ClientAccountID`**, **`DateTime`**, **`ExchTrade`**, ...)
 * or **flat trades** (**`Date/Time`**, **`Buy/Sell`**, **`Price`**, **`CurrencyPrimary`**, ...).
 * Forex (**`IDEALFX`**, `AAA.BBB` symbols) is skipped.
 */
export function parseIbkrTransactionsCsv(csvText: string): ParseIbkrCsvResult {
  let records: string[][];
  try {
    records = parse(csvText, {
      relax_column_count: true,
      skip_empty_lines: true,
      bom: true,
    }) as string[][];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, errors: [`CSV parse error: ${msg}`] };
  }

  const first = records[0]?.map((c) => trimCell(String(c ?? ""))) ?? [];
  if (isFlatIbkrExportHeader(first)) {
    return parseIbkrFlatActivityCsv(records);
  }
  if (isFlatIbkrTradesExportHeader(first)) {
    return parseIbkrFlatTradesCsv(records);
  }
  return { ok: false, errors: [IBKR_UNSUPPORTED_CSV_MESSAGE] };
}
