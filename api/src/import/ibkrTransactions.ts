import { createHash } from "node:crypto";
import {
  normalizeIsinForStorage,
  normalizeYahooSymbolForStorage,
} from "@investments/db";
import { parse } from "csv-parse/sync";
import {
  normalizeUnicodeMinus,
  parseEuropeanDecimalString,
} from "./degiroTransactions.js";

export const IBKR_CSV_EXTERNAL_SOURCE = "ibkr_csv" as const;

/** Matches `api/src/lib/valuation.ts` stub for non-EUR until persisted FX. */
const STUB_EUR_PER_USD = 0.92;

const SECTION = "Transaction History";
const ROW_HEADER = "Header";
const ROW_DATA = "Data";

export type IbkrParsedRow = {
  tradeDate: string;
  /** IBKR ticker as in the CSV (before Yahoo normalization). */
  symbolRaw: string;
  /** Normalized 12-char ISIN when the export includes one; otherwise null. */
  isin: string | null;
  side: "buy" | "sell";
  quantity: string;
  unitPrice: string;
  currency: string;
  unitPriceEur: string;
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

export function ibkrUnitPriceToEurStub(
  unitPriceNum: number,
  currency: string,
): string {
  const c = currency.toUpperCase();
  if (c === "EUR") {
    return formatPlainDecimal(unitPriceNum);
  }
  if (c === "USD") {
    return formatPlainDecimal(unitPriceNum * STUB_EUR_PER_USD);
  }
  return formatPlainDecimal(unitPriceNum);
}

function parseIbkrCalendarDate(raw: string): string | null {
  const s = trimCell(raw);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) {
    return null;
  }
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** `2026-03-27 11:51:58 EDT` → calendar ISO (time zone name is ignored). */
function parseIbkrCalendarDateFromDateTime(raw: string): string | null {
  const s = trimCell(raw);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) {
    return null;
  }
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function headerKey(cell: string): string {
  return trimCell(cell);
}

function buildIbkrExternalId(parts: {
  symbolRaw: string;
  transactionType: string;
  quantityRaw: string;
  priceRaw: string;
}): string {
  const sym = normalizeYahooSymbolForStorage(parts.symbolRaw);
  const tt = trimCell(parts.transactionType);
  const qty = trimCell(parts.quantityRaw);
  const px = trimCell(parts.priceRaw);
  const canonical = `${sym}|${tt}|${qty}|${px}`;
  return createHash("sha256").update(canonical, "utf8").digest("hex");
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

function isEquityTradeType(t: string): boolean {
  const x = trimCell(t).toLowerCase();
  return x === "buy" || x === "sell";
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

function shouldSkipIbkrRow(
  transactionType: string,
  symbolRaw: string,
  quantityStr: string | null,
  priceStr: string | null,
): boolean {
  if (!isEquityTradeType(transactionType)) {
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

export type ParseIbkrCsvResult =
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

    const calendarIso = parseIbkrCalendarDateFromDateTime(dateTimeRaw);
    if (!calendarIso) {
      errors.push(`Line ${line}: invalid DateTime "${dateTimeRaw}"`);
      continue;
    }
    const tradeDate = `${calendarIso}T00:00:00.000Z`;

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
    const unitPriceEur = ibkrUnitPriceToEurStub(
      Number.parseFloat(unitPrice),
      currency,
    );

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
      unitPriceEur,
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

function parseIbkrLegacyTransactionHistoryCsv(
  records: string[][],
): ParseIbkrCsvResult {
  const errors: string[] = [];
  let colIndex: Map<string, number> | null = null;

  for (let i = 0; i < records.length; i++) {
    const line = i + 1;
    const row = records[i];
    if (!row || row.length < 3) {
      continue;
    }
    const a = trimCell(String(row[0] ?? ""));
    const b = trimCell(String(row[1] ?? ""));
    if (a !== SECTION || b !== ROW_HEADER) {
      continue;
    }
    const m = new Map<string, number>();
    for (let j = 2; j < row.length; j++) {
      const key = headerKey(String(row[j] ?? ""));
      if (key.length > 0) {
        m.set(key, j);
      }
    }
    const need = [
      "Date",
      "Transaction Type",
      "Symbol",
      "Quantity",
      "Price",
      "Price Currency",
    ];
    const missing = need.filter((k) => !m.has(k));
    if (missing.length > 0) {
      return {
        ok: false,
        errors: [
          `Line ${line}: Transaction History header missing columns: ${missing.join(", ")}`,
        ],
      };
    }
    colIndex = m;
    break;
  }

  if (colIndex === null) {
    return {
      ok: false,
      errors: [
        'No "Transaction History" header row found (expected Statement-style IBKR Activity CSV).',
      ],
    };
  }

  const rows: IbkrParsedRow[] = [];

  for (let i = 0; i < records.length; i++) {
    const line = i + 1;
    const row = records[i];
    if (!row || row.length < 3) {
      continue;
    }
    const a = trimCell(String(row[0] ?? ""));
    const b = trimCell(String(row[1] ?? ""));
    if (a !== SECTION || b !== ROW_DATA) {
      continue;
    }

    const dateRaw = String(row[colIndex.get("Date") ?? -1] ?? "");
    const txnType = String(row[colIndex.get("Transaction Type") ?? -1] ?? "");
    const symbolRaw = String(row[colIndex.get("Symbol") ?? -1] ?? "");
    const qtyCell = String(row[colIndex.get("Quantity") ?? -1] ?? "");
    const priceCell = String(row[colIndex.get("Price") ?? -1] ?? "");
    const curCell = String(row[colIndex.get("Price Currency") ?? -1] ?? "");

    const quantityStr =
      parseIbkrDecimalString(qtyCell) ?? parseEuropeanDecimalString(qtyCell);
    const priceStr =
      parseIbkrDecimalString(priceCell) ??
      parseEuropeanDecimalString(priceCell);

    if (
      shouldSkipIbkrRow(txnType, symbolRaw, quantityStr, priceStr) ||
      quantityStr === null ||
      priceStr === null
    ) {
      continue;
    }

    const calendarIso = parseIbkrCalendarDate(dateRaw);
    if (!calendarIso) {
      errors.push(`Line ${line}: invalid Date "${dateRaw}"`);
      continue;
    }
    const tradeDate = `${calendarIso}T00:00:00.000Z`;

    const currency = trimCell(curCell).toUpperCase();
    if (currency.length === 0 || currency === "-") {
      errors.push(`Line ${line}: missing Price Currency`);
      continue;
    }

    const qtyNum = Number.parseFloat(quantityStr);
    const priceNum = Number.parseFloat(priceStr);
    if (!Number.isFinite(qtyNum) || !Number.isFinite(priceNum)) {
      errors.push(`Line ${line}: invalid quantity or price`);
      continue;
    }

    const side: "buy" | "sell" =
      trimCell(txnType).toLowerCase() === "sell" ? "sell" : "buy";
    const quantityAbs = Math.abs(qtyNum);
    const quantity = formatPlainDecimal(quantityAbs);
    const unitPrice = formatPlainDecimal(Math.abs(priceNum));
    const unitPriceEur = ibkrUnitPriceToEurStub(
      Number.parseFloat(unitPrice),
      currency,
    );

    const externalId = buildIbkrExternalId({
      symbolRaw,
      transactionType: txnType,
      quantityRaw: qtyCell,
      priceRaw: priceCell,
    });

    rows.push({
      tradeDate,
      symbolRaw,
      isin: null,
      side,
      quantity,
      unitPrice,
      currency,
      unitPriceEur,
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

/**
 * Interactive Brokers CSV: supports (1) flat Activity export with **`ClientAccountID`**
 * / **`DateTime`** / **`ExchTrade`** rows, or (2) legacy Statement-style **`Transaction History`** data rows.
 * Statement / Summary sections are ignored for (2). Forex (**`IDEALFX`**, `AAA.BBB` symbols) is skipped for (1).
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
  return parseIbkrLegacyTransactionHistoryCsv(records);
}
