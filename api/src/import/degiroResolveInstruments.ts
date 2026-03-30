import type { InstrumentRow } from "../lib/valuation.js";
import {
  fetchOpenFigiMapping,
  yahooSymbolCandidatesFromOpenFigiRows,
} from "./openFigi.js";

const OPENFIGI_GAP_MS = 120;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isTradableKind(k: string): k is "etf" | "stock" | "seligson_fund" {
  return k === "etf" || k === "stock" || k === "seligson_fund";
}

/**
 * Map each distinct CSV ISIN to a single instrument id.
 * Uses `instruments.isin` first, then OpenFIGI listing → Yahoo symbol candidates vs `instruments.yahoo_symbol`.
 */
export async function resolveDegiroInstrumentIds(
  uniqueIsins: readonly string[],
  instRows: InstrumentRow[],
): Promise<
  | { ok: true; instrumentIdByIsin: Map<string, number> }
  | {
      ok: false;
      missingIsins: string[];
      ambiguousIsins: string[];
      message: string;
    }
> {
  const idsByIsin = new Map<string, number[]>();
  const yahooLowerToIds = new Map<string, number[]>();

  for (const row of instRows) {
    if (!isTradableKind(row.kind)) {
      continue;
    }
    if (row.isin) {
      const list = idsByIsin.get(row.isin) ?? [];
      list.push(row.id);
      idsByIsin.set(row.isin, list);
    }
    if (row.yahooSymbol) {
      const y = row.yahooSymbol.trim().toLowerCase();
      if (y.length > 0) {
        const list = yahooLowerToIds.get(y) ?? [];
        list.push(row.id);
        yahooLowerToIds.set(y, list);
      }
    }
  }

  const instrumentIdByIsin = new Map<string, number>();
  const needOpenFigi: string[] = [];

  for (const isin of uniqueIsins) {
    const ids = idsByIsin.get(isin) ?? [];
    if (ids.length === 1) {
      const id = ids[0];
      if (id !== undefined) {
        instrumentIdByIsin.set(isin, id);
      }
      continue;
    }
    if (ids.length > 1) {
      return {
        ok: false,
        missingIsins: [],
        ambiguousIsins: [isin],
        message: "Multiple instruments share the same ISIN in the database.",
      };
    }
    needOpenFigi.push(isin);
  }

  const openFigiByIsin = new Map<
    string,
    Awaited<ReturnType<typeof fetchOpenFigiMapping>>
  >();

  for (let i = 0; i < needOpenFigi.length; i++) {
    const isin = needOpenFigi[i];
    if (isin === undefined) {
      continue;
    }
    if (i > 0) {
      await sleep(OPENFIGI_GAP_MS);
    }
    try {
      const data = await fetchOpenFigiMapping(isin);
      openFigiByIsin.set(isin, data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        missingIsins: needOpenFigi,
        ambiguousIsins: [],
        message: `OpenFIGI request failed: ${msg}`,
      };
    }
  }

  const missingIsins: string[] = [];
  const ambiguousIsins: string[] = [];

  for (const isin of needOpenFigi) {
    const figiRows = openFigiByIsin.get(isin) ?? [];
    const candidates = yahooSymbolCandidatesFromOpenFigiRows(isin, figiRows);
    const matchedIds = new Set<number>();
    for (const [yLower, ids] of yahooLowerToIds) {
      if (!candidates.has(yLower)) {
        continue;
      }
      for (const id of ids) {
        matchedIds.add(id);
      }
    }
    const unique = [...matchedIds];
    if (unique.length === 1) {
      const id = unique[0];
      if (id !== undefined) {
        instrumentIdByIsin.set(isin, id);
      }
      continue;
    }
    if (unique.length === 0) {
      missingIsins.push(isin);
    } else {
      ambiguousIsins.push(isin);
    }
  }

  if (missingIsins.length > 0 || ambiguousIsins.length > 0) {
    return {
      ok: false,
      missingIsins,
      ambiguousIsins,
      message:
        "Resolve instruments before import (match ISIN in the database, or register Yahoo-listed instruments so OpenFIGI can map ISIN → Yahoo symbol).",
    };
  }

  return { ok: true, instrumentIdByIsin };
}
