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

function headersMatch(actual: readonly string[]): boolean {
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
  } else {
    return {
      error: `Line ${line}: expected Tyyppi Merkintä or Lunastus, got "${tyyppiRaw.trim()}"`,
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

export function parseSeligsonTransactionsTsv(
  tsvText: string,
): ParseSeligsonTsvResult {
  const errors: string[] = [];
  const lines = splitTsvLines(tsvText);
  if (lines.length === 0) {
    return { ok: false, errors: ["TSV is empty"] };
  }

  const headerRow = trimTrailingEmptyCells(splitTsvRow(lines[0] ?? ""));
  if (!headersMatch(headerRow)) {
    return {
      ok: false,
      errors: [
        "First row must be the Seligson portfolio export header (8 columns, exact Finnish titles).",
      ],
    };
  }

  const rows: SeligsonParsedRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const lineNum = i + 1;
    const rawCells = splitTsvRow(lines[i] ?? "");
    const cells = trimTrailingEmptyCells(rawCells);

    if (cells.length !== SELIGSON_TSV_HEADER.length) {
      errors.push(
        `Line ${lineNum}: expected ${SELIGSON_TSV_HEADER.length} columns, got ${cells.length}`,
      );
      continue;
    }

    const tradeDate = parseSeligsonTradeDateDMY(cells[1] ?? "");
    if (tradeDate === null) {
      errors.push(
        `Line ${lineNum}: invalid Arvopäivä "${cells[1]}" (expected d.m.yyyy)`,
      );
      continue;
    }

    const tyyppiOut = resolveTyyppi(cells[2] ?? "", cells[7] ?? "", lineNum);
    if ("error" in tyyppiOut) {
      errors.push(tyyppiOut.error);
      continue;
    }
    const { kind } = tyyppiOut;

    const fundName = normalizeCell(cells[3] ?? "");
    if (fundName.length === 0) {
      errors.push(`Line ${lineNum}: Rahasto is empty`);
      continue;
    }

    const unitPriceStr = parseEuropeanDecimalString(cells[4] ?? "");
    if (unitPriceStr === null) {
      errors.push(`Line ${lineNum}: invalid Osuuden arvo € "${cells[4]}"`);
      continue;
    }

    const qtyStr = parseEuropeanDecimalString(cells[5] ?? "");
    if (qtyStr === null) {
      errors.push(`Line ${lineNum}: invalid Osuuksien määrä "${cells[5]}"`);
      continue;
    }
    const qtyNum = Number.parseFloat(qtyStr);
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      errors.push(
        `Line ${lineNum}: Osuuksien määrä must be positive, got "${cells[5]}"`,
      );
      continue;
    }

    const quantity = qtyStr;

    const side: "buy" | "sell" = kind === "Merkintä" ? "buy" : "sell";

    const externalId = buildSeligsonExternalId(
      tradeDate,
      kind,
      fundName,
      quantity,
    );

    rows.push({
      tradeDate,
      side,
      fundName,
      quantity,
      unitPrice: unitPriceStr,
      currency: "EUR",
      unitPriceEur: unitPriceStr,
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
