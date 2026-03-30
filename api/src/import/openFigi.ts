/**
 * OpenFIGI (Bloomberg) listing data for ISIN → Yahoo symbol candidates.
 * Used by Degiro import when `instruments.isin` does not match the CSV ISIN.
 *
 * @see https://www.openfigi.com/api
 */

export type OpenFigiMappingRow = {
  ticker: string;
  exchCode: string;
};

const OPENFIGI_URL = "https://api.openfigi.com/v3/mapping";

/**
 * Bloomberg exchange codes for Deutsche Börse / German on-exchange listings
 * (Xetra, Tradegate, etc.). Kept conservative—ambiguous `X*` codes are mapped elsewhere.
 */
const GERMAN_BLOOMBERG_EXCH_CODES = new Set([
  "GR",
  "GT",
  "GD",
  "GF",
  "GH",
  "GI",
  "GM",
  "GS",
  "GL",
  "GY",
  "GW",
  "GC",
  "DU",
]);

/** Single-letter or special Bloomberg codes → Yahoo suffix (lowercase, no dot). */
const EXCH_CODE_TO_YAHOO_SUFFIX: Record<string, string> = {
  LN: "l",
  IM: "mi",
  FH: "he",
  SW: "sw",
  SE: "sw",
  PA: "pa",
  FP: "pa",
  PE: "pa",
  SS: "st",
  CO: "co",
  DC: "co",
  HK: "hk",
  T: "t",
  TO: "to",
  V: "v",
  CN: "cn",
  AU: "ax",
  NZ: "nz",
  JK: "jk",
  KS: "ks",
  TW: "tw",
  BR: "sa",
  MX: "mx",
  CI: "sn",
  AR: "ba",
  PL: "wa",
  PR: "pr",
  NO: "ol",
  BU: "bu",
  VI: "vi",
  PS: "as",
  TG: "tl",
  TH: "bk",
  MA: "kl",
  IS: "ic",
  IR: "ir",
  TB: "tw",
  Q: "qa",
  AB: "st",
  BB: "br",
  HB: "br",
  /** Often London (XLON); aligns with `LN` for many UCITS listings. */
  XL: "l",
};

function isUsIsin(isin: string): boolean {
  return isin.startsWith("US");
}

function isEuUcitsStyleIsin(isin: string): boolean {
  const p = isin.slice(0, 2);
  return (
    p === "IE" ||
    p === "LU" ||
    p === "DE" ||
    p === "FR" ||
    p === "NL" ||
    p === "FI" ||
    p === "SE" ||
    p === "DK" ||
    p === "NO" ||
    p === "AT" ||
    p === "IT" ||
    p === "ES" ||
    p === "BE"
  );
}

/**
 * Map a Bloomberg `exchCode` + ISIN to Yahoo Finance `.{suffix}` (without leading dot).
 * Returns multiple suffixes when the same code can appear on Yahoo under more than one.
 */
export function bloombergExchCodeToYahooSuffixes(
  exchCode: string,
  isin: string,
): string[] | null {
  const code = exchCode.trim().toUpperCase();
  if (code.length === 0) {
    return null;
  }

  if (GERMAN_BLOOMBERG_EXCH_CODES.has(code)) {
    return ["de"];
  }

  const direct = EXCH_CODE_TO_YAHOO_SUFFIX[code];
  if (direct) {
    return [direct];
  }

  if (code === "NA") {
    if (isUsIsin(isin)) {
      return ["us"];
    }
    if (isEuUcitsStyleIsin(isin)) {
      return ["as"];
    }
    return ["as", "us"];
  }

  if (code === "PZ") {
    return ["as"];
  }

  if (code === "EU" || code === "E1") {
    if (isEuUcitsStyleIsin(isin)) {
      return ["as", "pa"];
    }
    return ["as"];
  }

  return null;
}

function normalizeTickerForYahoo(ticker: string): string | null {
  const t = ticker.trim().toUpperCase();
  if (t.length === 0) {
    return null;
  }
  if (!/^[A-Z0-9][A-Z0-9.-]*$/.test(t)) {
    return null;
  }
  return t;
}

/** Build Yahoo symbol candidates for one OpenFIGI listing row. */
export function openfigiRowToYahooSymbols(
  row: OpenFigiMappingRow,
  isin: string,
): string[] {
  const ticker = normalizeTickerForYahoo(row.ticker);
  if (ticker === null) {
    return [];
  }
  const suffixes = bloombergExchCodeToYahooSuffixes(row.exchCode, isin);
  if (suffixes === null) {
    return [];
  }
  const out: string[] = [];
  for (const suf of suffixes) {
    out.push(`${ticker}.${suf}`);
  }
  return out;
}

export async function fetchOpenFigiMapping(
  isin: string,
): Promise<OpenFigiMappingRow[]> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const key = process.env.OPENFIGI_API_KEY?.trim();
  if (key) {
    headers["X-OPENFIGI-APIKEY"] = key;
  }

  const res = await fetch(OPENFIGI_URL, {
    method: "POST",
    headers,
    body: JSON.stringify([{ idType: "ID_ISIN", idValue: isin }]),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `OpenFIGI HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
    );
  }

  const json = (await res.json()) as unknown;
  if (!Array.isArray(json) || json.length === 0) {
    return [];
  }

  const first = json[0] as {
    data?: OpenFigiMappingRow[];
    error?: string;
  };

  if (typeof first.error === "string" && first.error.length > 0) {
    throw new Error(`OpenFIGI: ${first.error}`);
  }

  const data = first.data;
  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .filter(
      (r): r is OpenFigiMappingRow =>
        r != null &&
        typeof (r as OpenFigiMappingRow).ticker === "string" &&
        typeof (r as OpenFigiMappingRow).exchCode === "string",
    )
    .map((r) => ({
      ticker: r.ticker,
      exchCode: r.exchCode,
    }));
}

/** Union of Yahoo symbols derived from all OpenFIGI listings for an ISIN. */
export function yahooSymbolCandidatesFromOpenFigiRows(
  isin: string,
  rows: OpenFigiMappingRow[],
): Set<string> {
  const set = new Set<string>();
  for (const row of rows) {
    for (const sym of openfigiRowToYahooSymbols(row, isin)) {
      set.add(sym.toLowerCase());
    }
  }
  return set;
}
