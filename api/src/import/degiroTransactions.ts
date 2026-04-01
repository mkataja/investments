import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";

/**
 * Degiro “Transactions” export: 18 columns as `csv-parse` sees them.
 * The last column is an empty field from the trailing comma after `Order ID`.
 * Data rows sometimes omit the empty field *before* the Order ID UUID (17 columns);
 * {@link normalizeDegiroDataRow} inserts it so column alignment stays stable.
 */
export const DEGIRO_TRANSACTIONS_HEADER: readonly string[] = [
  "Date",
  "Time",
  "Product",
  "ISIN",
  "Reference exchange",
  "Venue",
  "Quantity",
  "Price",
  "",
  "Local value",
  "",
  "Value EUR",
  "Exchange rate",
  "AutoFX Fee",
  "Transaction and/or third party fees EUR",
  "Total EUR",
  "Order ID",
  "",
] as const;

const DEGIRO_ORDER_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isDegiroOrderIdCell(s: string): boolean {
  return DEGIRO_ORDER_ID_RE.test(normalizeDegiroCell(s));
}

/**
 * Normalize a data row to {@link DEGIRO_TRANSACTIONS_HEADER}.length columns.
 * Degiro sometimes omits the empty column between “Total EUR” and “Order ID”.
 */
export function normalizeDegiroDataRow(
  cells: readonly string[],
  expectedLen: number,
): string[] | null {
  const row = cells.map((c) => String(c));
  while (
    row.length > expectedLen &&
    normalizeDegiroCell(row[row.length - 1] ?? "") === ""
  ) {
    row.pop();
  }
  if (row.length === expectedLen) {
    return row;
  }
  if (row.length === expectedLen - 1) {
    const last = row[row.length - 1] ?? "";
    if (isDegiroOrderIdCell(last)) {
      return [...row.slice(0, -1), "", last];
    }
  }
  return null;
}

export const DEGIRO_CSV_EXTERNAL_SOURCE = "degiro_csv" as const;

const COL_DATE = 0;
const COL_TIME = 1;
const COL_PRODUCT = 2;
const COL_ISIN = 3;
const COL_REF_EXCHANGE = 4;
const COL_VENUE = 5;
const COL_QTY = 6;
const COL_PRICE = 7;
const COL_CURRENCY = 8;

export type DegiroParsedRow = {
  /** ISO 8601 instant (UTC). Degiro date+time are stored as that wall clock in UTC (CSV has no timezone). */
  tradeDate: string;
  isin: string;
  /** Degiro “Product” column (fund / security name). */
  product: string;
  /** Degiro “Reference exchange” (e.g. XET, EAM, HSE). */
  referenceExchange: string;
  /** Degiro “Venue” MIC-style code (e.g. XETA, XAMS, XHEL). */
  venue: string;
  side: "buy" | "sell";
  /** Absolute quantity as decimal string (matches DB numeric). */
  quantity: string;
  unitPrice: string;
  currency: string;
  unitPriceEur: string;
  /**
   * Upsert key: Degiro Order ID (lowercase UUID) when present; otherwise full-row sha256.
   */
  externalId: string;
};

type DegiroFill = {
  line: number;
  normalized: string[];
  tradeDate: string;
  isin: string;
  product: string;
  referenceExchange: string;
  venue: string;
  qtySigned: number;
  priceNum: number;
  /** Normalized decimal string from the Price column (preserves CSV precision for single-fill rows). */
  unitPriceStr: string;
};

export function normalizeUnicodeMinus(s: string): string {
  return s.replace(/\u2212/g, "-");
}

/** Normalize a cell for hashing and comparison (trim, minus sign). */
function normalizeDegiroCell(cell: string): string {
  return normalizeUnicodeMinus(cell.trim());
}

