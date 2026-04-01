import {
  normalizeUnicodeMinus,
  parseEuropeanDecimalString,
} from "./degiroTransactions.js";

export const SELIGSON_TSV_EXTERNAL_SOURCE = "seligson_tsv" as const;

/** Unit separator — unlikely in fund names; keeps external_id unambiguous. */
const EXTERNAL_ID_SEP = "\u001f";

export const SELIGSON_TSV_HEADER: readonly string[] = [
  "Salkku",
  "Arvopäivä",
  "Tyyppi",
  "Rahasto",
  "Osuuden arvo €",
  "Osuuksien määrä",
  "Palkkio €",
  "Summa €",
] as const;

/** Swedish UI — extra confirmation column after Summa €. */
export const SELIGSON_TSV_HEADER_SV: readonly string[] = [
  "Portfölj",
  "Valuteringsdag",
  "Typ",
  "Fond",
  "Andelsvärde €",
  "Antal andelar",
  "Provision €",
  "Summa €",
  "Bekräftelse av händelse",
] as const;

const SELIGSON_DATA_COLUMN_COUNT = SELIGSON_TSV_HEADER.length;

function normalizeCell(s: string): string {
  return normalizeUnicodeMinus(s.trim());
}

/** Seligson exports append (A) or (B) for Acc/Dst; strip for matching `seligson_funds.name`. */
export function normalizeSeligsonFundNameForMatch(name: string): string {
  return normalizeCell(name)
    .replace(/\s*\([AB]\)\s*$/i, "")
    .trim();
}

function trimTrailingEmptyCells(cells: readonly string[]): string[] {
  const row = cells.map((c) => String(c));
  while (row.length > 0 && normalizeCell(row[row.length - 1] ?? "") === "") {
    row.pop();
  }
  return row;
}

function headersMatchFi(actual: readonly string[]): boolean {
  if (actual.length !== SELIGSON_TSV_HEADER.length) {
    return false;
  }
  for (let i = 0; i < SELIGSON_TSV_HEADER.length; i++) {
    if (normalizeCell(actual[i] ?? "") !== SELIGSON_TSV_HEADER[i]) {
      return false;
    }
  }
  return true;
}

function headersMatchSv(actual: readonly string[]): boolean {
  if (actual.length !== SELIGSON_TSV_HEADER_SV.length) {
    return false;
  }
  for (let i = 0; i < SELIGSON_TSV_HEADER_SV.length; i++) {
    if (normalizeCell(actual[i] ?? "") !== SELIGSON_TSV_HEADER_SV[i]) {
      return false;
    }
  }
  return true;
}

function headersMatch(actual: readonly string[]): boolean {
  return headersMatchFi(actual) || headersMatchSv(actual);
}

/** `d.m.yyyy` (day/month variable width) → ISO `yyyy-mm-dd`. */
export function parseSeligsonTradeDateDMY(raw: string): string | null {
  const s = raw.trim();
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
  if (!m) {
    return null;
  }
  const g1 = m[1];
  const g2 = m[2];
  const g3 = m[3];
  if (g1 === undefined || g2 === undefined || g3 === undefined) {
    return null;
  }
  const dd = g1.padStart(2, "0");
  const mm = g2.padStart(2, "0");
  const yyyy = g3;
  return `${yyyy}-${mm}-${dd}`;
}

export type SeligsonTsvRowKind = "Merkintä" | "Lunastus";

