import { normalizeYahooSymbolForStorage } from "@investments/lib/yahooSymbol";
import {
  type YahooInstrumentLookup,
  buildYahooInstrumentLookup,
  displayNameFromYahooLookup,
  fetchYahooQuoteSummaryRaw,
} from "../distributions/yahoo.js";
import { yahooFinance } from "../lib/yahooClient.js";
import type { DegiroParsedRow } from "./degiroTransactions.js";
import {
  type OpenFigiMappingRow,
  yahooSymbolCandidatesFromOpenFigiRows,
} from "./openFigi.js";

type DegiroInstrumentProposalOk = {
  isin: string;
  product: string;
  referenceExchange: string;
  venue: string;
  yahooSymbol: string;
  displayName: string;
  kind: "etf" | "stock";
  quoteType: string | null;
};

type DegiroInstrumentProposalErr = {
  isin: string;
  product: string;
  referenceExchange: string;
  venue: string;
  error: string;
};

type DegiroInstrumentProposal =
  | DegiroInstrumentProposalOk
  | DegiroInstrumentProposalErr;

function sampleRowForIsin(
  rows: readonly DegiroParsedRow[],
  isin: string,
): DegiroParsedRow | undefined {
  return rows.find((r) => r.isin === isin);
}

function inferKind(lookup: YahooInstrumentLookup): "etf" | "stock" {
  const qt = lookup.quoteType?.toUpperCase();
  if (qt === "ETF") {
    return "etf";
  }
  return "stock";
}

/** Prefer venue-consistent Yahoo suffixes when multiple listings exist. */
function sortYahooCandidates(
  candidatesLower: string[],
  sample: DegiroParsedRow,
): string[] {
  const ref = sample.referenceExchange.toUpperCase();
  const uniq = [...new Set(candidatesLower)];
  return uniq.sort((a, b) => {
    if (ref === "XET") {
      const aDe = a.endsWith(".de") ? 0 : 1;
      const bDe = b.endsWith(".de") ? 0 : 1;
      if (aDe !== bDe) {
        return aDe - bDe;
      }
    }
    if (ref === "EAM" || ref === "AM") {
      const aAs = a.endsWith(".as") ? 0 : 1;
      const bAs = b.endsWith(".as") ? 0 : 1;
      if (aAs !== bAs) {
        return aAs - bAs;
      }
    }
    if (ref === "HSE") {
      const aHe = a.endsWith(".he") ? 0 : 1;
      const bHe = b.endsWith(".he") ? 0 : 1;
      if (aHe !== bHe) {
        return aHe - bHe;
      }
    }
    return a.localeCompare(b);
  });
}

async function tryYahooSymbol(
  symbol: string,
): Promise<{ lookup: YahooInstrumentLookup; displayName: string } | null> {
  try {
    const raw = await fetchYahooQuoteSummaryRaw(symbol);
    const lookup = buildYahooInstrumentLookup(raw, symbol);
    const displayName = displayNameFromYahooLookup(lookup, symbol);
    return { lookup, displayName };
  } catch {
    return null;
  }
}

async function yahooSymbolsFromIsinSearch(isin: string): Promise<string[]> {
  try {
    const q = await yahooFinance.search(isin, { quotesCount: 12 });
    const quotes = q.quotes ?? [];
    const out: string[] = [];
    for (const item of quotes) {
      if (
        item &&
        typeof item === "object" &&
        "symbol" in item &&
        typeof (item as { symbol: unknown }).symbol === "string" &&
        (item as { isYahooFinance?: boolean }).isYahooFinance === true
      ) {
        const sym = (item as { symbol: string }).symbol.trim();
        if (sym.length > 0) {
          out.push(sym);
        }
      }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * For each missing ISIN, pick a Yahoo listing (OpenFIGI candidates, then Yahoo search),
 * fetch `quoteSummary`, and return display metadata for the UI.
 */
export async function buildDegiroInstrumentProposals(
  missingIsins: readonly string[],
  rows: readonly DegiroParsedRow[],
  openFigiByIsin: Map<string, OpenFigiMappingRow[]>,
): Promise<DegiroInstrumentProposal[]> {
  const out: DegiroInstrumentProposal[] = [];

  for (const isin of missingIsins) {
    const sample = sampleRowForIsin(rows, isin);
    const product = sample?.product ?? "";
    const referenceExchange = sample?.referenceExchange ?? "";
    const venue = sample?.venue ?? "";

    if (!sample) {
      out.push({
        isin,
        product,
        referenceExchange,
        venue,
        error: "No CSV row found for this ISIN.",
      });
      continue;
    }

    const figiRows = openFigiByIsin.get(isin) ?? [];
    const fromOpenFigi = yahooSymbolCandidatesFromOpenFigiRows(isin, figiRows);
    const candidateList = sortYahooCandidates([...fromOpenFigi], sample);

    let resolved: {
      yahooSymbol: string;
      displayName: string;
      kind: "etf" | "stock";
      quoteType: string | null;
    } | null = null;

    for (const lower of candidateList) {
      const hit = await tryYahooSymbol(lower);
      if (hit) {
        resolved = {
          yahooSymbol: lower,
          displayName: hit.displayName,
          kind: inferKind(hit.lookup),
          quoteType: hit.lookup.quoteType,
        };
        break;
      }
    }

    if (resolved === null) {
      const fromSearch = await yahooSymbolsFromIsinSearch(isin);
      const searchSorted = sortYahooCandidates(
        fromSearch.map((s) => s.toLowerCase()),
        sample,
      );
      for (const lower of searchSorted) {
        const hit = await tryYahooSymbol(lower);
        if (hit) {
          resolved = {
            yahooSymbol: lower,
            displayName: hit.displayName,
            kind: inferKind(hit.lookup),
            quoteType: hit.lookup.quoteType,
          };
          break;
        }
      }
    }

    if (resolved === null) {
      out.push({
        isin,
        product,
        referenceExchange,
        venue,
        error:
          "Could not load Yahoo Finance details for this ISIN. Add the instrument manually on the instruments page.",
      });
      continue;
    }

    out.push({
      isin,
      product,
      referenceExchange,
      venue,
      yahooSymbol: normalizeYahooSymbolForStorage(resolved.yahooSymbol),
      displayName: resolved.displayName,
      kind: resolved.kind,
      quoteType: resolved.quoteType,
    });
  }

  return out;
}
