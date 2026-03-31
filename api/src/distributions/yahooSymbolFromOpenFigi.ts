import type { OpenFigiMappingRow } from "../import/openFigi.js";
import {
  openfigiRowToYahooSymbols,
  yahooSuffixForBloombergExchCode,
} from "../import/openFigi.js";
import { computeUsIsinFromCusip9 } from "./usIsinFromCusip.js";

/** US consolidated listing in OpenFIGI mapping responses. */
const US_CONSOLIDATED_EXCH = "US";

/**
 * Bloomberg exchange codes that represent US-listed venues where Yahoo uses the
 * bare ticker (e.g. AAPL).
 */
const US_LISTED_EXCH_CODES = new Set([
  "US",
  "UN",
  "UW",
  "UQ",
  "UM",
  "UP",
  "UB",
  "UC",
  "UA",
  "UX",
  "UF",
  "UD",
  "UT",
  "PQ",
  "PR",
  "PW",
  "PA",
  "PM",
  "PN",
  "PY",
  "PZ",
  "FI",
  "FU",
]);

function normalizeTicker(t: string): string | null {
  const x = t.trim().toUpperCase();
  if (x.length === 0 || !/^[A-Z0-9][A-Z0-9.-]*$/.test(x)) {
    return null;
  }
  return x;
}

/**
 * Ordered Yahoo Finance symbols to try for a CUSIP mapping (OpenFIGI rows).
 */
export function yahooSymbolCandidatesFromCusipFigiRows(
  rows: OpenFigiMappingRow[],
  cusip9: string,
): string[] {
  const out: string[] = [];
  const push = (s: string | null) => {
    if (s && !out.includes(s)) {
      out.push(s);
    }
  };

  const usIsin = computeUsIsinFromCusip9(cusip9);

  const usRow =
    rows.find((r) => r.exchCode === US_CONSOLIDATED_EXCH) ??
    rows.find((r) => US_LISTED_EXCH_CODES.has(r.exchCode.trim().toUpperCase()));

  if (usRow) {
    push(normalizeTicker(usRow.ticker));
  }

  for (const row of rows) {
    const t = normalizeTicker(row.ticker);
    if (!t) {
      continue;
    }
    if (US_LISTED_EXCH_CODES.has(row.exchCode.trim().toUpperCase())) {
      push(t);
    }
  }

  if (usIsin) {
    for (const row of rows) {
      for (const sym of openfigiRowToYahooSymbols(row, usIsin)) {
        push(sym);
      }
    }
  }

  for (const row of rows) {
    const t = normalizeTicker(row.ticker);
    if (!t) {
      continue;
    }
    const suf = yahooSuffixForBloombergExchCode(row.exchCode);
    if (suf) {
      push(`${t}.${suf}`);
    }
  }

  for (const row of rows) {
    push(normalizeTicker(row.ticker));
  }

  return out;
}