function resolveTyyppi(
  tyyppiRaw: string,
  summaRaw: string,
  line: number,
): { kind: SeligsonTsvRowKind } | { error: string } {
  const sumDot = parseEuropeanDecimalString(summaRaw);
  if (sumDot === null) {
    return { error: `Line ${line}: invalid Summa € "${summaRaw}"` };
  }
  const sumNum = Number.parseFloat(sumDot);
  if (!Number.isFinite(sumNum)) {
    return { error: `Line ${line}: invalid Summa € "${summaRaw}"` };
  }

  const t = normalizeCell(tyyppiRaw);
  if (t === "") {
    if (sumNum > 0) {
      return { kind: "Merkintä" };
    }
    if (sumNum < 0) {
      return { kind: "Lunastus" };
    }
    return {
      error: `Line ${line}: Summa € is zero; cannot infer Tyyppi when empty`,
    };
  }

  let kind: SeligsonTsvRowKind;
  if (t === "Merkintä" || t.startsWith("Merkintä")) {
    kind = "Merkintä";
  } else if (t === "Lunastus" || t.startsWith("Lunastus")) {
    kind = "Lunastus";
  } else if (t === "Teckning" || t.startsWith("Teckning")) {
    kind = "Merkintä";
  } else if (t === "Inlösning" || t.startsWith("Inlösning")) {
    kind = "Lunastus";
  } else {
    return {
      error: `Line ${line}: unknown transaction type (expected e.g. Merkintä/Lunastus or Teckning/Inlösning), got "${tyyppiRaw.trim()}"`,
    };
  }

  if (kind === "Merkintä" && sumNum < 0) {
    return {
      error: `Line ${line}: Tyyppi Merkintä but Summa € is negative`,
    };
  }
  if (kind === "Lunastus" && sumNum > 0) {
    return {
      error: `Line ${line}: Tyyppi Lunastus but Summa € is positive`,
    };
  }

  return { kind };
}

export function buildSeligsonExternalId(
  tradeDateIso: string,
  kind: SeligsonTsvRowKind,
  fundName: string,
  quantityDecimal: string,
): string {
  return [tradeDateIso, kind, fundName.trim(), quantityDecimal].join(
    EXTERNAL_ID_SEP,
  );
}

export type SeligsonParsedRow = {
  tradeDate: string;
  side: "buy" | "sell";
  fundName: string;
  quantity: string;
  unitPrice: string;
  currency: string;
  unitPriceEur: string;
  externalId: string;
};

export type ParseSeligsonTsvResult =
  | { ok: true; rows: SeligsonParsedRow[] }
  | { ok: false; errors: string[] };

function splitTsvLines(text: string): string[] {
  const normalized = text.replace(/^\uFEFF/, "");
  return normalized.split(/\r?\n/).filter((line) => line.trim() !== "");
}

function splitTsvRow(line: string): string[] {
  return line.split("\t");
}

/** Account (4+ digits), tab, d.m.yyyy, tab — start of a transaction row in exports and copy-paste. */
const SELIGSON_TRANSACTION_START_RE = /^\d{4,}\t\d{1,2}\.\d{1,2}\.\d{4}\t/;

function isSeligsonSummaryFooterLine(line: string): boolean {
  const t = normalizeCell(line);
  if (t === "") {
    return false;
  }
  if (/yhteensä/i.test(t)) {
    return true;
  }
  if (/totalt\s+belopp/i.test(t)) {
    return true;
  }
  return false;
}

/** Four consecutive non-empty tab cells that parse as European decimals (Osuuden arvo ... Summa €). */
function parseFourNumericCellsFromLine(line: string): string[] | null {
  const parts = line.split("\t").map((c) => normalizeCell(c));
  const raw: string[] = [];
  for (const p of parts) {
    if (p === "") {
      continue;
    }
    if (parseEuropeanDecimalString(p) === null) {
      return null;
    }
    raw.push(p);
  }
  if (raw.length !== 4) {
    return null;
  }
  return raw;
}