/** Stable row fingerprint (full normalized row). Used when Order ID is missing. */
export function fingerprintDegiroRow(cells: readonly string[]): string {
  if (cells.length !== DEGIRO_TRANSACTIONS_HEADER.length) {
    throw new Error(
      `Expected ${DEGIRO_TRANSACTIONS_HEADER.length} columns, got ${cells.length}`,
    );
  }
  const canonical = cells.map(normalizeDegiroCell).join("|");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/**
 * Degiro may put the UUID in column 16 or 17 (extra empty field before Order ID).
 */
export function extractDegiroOrderId(normalized: readonly string[]): string {
  for (const i of [16, 17] as const) {
    const cell = normalizeDegiroCell(normalized[i] ?? "");
    if (isDegiroOrderIdCell(cell)) {
      return cell.toLowerCase();
    }
  }
  return "";
}

/** Volume-weighted average unit price from fill lines (same currency). */
function volumeWeightedAveragePrice(fills: DegiroFill[]): number {
  let sumAbsQty = 0;
  let sumPxQty = 0;
  for (const f of fills) {
    const a = Math.abs(f.qtySigned);
    sumAbsQty += a;
    sumPxQty += f.priceNum * a;
  }
  if (sumAbsQty === 0 || !Number.isFinite(sumPxQty)) {
    throw new Error("Cannot compute average price for empty or invalid fills");
  }
  return sumPxQty / sumAbsQty;
}

/** Plain decimal string for stored unit price (no scientific notation). */
function formatDegiroUnitPriceString(n: number): string {
  if (!Number.isFinite(n)) {
    throw new Error("Invalid number for unit price");
  }
  let s = n.toFixed(12);
  s = s.replace(/\.?0+$/, "");
  return s === "" ? "0" : s;
}

/** Rows without a trade (fees, cash, dividends): skip without failing the whole CSV. */
export function shouldSkipDegiroNonTradeRow(
  normalized: readonly string[],
): boolean {
  const isin = normalizeDegiroCell(normalized[COL_ISIN] ?? "");
  if (!/^[A-Z0-9]{12}$/.test(isin)) {
    return true;
  }
  const referenceExchange = normalizeDegiroCell(
    normalized[COL_REF_EXCHANGE] ?? "",
  );
  const venue = normalizeDegiroCell(normalized[COL_VENUE] ?? "");
  if (referenceExchange.length === 0 || venue.length === 0) {
    return true;
  }
  const qtyStr = parseEuropeanDecimalString(normalized[COL_QTY] ?? "");
  if (qtyStr === null) {
    return true;
  }
  const qtyNum = Number.parseFloat(qtyStr);
  if (!Number.isFinite(qtyNum) || qtyNum === 0) {
    return true;
  }
  return false;
}

/** Parse European decimal string (e.g. `612,7400`, `−1,00`) into a plain decimal string. */
export function parseEuropeanDecimalString(raw: string): string | null {
  const s = normalizeUnicodeMinus(raw.trim());
  if (s === "") {
    return null;
  }
  const dot = s.replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(dot)) {
    return null;
  }
  return dot;
}

export function parseDegiroTradeDateDdMmYyyy(raw: string): string | null {
  const s = raw.trim();
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s);
  if (!m) {
    return null;
  }
  const dd = m[1];
  const mm = m[2];
  const yyyy = m[3];
  return `${yyyy}-${mm}-${dd}`;
}

/** Degiro "Time" column (HH:MM). Returns zero-padded "HH:MM" or null. */
export function parseDegiroTradeTimeHhMm(raw: string): string | null {
  const s = normalizeUnicodeMinus(raw).trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) {
    return null;
  }
  const hRaw = m[1];
  const minRaw = m[2];
  if (hRaw === undefined || minRaw === undefined) {
    return null;
  }
  const hh = hRaw.padStart(2, "0");
  return `${hh}:${minRaw}`;
}

/**
 * Combine calendar YYYY-MM-DD and HH:MM into an ISO instant.
 * Wall clock from the CSV is stored as the same numbers in UTC (CSV has no timezone).
 */
