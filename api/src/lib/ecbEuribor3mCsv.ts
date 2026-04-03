import { parse } from "csv-parse/sync";

const EURIBOR_MARKER = "Euribor 3-month";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/** ECB values are percentages as decimal strings; store as fraction without float noise. */
function ecbPercentStringToFractionString(percentRaw: string): string {
  const trimmed = percentRaw.trim();
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1).trim() : trimmed;
  const parts = unsigned.split(".");
  if (parts.length > 2) {
    throw new Error(`Bad rate column: ${JSON.stringify(percentRaw)}`);
  }
  const intPart = (parts[0] ?? "0").replace(/^0+/, "") || "0";
  const fracPart = parts[1] ?? "";
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(fracPart)) {
    throw new Error(`Bad rate column: ${JSON.stringify(percentRaw)}`);
  }
  const scale = fracPart.length;
  const numerator =
    BigInt(intPart) * 10n ** BigInt(scale) + BigInt(fracPart || "0");
  /** percent / 100 = numerator / 10^(scale+2) */
  const outScale = scale + 2;
  if (outScale === 0) {
    return numerator.toString();
  }
  const abs = numerator.toString().padStart(outScale + 1, "0");
  const whole = abs.slice(0, -outScale).replace(/^0+/, "") || "0";
  const frac = abs.slice(-outScale).replace(/0+$/, "");
  const positive = frac.length > 0 ? `${whole}.${frac}` : whole;
  return negative ? `-${positive}` : positive;
}

type EcbEuribor3mRow = {
  observationDate: string;
  /** Numeric string for `numeric` column; fraction (6% -> 0.06). */
  rateFraction: string;
};

/**
 * Parses ECB Data Portal CSV where the header row documents Euribor 3-month;
 * values in the file are percentages and are converted to fractions.
 */
export function parseEcbEuribor3mCsv(fileContent: string): EcbEuribor3mRow[] {
  const text = stripBom(fileContent.trimStart());
  const firstLineEnd = text.indexOf("\n");
  const firstLine = firstLineEnd === -1 ? text : text.slice(0, firstLineEnd);
  if (!firstLine.includes(EURIBOR_MARKER)) {
    throw new Error(
      `Expected CSV header to mention ${JSON.stringify(EURIBOR_MARKER)}`,
    );
  }

  const records = parse(text, {
    columns: false,
    skip_empty_lines: true,
    relax_quotes: true,
  });

  if (!Array.isArray(records) || records.length < 2) {
    throw new Error("CSV has no data rows");
  }

  const dataRows = records.slice(1);
  return dataRows.flatMap((row): EcbEuribor3mRow[] => {
    if (!Array.isArray(row) || row.length < 3) {
      return [];
    }
    const dateStr = String(row[0] ?? "").trim();
    const pctStr = String(row[2] ?? "").trim();
    if (!dateStr || !pctStr) {
      return [];
    }
    if (!DATE_RE.test(dateStr)) {
      throw new Error(`Bad DATE column: ${JSON.stringify(dateStr)}`);
    }
    return [
      {
        observationDate: dateStr,
        rateFraction: ecbPercentStringToFractionString(pctStr),
      },
    ];
  });
}