function tryParseSeligsonDataCells(
  cells: readonly string[],
  lineNum: number,
): SeligsonParsedRow | { error: string } {
  if (
    cells.length !== SELIGSON_DATA_COLUMN_COUNT &&
    cells.length !== SELIGSON_TSV_HEADER_SV.length
  ) {
    return {
      error: `Line ${lineNum}: expected ${SELIGSON_DATA_COLUMN_COUNT} or ${SELIGSON_TSV_HEADER_SV.length} columns, got ${cells.length}`,
    };
  }

  const tradeDate = parseSeligsonTradeDateDMY(cells[1] ?? "");
  if (tradeDate === null) {
    return {
      error: `Line ${lineNum}: invalid Arvopäivä "${cells[1]}" (expected d.m.yyyy)`,
    };
  }

  const tyyppiResolved = resolveTyyppi(cells[2] ?? "", cells[7] ?? "", lineNum);
  if ("error" in tyyppiResolved) {
    return { error: tyyppiResolved.error };
  }
  const { kind } = tyyppiResolved;

  const fundName = normalizeCell(cells[3] ?? "");
  if (fundName.length === 0) {
    return { error: `Line ${lineNum}: Rahasto is empty` };
  }

  const unitPriceStr = parseEuropeanDecimalString(cells[4] ?? "");
  if (unitPriceStr === null) {
    return {
      error: `Line ${lineNum}: invalid Osuuden arvo € "${cells[4]}"`,
    };
  }

  const qtyStr = parseEuropeanDecimalString(cells[5] ?? "");
  if (qtyStr === null) {
    return {
      error: `Line ${lineNum}: invalid Osuuksien määrä "${cells[5]}"`,
    };
  }
  const qtyNum = Number.parseFloat(qtyStr);
  if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
    return {
      error: `Line ${lineNum}: Osuuksien määrä must be positive, got "${cells[5]}"`,
    };
  }

  const quantity = qtyStr;
  const side: "buy" | "sell" = kind === "Merkintä" ? "buy" : "sell";
  const externalId = buildSeligsonExternalId(
    tradeDate,
    kind,
    fundName,
    quantity,
  );

  return {
    tradeDate,
    side,
    fundName,
    quantity,
    unitPrice: unitPriceStr,
    currency: "EUR",
    unitPriceEur: unitPriceStr,
    externalId,
  };
}

function findNextTransactionLineIndex(
  lines: readonly string[],
  from: number,
): number {
  for (let j = from; j < lines.length; j++) {
    if (SELIGSON_TRANSACTION_START_RE.test(lines[j] ?? "")) {
      return j;
    }
  }
  return -1;
}

function looksLikeSingleLineDataRow(cells: readonly string[]): boolean {
  if (
    cells.length !== SELIGSON_DATA_COLUMN_COUNT &&
    cells.length !== SELIGSON_TSV_HEADER_SV.length
  ) {
    return false;
  }
  if (!/^\d+$/.test(cells[0] ?? "")) {
    return false;
  }
  return parseSeligsonTradeDateDMY(cells[1] ?? "") !== null;
}

/**
 * One transaction: either one line with 8 columns, or account/date/tyyppi (+ optional fund)
 * on the first line, fund name on the next line when missing, then a line with four numeric columns.
 */