export function degiroDateWallTimeToIsoUtc(
  isoDateYyyyMmDd: string,
  hhMm: string,
): string {
  const m = /^(\d{2}):(\d{2})$/.exec(hhMm);
  if (!m) {
    return `${isoDateYyyyMmDd}T00:00:00.000Z`;
  }
  return `${isoDateYyyyMmDd}T${m[1]}:${m[2]}:00.000Z`;
}

function headersMatch(actual: string[]): boolean {
  if (actual.length !== DEGIRO_TRANSACTIONS_HEADER.length) {
    return false;
  }
  for (let i = 0; i < DEGIRO_TRANSACTIONS_HEADER.length; i++) {
    if (
      normalizeDegiroCell(actual[i] ?? "") !== DEGIRO_TRANSACTIONS_HEADER[i]
    ) {
      return false;
    }
  }
  return true;
}

function validateAndAggregateDegiroFills(
  fills: DegiroFill[],
): { row: DegiroParsedRow } | { error: string } {
  if (fills.length === 0) {
    return { error: "internal: empty fill group" };
  }
  fills.sort((a, b) => a.line - b.line);
  const first = fills[0];
  if (!first) {
    return { error: "internal: empty fill group" };
  }
  const sign0 = Math.sign(first.qtySigned);
  if (sign0 === 0) {
    return { error: `Line ${first.line}: quantity must be non-zero` };
  }
  for (const f of fills) {
    if (f.isin !== first.isin) {
      return {
        error: `Lines ${first.line}–${f.line}: same Order ID has different ISIN`,
      };
    }
    if (f.tradeDate !== first.tradeDate) {
      return {
        error: `Lines ${first.line}–${f.line}: same Order ID has different trade date/time`,
      };
    }
    if (f.product !== first.product) {
      return {
        error: `Lines ${first.line}–${f.line}: same Order ID has different Product`,
      };
    }
    if (f.referenceExchange !== first.referenceExchange) {
      return {
        error: `Lines ${first.line}–${f.line}: same Order ID has different Reference exchange`,
      };
    }
    if (f.venue !== first.venue) {
      return {
        error: `Lines ${first.line}–${f.line}: same Order ID has different Venue`,
      };
    }
    if (Math.sign(f.qtySigned) !== sign0) {
      return {
        error: `Lines ${first.line}–${f.line}: same Order ID has inconsistent buy/sell quantity signs`,
      };
    }
  }

  let sumSigned = 0;
  for (const f of fills) {
    sumSigned += f.qtySigned;
  }
  const qtyAbs = Math.abs(sumSigned);
  if (!Number.isFinite(qtyAbs) || qtyAbs === 0) {
    return {
      error: `Line ${first.line}: aggregated quantity must be non-zero`,
    };
  }

  const side: "buy" | "sell" = sumSigned > 0 ? "buy" : "sell";
  let unitPrice: string;
  if (fills.length === 1) {
    unitPrice = first.unitPriceStr;
  } else {
    let avg: number;
    try {
      avg = volumeWeightedAveragePrice(fills);
    } catch {
      return { error: `Line ${first.line}: could not compute average price` };
    }
    unitPrice = formatDegiroUnitPriceString(avg);
  }

  const orderId = extractDegiroOrderId(first.normalized);
  let externalId: string;
  try {
    externalId =
      orderId.length > 0 ? orderId : fingerprintDegiroRow(first.normalized);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: `Line ${first.line}: ${msg}` };
  }

  const quantity = String(qtyAbs);

  return {
    row: {
      tradeDate: first.tradeDate,
      isin: first.isin,
      product: first.product,
      referenceExchange: first.referenceExchange,
      venue: first.venue,
      side,
      quantity,
      unitPrice,
      currency: "EUR",
      unitPriceEur: unitPrice,
      externalId,
    },
  };
}

type ParseDegiroCsvResult =
  | { ok: true; rows: DegiroParsedRow[] }
  | { ok: false; errors: string[] };

