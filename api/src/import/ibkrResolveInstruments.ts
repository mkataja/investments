import { normalizeIsinForStorage } from "@investments/lib/isin";
import { normalizeYahooSymbolForStorage } from "@investments/lib/yahooSymbol";
import type { InstrumentRow } from "../service/portfolio/valuation.js";

function isTradableKind(k: string): k is "etf" | "stock" | "custom" {
  return k === "etf" || k === "stock" || k === "custom";
}

/**
 * IBKR tickers may use spaces (e.g. `BRK B`) while Yahoo uses `BRK-B` / `BRK.B`.
 */
export function yahooSymbolLookupCandidates(ibkrSymbol: string): string[] {
  const raw = ibkrSymbol.trim();
  if (raw.length === 0) {
    return [];
  }
  const upper = normalizeYahooSymbolForStorage(raw);
  const noSpace = upper.replace(/\s+/g, "");
  const dash = upper.replace(/\s+/g, "-");
  const dot = upper.replace(/\s+/g, ".");
  return [...new Set([upper, noSpace, dash, dot])];
}

/**
 * IBKR often reports a short listing symbol (e.g. `SPYI`) while Yahoo storage uses
 * exchange-qualified tickers (`SPYI.DE`). Match base ticker to those listings.
 */
function collectInstrumentIdsByIbkrYahooListing(
  ibkrSymbolRaw: string,
  instRows: InstrumentRow[],
): number[] {
  const base = normalizeYahooSymbolForStorage(ibkrSymbolRaw);
  if (base.length === 0) {
    return [];
  }
  const ids: number[] = [];
  for (const row of instRows) {
    if (!isTradableKind(row.kind) || !row.yahooSymbol) {
      continue;
    }
    const s = normalizeYahooSymbolForStorage(row.yahooSymbol);
    if (s.length === 0) {
      continue;
    }
    if (s === base || s.startsWith(`${base}.`) || s.startsWith(`${base}-`)) {
      ids.push(row.id);
    }
  }
  return ids;
}

type IbkrResolveRowInput = {
  symbolRaw: string;
  /** Normalized 12-char ISIN from the CSV, or null when absent. */
  isin: string | null;
};

/**
 * Map each parsed IBKR row to an instrument: **`instruments.isin`** when the CSV ISIN matches,
 * otherwise Yahoo symbol candidates vs **`instruments.yahoo_symbol`**.
 */
export function resolveIbkrInstrumentRows(
  rows: readonly IbkrResolveRowInput[],
  instRows: InstrumentRow[],
):
  | { ok: true; instrumentIds: number[] }
  | {
      ok: false;
      missingSymbols: string[];
      ambiguousSymbols: string[];
      ambiguousIsins?: string[];
      /** CSV ISIN with no matching `instruments.isin` and Yahoo resolution also failed. */
      missingIsins?: string[];
      message: string;
    } {
  const idsByIsin = new Map<string, number[]>();
  const idsByCandidate = new Map<string, number[]>();

  for (const row of instRows) {
    if (!isTradableKind(row.kind)) {
      continue;
    }
    const ni = normalizeIsinForStorage(row.isin);
    if (ni) {
      const list = idsByIsin.get(ni) ?? [];
      list.push(row.id);
      idsByIsin.set(ni, list);
    }
    if (row.yahooSymbol) {
      const stored = normalizeYahooSymbolForStorage(row.yahooSymbol);
      if (stored.length > 0) {
        const list = idsByCandidate.get(stored) ?? [];
        list.push(row.id);
        idsByCandidate.set(stored, list);
      }
    }
  }

  const instrumentIds: number[] = [];
  const missingSymbols = new Set<string>();
  const ambiguousSymbols = new Set<string>();
  const ambiguousIsins = new Set<string>();
  const missingIsins = new Set<string>();

  for (const row of rows) {
    let id: number | undefined;
    let skipYahoo = false;

    if (row.isin) {
      const byIsin = idsByIsin.get(row.isin) ?? [];
      if (byIsin.length === 1) {
        id = byIsin[0];
      } else if (byIsin.length > 1) {
        ambiguousIsins.add(row.isin);
        skipYahoo = true;
      }
    }

    if (id === undefined && !skipYahoo) {
      const candidates = yahooSymbolLookupCandidates(row.symbolRaw);
      const matchedIds = new Set<number>();
      for (const c of candidates) {
        const ids = idsByCandidate.get(c) ?? [];
        for (const i of ids) {
          matchedIds.add(i);
        }
      }
      let unique = [...matchedIds];
      if (unique.length === 0) {
        const prefixIds = collectInstrumentIdsByIbkrYahooListing(
          row.symbolRaw,
          instRows,
        );
        unique = [...new Set(prefixIds)];
      }
      if (unique.length === 1) {
        id = unique[0];
      } else if (unique.length === 0) {
        missingSymbols.add(row.symbolRaw);
        if (row.isin && (idsByIsin.get(row.isin) ?? []).length === 0) {
          missingIsins.add(row.isin);
        }
      } else {
        ambiguousSymbols.add(row.symbolRaw);
      }
    }

    if (id !== undefined) {
      instrumentIds.push(id);
    }
  }

  if (ambiguousIsins.size > 0) {
    return {
      ok: false,
      missingSymbols: [...missingSymbols],
      ambiguousSymbols: [...ambiguousSymbols],
      ambiguousIsins: [...ambiguousIsins],
      message:
        "Each ISIN in the CSV must match at most one instrument in the database.",
    };
  }

  if (missingSymbols.size > 0 || ambiguousSymbols.size > 0) {
    return {
      ok: false,
      missingSymbols: [...missingSymbols],
      ambiguousSymbols: [...ambiguousSymbols],
      ...(missingIsins.size > 0 ? { missingIsins: [...missingIsins] } : {}),
      message:
        "Each IBKR row must resolve to exactly one instrument: match ISIN when present, otherwise Yahoo symbol (including exchange suffix, e.g. SPYI.DE).",
    };
  }

  return { ok: true, instrumentIds };
}