function parseOneMessySeligsonTransaction(
  lines: readonly string[],
  startIdx: number,
): { row: SeligsonParsedRow; nextIndex: number } | { error: string } {
  const line0 = lines[startIdx] ?? "";
  const cells = trimTrailingEmptyCells(splitTsvRow(line0));
  const lineRef = `Line ${startIdx + 1}`;

  if (!SELIGSON_TRANSACTION_START_RE.test(line0)) {
    return {
      error: `${lineRef}: expected a row starting with account number and Arvopäivä`,
    };
  }

  if (looksLikeSingleLineDataRow(cells)) {
    const row = tryParseSeligsonDataCells(cells, startIdx + 1);
    if ("error" in row) {
      return { error: row.error };
    }
    return { row, nextIndex: startIdx + 1 };
  }

  if (cells.length < 3) {
    return {
      error: `${lineRef}: after account and date, expected Tyyppi (and optionally Rahasto on the same line)`,
    };
  }

  let fundName = "";
  if (cells.length >= 4) {
    fundName = normalizeCell(cells[3] ?? "");
  }

  let nextIdx = startIdx + 1;

  if (fundName === "") {
    while (nextIdx < lines.length) {
      const ln = lines[nextIdx] ?? "";
      if (isSeligsonSummaryFooterLine(ln)) {
        return {
          error: `${lineRef}: incomplete transaction (Rahasto and amount row missing before totals)`,
        };
      }
      if (SELIGSON_TRANSACTION_START_RE.test(ln)) {
        return {
          error: `${lineRef}: incomplete transaction (Rahasto missing before next transaction)`,
        };
      }
      if (normalizeCell(ln) !== "") {
        fundName = normalizeCell(ln);
        nextIdx++;
        break;
      }
      nextIdx++;
    }
  }

  if (fundName === "") {
    return { error: `${lineRef}: Rahasto is empty` };
  }

  if (nextIdx >= lines.length) {
    return {
      error: `${lineRef}: missing row with Osuuden arvo €, Osuuksien määrä, Palkkio €, Summa €`,
    };
  }

  const numLine = lines[nextIdx] ?? "";
  if (isSeligsonSummaryFooterLine(numLine)) {
    return {
      error: `${lineRef}: missing amount row (hit totals line instead)`,
    };
  }
  if (SELIGSON_TRANSACTION_START_RE.test(numLine)) {
    return {
      error: `${lineRef}: missing row with four amount columns (got next transaction instead)`,
    };
  }

  const four = parseFourNumericCellsFromLine(numLine);
  if (four === null) {
    return {
      error: `${lineRef}: expected a row with four amounts (Osuuden arvo € ... Summa €) after "${fundName.slice(0, 48)}${fundName.length > 48 ? "..." : ""}"`,
    };
  }

  const fullCells: string[] = [
    cells[0] ?? "",
    cells[1] ?? "",
    cells[2] ?? "",
    fundName,
    four[0] ?? "",
    four[1] ?? "",
    four[2] ?? "",
    four[3] ?? "",
  ];

  const row = tryParseSeligsonDataCells(fullCells, nextIdx + 1);
  if ("error" in row) {
    return { error: row.error };
  }
  return { row, nextIndex: nextIdx + 1 };
}

export function parseSeligsonTransactionsTsv(
  tsvText: string,
): ParseSeligsonTsvResult {
  const errors: string[] = [];
  const lines = splitTsvLines(tsvText);
  if (lines.length === 0) {
    return { ok: false, errors: ["TSV is empty"] };
  }

  const headerRow = trimTrailingEmptyCells(splitTsvRow(lines[0] ?? ""));
  const hasStrictHeader = headersMatch(headerRow);

  let useLegacyEightColumnRows = false;
  if (hasStrictHeader) {
    if (lines.length < 2) {
      return {
        ok: false,
        errors: ["No data rows after the header row"],
      };
    }
    const firstDataCells = trimTrailingEmptyCells(splitTsvRow(lines[1] ?? ""));
    useLegacyEightColumnRows = looksLikeSingleLineDataRow(firstDataCells);
  }

  const rows: SeligsonParsedRow[] = [];

  if (useLegacyEightColumnRows) {
    for (let i = 1; i < lines.length; i++) {
      const lineNum = i + 1;
      const rawCells = splitTsvRow(lines[i] ?? "");
      const cells = trimTrailingEmptyCells(rawCells);
      const row = tryParseSeligsonDataCells(cells, lineNum);
      if ("error" in row) {
        errors.push(row.error);
      } else {
        rows.push(row);
      }
    }
  } else {
    let i = hasStrictHeader ? 1 : findNextTransactionLineIndex(lines, 0);
    if (i < 0) {
      return {
        ok: false,
        errors: [
          "Could not find a Seligson transaction row (lines should start with the account number, then Arvopäivä as d.m.yyyy, then Tyyppi).",
        ],
      };
    }

    while (i < lines.length) {
      if (isSeligsonSummaryFooterLine(lines[i] ?? "")) {
        break;
      }
      if (!SELIGSON_TRANSACTION_START_RE.test(lines[i] ?? "")) {
        i++;
        continue;
      }

      const out = parseOneMessySeligsonTransaction(lines, i);
      if ("error" in out) {
        errors.push(out.error);
        const nextTxn = findNextTransactionLineIndex(lines, i + 1);
        if (nextTxn < 0) {
          break;
        }
        i = nextTxn;
        continue;
      }
      rows.push(out.row);
      i = out.nextIndex;
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  if (rows.length === 0) {
    return {
      ok: false,
      errors: [
        "No Seligson transactions were parsed (check account number, dates, fund name, and four amount columns).",
      ],
    };
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
