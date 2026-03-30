import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";

/**
 * Degiro “Transactions” export: 18 columns as `csv-parse` sees them.
 * The last column is an empty field from the trailing comma after `Order ID`.
 * Data rows sometimes omit the empty field *before* the Order ID UUID (17 columns);
 * {@link normalizeDegiroDataRow} inserts it so fingerprints stay stable.
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

export function isDegiroOrderIdCell(s: string): boolean {
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
const COL_ISIN = 3;
const COL_QTY = 6;
const COL_PRICE = 7;
const COL_CURRENCY = 8;

export type DegiroParsedRow = {
  tradeDate: string;
  isin: string;
  side: "buy" | "sell";
  /** Absolute quantity as decimal string (matches DB numeric). */
  quantity: string;
  unitPrice: string;
  currency: string;
  unitPriceEur: string;
  /** Hex sha256 of canonical row; used as `external_id`. */
  externalId: string;
};

function normalizeUnicodeMinus(s: string): string {
  return s.replace(/\u2212/g, "-");
}

/** Normalize a cell for hashing and comparison (trim, minus sign). */
export function normalizeDegiroCell(cell: string): string {
  return normalizeUnicodeMinus(cell.trim());
}

/** Stable row fingerprint for idempotent imports (Order ID is not unique per line). */
export function fingerprintDegiroRow(cells: readonly string[]): string {
  if (cells.length !== DEGIRO_TRANSACTIONS_HEADER.length) {
    throw new Error(
      `Expected ${DEGIRO_TRANSACTIONS_HEADER.length} columns, got ${cells.length}`,
    );
  }
  const canonical = cells.map(normalizeDegiroCell).join("|");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
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

export type ParseDegiroCsvResult =
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
  const rows: DegiroParsedRow[] = [];

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
    if (!/^[A-Z0-9]{12}$/.test(isin)) {
      errors.push(`Line ${line}: invalid or missing ISIN "${isin}"`);
      continue;
    }

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

    const qtyAbs = Math.abs(qtyNum);
    const quantity = String(qtyAbs);
    const side: "buy" | "sell" = qtyNum > 0 ? "buy" : "sell";

    const priceStr = parseEuropeanDecimalString(normalized[COL_PRICE] ?? "");
    if (priceStr === null) {
      errors.push(`Line ${line}: invalid price "${normalized[COL_PRICE]}"`);
      continue;
    }

    const tradeDate = parseDegiroTradeDateDdMmYyyy(normalized[COL_DATE] ?? "");
    if (!tradeDate) {
      errors.push(`Line ${line}: invalid date "${normalized[COL_DATE]}"`);
      continue;
    }

    let externalId: string;
    try {
      externalId = fingerprintDegiroRow(normalized);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`Line ${line}: ${msg}`);
      continue;
    }

    rows.push({
      tradeDate,
      isin,
      side,
      quantity,
      unitPrice: priceStr,
      currency,
      unitPriceEur: priceStr,
      externalId,
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, rows };
}