export function parseDegiroTransactionsCsv(
  csvText: string,
): ParseDegiroCsvResult {
  const errors: string[] = [];
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

  if (records.length === 0) {
    return { ok: false, errors: ["CSV is empty"] };
  }

  const headerRow = records[0];
  if (!headerRow) {
    return { ok: false, errors: ["CSV is empty"] };
  }
  if (!headersMatch(headerRow.map((c) => String(c)))) {
    errors.push(
      "First row must be Degiro Transactions export headers (exact column names and empty columns).",
    );
    return { ok: false, errors };
  }

  const expectedCols = DEGIRO_TRANSACTIONS_HEADER.length;
  const fills: DegiroFill[] = [];

  for (let i = 1; i < records.length; i++) {
    const line = i + 1;
    const cells = records[i];
    if (!cells) {
      continue;
    }
    const normalized = normalizeDegiroDataRow(cells, expectedCols);
    if (normalized === null) {
      errors.push(
        `Line ${line}: could not normalize to ${expectedCols} columns (got ${cells.length}); check Degiro Transactions CSV shape`,
      );
      continue;
    }

    if (shouldSkipDegiroNonTradeRow(normalized)) {
      continue;
    }

    const currency = normalizeDegiroCell(
      normalized[COL_CURRENCY] ?? "",
    ).toUpperCase();
    if (currency !== "EUR") {
      errors.push(
        `Line ${line}: only EUR trades are supported; got currency "${currency}"`,
      );
      continue;
    }

    const isin = normalizeDegiroCell(normalized[COL_ISIN] ?? "");
    const product = normalizeDegiroCell(normalized[COL_PRODUCT] ?? "");
    const referenceExchange = normalizeDegiroCell(
      normalized[COL_REF_EXCHANGE] ?? "",
    ).toUpperCase();
    const venue = normalizeDegiroCell(
      normalized[COL_VENUE] ?? "",
    ).toUpperCase();
    const qtyStr = parseEuropeanDecimalString(normalized[COL_QTY] ?? "");
    if (qtyStr === null) {
      errors.push(`Line ${line}: invalid quantity "${normalized[COL_QTY]}"`);
      continue;
    }
    const qtyNum = Number.parseFloat(qtyStr);
    if (!Number.isFinite(qtyNum) || qtyNum === 0) {
      errors.push(`Line ${line}: quantity must be non-zero`);
      continue;
    }

    const priceStr = parseEuropeanDecimalString(normalized[COL_PRICE] ?? "");
    if (priceStr === null) {
      errors.push(`Line ${line}: invalid price "${normalized[COL_PRICE]}"`);
      continue;
    }
    const priceNum = Number.parseFloat(priceStr);
    if (!Number.isFinite(priceNum)) {
      errors.push(`Line ${line}: invalid price "${normalized[COL_PRICE]}"`);
      continue;
    }
    const calendarIso = parseDegiroTradeDateDdMmYyyy(
      normalized[COL_DATE] ?? "",
    );
    if (!calendarIso) {
      errors.push(`Line ${line}: invalid date "${normalized[COL_DATE]}"`);
      continue;
    }
    const timeHhMm = parseDegiroTradeTimeHhMm(normalized[COL_TIME] ?? "");
    const tradeDate = timeHhMm
      ? degiroDateWallTimeToIsoUtc(calendarIso, timeHhMm)
      : `${calendarIso}T00:00:00.000Z`;

    fills.push({
      line,
      normalized,
      tradeDate,
      isin,
      product,
      referenceExchange,
      venue,
      qtySigned: qtyNum,
      priceNum,
      unitPriceStr: priceStr,
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const byOrderId = new Map<string, DegiroFill[]>();
  for (const f of fills) {
    const oid = extractDegiroOrderId(f.normalized);
    const key = oid.length > 0 ? oid : `__noid_${f.line}`;
    const list = byOrderId.get(key);
    if (list) {
      list.push(f);
    } else {
      byOrderId.set(key, [f]);
    }
  }

  const rows: DegiroParsedRow[] = [];
  for (const [, group] of byOrderId) {
    const out = validateAndAggregateDegiroFills(group);
    if ("error" in out) {
      errors.push(out.error);
    } else {
      rows.push(out.row);
    }
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
