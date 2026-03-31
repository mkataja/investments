import { seligsonHoldingsResolutionCache } from "@investments/db";
import type {
  DistributionPayload,
  DistributionSectorId,
} from "@investments/lib";
import {
  isDistributionSectorId,
  normalizeYahooSymbolForStorage,
  resolveRegionKeyToIso,
} from "@investments/lib";
import { and, eq, or } from "drizzle-orm";
import { db } from "../db.js";
import {
  type OpenFigiMappingRow,
  fetchOpenFigiMapping,
  yahooSymbolCandidatesFromOpenFigiRows,
} from "../import/openFigi.js";
import { yahooFinance } from "../lib/yahooClient.js";
import { mapSectorLabelToCanonicalIdWithWarn } from "./distributionNormalize.js";
import { SELIGSON_FINNISH_SECTOR_LABEL_MAP } from "./sectorMapping.js";
import {
  type SeligsonHoldingsRow,
  type SeligsonResolutionCacheKey,
  buildSeligsonResolutionCacheKey,
  isCashHoldingsRow,
  parseSeligsonHoldingsRows,
  serializeSeligsonResolutionCacheKey,
} from "./seligson.js";
import {
  type YahooQuoteSummaryRaw,
  buildYahooInstrumentLookup,
  displayNameFromYahooLookup,
  extractIsinFromQuoteSummaryRaw,
  fetchYahooQuoteSummaryRaw,
} from "./yahoo.js";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function yahooRefreshGapMs(): number {
  const n = Number.parseInt(process.env.YAHOO_MIN_INTERVAL_MS ?? "900", 10);
  return Number.isFinite(n) && n >= 0 ? n : 900;
}

function sectorFromToimiala(toimialaFi: string): DistributionSectorId {
  const t = toimialaFi.trim();
  return SELIGSON_FINNISH_SECTOR_LABEL_MAP[t] ?? "other";
}

export function normalizeIsin12(
  isin: string | null | undefined,
): string | null {
  if (!isin) {
    return null;
  }
  const n = isin.replace(/\s+/g, "").toUpperCase();
  return /^[A-Z0-9]{12}$/.test(n) ? n : null;
}

/**
 * Seligson sometimes appends `/Japan`, `/Canada`, or `/Delaware` to the company cell.
 */
function stripSeligsonRegionSuffix(s: string): string {
  return s
    .replace(/\s*\/\s*japan\s*$/i, "")
    .replace(/\s*\/\s*canada\s*$/i, "")
    .replace(/\s*\/\s*delaware\s*$/i, "")
    .trim();
}

/** Truncated English cell (e.g. "… group co of" missing "China"). */
function stripTrailingIncompleteOf(s: string): string {
  return s.replace(/\s+of\s*$/i, "").trim();
}

/** Seligson sometimes truncates mid-word with a trailing hyphen (e.g. "Rückversicherungs-"). */
function stripTrailingIncompleteHyphen(s: string): string {
  return s.replace(/-\s*$/g, "").trim();
}

/** Yahoo Finance search often ranks better without the `Oyj` tail (e.g. "aktia" vs "aktia oyj"). */
function stripFinnishOyjSearchSuffix(s: string): string {
  return s.replace(/\s+oyj\s*$/i, "").trim();
}

/** Yahoo `search` often returns nothing for `… kk` (kabushiki kaisha); try without the tail (e.g. `nippon yusen`). */
function stripJapaneseKkSearchSuffix(s: string): string {
  return s.replace(/\s+kk\s*$/i, "").trim();
}

/**
 * Seligson often uses `... cos inc/the`, `... co/the`, `bank ... /the`, `inc/md`, etc. Yahoo `search`
 * frequently returns **no** or **wrong** hits for those literals; emit cleaned phrases that match
 * issuer names (US/CA/… — not only FI).
 */
export function expandCoTheStyleSearchQueries(trimmed: string): string[] {
  const original = trimmed.trim();
  if (original.length === 0) {
    return [];
  }

  const x = original
    .replace(/\s+cos\s+inc\/the\b/gi, " companies")
    .replace(/\s+co\/the\b/gi, " company")
    .replace(/\s+corp\/the\b/gi, " corporation")
    .replace(/\binc\/md\b/gi, "inc")
    .replace(/\binc\/the\b/gi, "inc")
    .replace(/\s*\/the\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  const prepend: string[] = [];
  const ordered: string[] = [];
  const seen = new Set<string>();
  const add = (s: string, front = false) => {
    const t = s.trim().replace(/\s+/g, " ");
    if (t.length === 0 || seen.has(t) || t === original) {
      return;
    }
    seen.add(t);
    if (front) {
      prepend.push(t);
    } else {
      ordered.push(t);
    }
  };

  /**
   * High-priority search phrases — Yahoo often ranks junk ahead of the literal Seligson string
   * (e.g. Carrefour’s legal prefix returns Michelin tickers; Barrick’s long name returns nothing).
   */
  if (/\bcie\s+generale\s+des\s+etablissement/i.test(original)) {
    add("carrefour", true);
  }
  if (/\bbarrick\b/i.test(original) && /\bgold\b/i.test(original)) {
    add("ABX.TO", true);
    add("Barrick Mining", true);
  }
  if (/\bagnico\b/i.test(original) && /\beagle\b/i.test(original)) {
    add("AEM", true);
    add("agnico eagle", true);
  }

  if (/\s+llc$/i.test(x)) {
    add(x.replace(/\s+llc$/i, "").trim());
  }

  if (/\bcompanies$/i.test(x)) {
    const core = x.replace(/\s+companies$/i, "").trim();
    if (/-/.test(core)) {
      add(core);
      add(core.replace(/-/g, " "));
    }
  }

  add(x);
  add(x.replace(/-/g, " "));

  if (/\bvina\s+concha/i.test(x) && /\by\s+toro/i.test(x)) {
    add(
      x
        .replace(/^\s*vina\s+/i, "")
        .replace(/\s+sa$/i, "")
        .trim(),
    );
  }

  if (/\bpanalpina\b/i.test(original) && /\bdsv\b/i.test(original)) {
    add("dsv");
  }

  if (/^novonesis$/i.test(original)) {
    add("novonesis group");
  }

  if (/^serkland$/i.test(original)) {
    add("serkland capital");
  }

  if (/\bashtead\b/i.test(original)) {
    add("ashtead");
  }

  if (/\blvmh\b/i.test(original) && /\bmoet\b/i.test(original)) {
    add("lvmh");
  }

  if (/\bsabanci\b/i.test(original)) {
    add("sabanci holding");
  }

  return [...prepend, ...ordered];
}

/**
 * Yahoo `search` often returns **no** equity hits for full Seligson strings (e.g. `"metso outotec oyj"`
 * → empty; `"aktia oyj"` → empty). For **FI** rows, prepend queries that match how Yahoo lists names
 * today (e.g. **Metso Oyj** after Outotec demerger; **Aktia Pankki Oyj** vs English "Bank").
 */
export function buildYahooSearchQueriesForSeligson(
  primary: string,
  countryIso: string | null,
): string[] {
  const trimmed = primary.trim();
  if (trimmed.length === 0) {
    return [];
  }
  const secondary = stripFinnishOyjSearchSuffix(trimmed);
  const seen = new Set<string>();
  const ordered: string[] = [];
  const push = (q: string) => {
    const t = q.trim();
    if (t.length === 0 || seen.has(t)) {
      return;
    }
    seen.add(t);
    ordered.push(t);
  };

  if (countryIso === "FI") {
    if (/\boutotec\b/i.test(trimmed)) {
      const collapsed = trimmed
        .replace(/\boutotec\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (collapsed.length > 0) {
        push(collapsed);
      }
    }
    if (secondary.length > 0 && !/\s/.test(secondary)) {
      push(`${secondary} pankki`);
    }
  }

  if (countryIso === "JP") {
    const withoutKk = stripJapaneseKkSearchSuffix(trimmed);
    if (withoutKk.length > 0 && withoutKk !== trimmed) {
      push(withoutKk);
    }
  }

  if (countryIso === "HK") {
    if (
      /\bhong kong exchanges\b/i.test(trimmed) &&
      /\bclearing\b/i.test(trimmed)
    ) {
      push("hong kong exchange and clearing");
      push("HKEX");
    }
  }

  /** Copenhagen listing; Yahoo search often puts OTC (NVZMF) before the primary symbol. */
  if (countryIso === "DK" && /^novonesis$/i.test(trimmed)) {
    push("NSIS-B.CO");
  }

  /** Paris listing; `carrefour` search is enough but `CA.PA` avoids any bad secondary hits. */
  if (
    countryIso === "FR" &&
    /\bcie\s+generale\s+des\s+etablissements?\b/i.test(trimmed)
  ) {
    push("CA.PA");
  }

  for (const q of expandCoTheStyleSearchQueries(trimmed)) {
    push(q);
  }

  push(trimmed);
  if (secondary !== trimmed) {
    push(secondary);
  }

  return ordered;
}

function normalizeComparableName(s: string): string {
  const pre = stripTrailingIncompleteHyphen(
    stripTrailingIncompleteOf(stripSeligsonRegionSuffix(s)),
  )
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    /** Turkish İ/ı vs ASCII i (Yahoo uses Unicode; Seligson is often ASCII). */
    .replace(/\u0131/g, "i")
    .replace(/\u0130/g, "i");
  const withAnd = pre
    /** Nordic A/S — must not become `as` or it is stripped as Turkish A.Ş. */
    .replace(/\ba\s*\/\s*s\b/gi, " nordicas")
    .replace(/\s*&\s*/g, " and ")
    .replace(/\s+y\s+/gi, " and ");
  return withAnd
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * After punctuation is turned into spaces, Yahoo "S.p.A." / "S.A." becomes `s p a` / `s a`.
 * Collapse those runs so they match Seligson "spa" / "sa".
 */
function collapseSplitLegalAbbrevs(normalized: string): string {
  return (
    normalized
      .replace(/\bk\s+k\b/g, "kk")
      .replace(/\bl\s+oreal\b/g, "loreal")
      .replace(/\bs\s+p\s+a\b/g, "spa")
      .replace(/\bs\s+a\b/g, "sa")
      /** Seligson ASCII "oe" vs Yahoo ö (NFKD strips to single o). */
      .replace(/\bboerse\b/g, "borse")
      /** Truncated Carrefour legal name (Seligson) vs "Carrefour SA" on Yahoo. */
      .replace(/\bcie\s+generale\s+des\s+etablissements?\b/g, "carrefour")
      /** French "Cie" = Compagnie on Yahoo. */
      .replace(/\bcie\b/g, "compagnie")
      .replace(/\bcompagnie\s+generale\s+des\s+etablissements?\b/g, "carrefour")
      /** HKEX: Seligson often plural "Exchanges"; Yahoo often singular "Exchange". */
      .replace(/\bhong kong exchanges\b/g, "hong kong exchange")
      /**
       * Yahoo often exposes only the listing ticker as display name (shortName/longName).
       * Align with full Seligson / legal strings for matching.
       */
      .replace(/\bhkex\b/g, "hong kong exchange and clearing")
      .replace(/\bnyk\b/g, "nippon yusen")
      /** Post-merger name; Yahoo `longName` often still says Novozymes. */
      .replace(/\bnovozymes\b/g, "novonesis")
      /** Toronto listing often uses “Mining”; Seligson still says “Gold”. */
      .replace(/\bbarrick mining\b/g, "barrick gold")
      /**
       * German Seligson ASCII (ue) vs Yahoo umlauts stripped by NFKD (ü→u): Münchener, Rück…
       */
      .replace(/\bmuenchener\b/g, "munchener")
      .replace(/\bmuenchen\b/g, "munchen")
      .replace(/\brueck/g, "ruck")
      /** Seligson "Corp" vs Yahoo "Corporation" (word token, not inside "corporation"). */
      .replace(/\bcorp\b/g, "corporation")
      /** Seligson "Cos" = Companies (e.g. Williams Cos) vs Yahoo "Companies". */
      .replace(/\bcos\s+inc\b/g, "companies inc")
      /** Seligson "Co" = Company before co/the (Southern Co, Boeing Co, Kroger Co). */
      .replace(/\bco\s+the\b/g, "company the")
  );
}

function stripLeadingThe(normalized: string): string {
  return normalized.replace(/^the\s+/, "");
}

/**
 * Common trailing legal forms on listed names (Yahoo vs Seligson). Best-effort set—extend here
 * rather than special-casing one country in name normalization.
 */
const LEGAL_FORM_SUFFIX_TOKENS = new Set([
  "ab",
  "ag",
  "aktiebolag",
  "aktiengesellschaft",
  "as",
  "asa",
  "bv",
  "co",
  "companies",
  "company",
  "corp",
  "corporation",
  "cos",
  "cv",
  "delaware",
  "europeenne",
  "gmbh",
  "group",
  "holding",
  "holdings",
  "inc",
  "incorporated",
  "kg",
  "kgaa",
  "kabushiki",
  "kaisha",
  "kk",
  "limited",
  "llc",
  "llp",
  "lp",
  "ltd",
  "md",
  "nv",
  "oy",
  "oyj",
  "pc",
  "plc",
  "reit",
  "sa",
  "sarl",
  "sab",
  "sas",
  "se",
  "de",
  "sgps",
  "societe",
  "spa",
  "srl",
  "the",
  "trust",
]);

function stripTrailingLegalFormTokens(normalized: string): string {
  const words = normalized.split(" ").filter((w) => w.length > 0);
  while (
    words.length > 0 &&
    LEGAL_FORM_SUFFIX_TOKENS.has(words[words.length - 1] ?? "")
  ) {
    words.pop();
  }
  return words.join(" ");
}

function comparableNameForMatch(raw: string): string {
  return stripTrailingLegalFormTokens(
    stripLeadingThe(collapseSplitLegalAbbrevs(normalizeComparableName(raw))),
  );
}

/** Stopwords when building Yahoo name initials (abbreviation vs full legal name). */
const NAME_INITIALS_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "by",
  "for",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
]);

/**
 * First letters of significant words (e.g. Australia + New + Zealand + Banking → "anzb…").
 * Used to match Seligson's short first token ("anz") to Yahoo's spelled-out name.
 */
function yahooNameInitialsString(yahooComparable: string): string {
  const words = yahooComparable.split(" ").filter((w) => w.length > 0);
  const parts: string[] = [];
  for (const w of words) {
    if (w.length < 2 || NAME_INITIALS_STOPWORDS.has(w)) {
      continue;
    }
    parts.push(w[0] ?? "");
  }
  return parts.join("");
}

/**
 * Seligson short leading token (e.g. ANZ) appears as consecutive letters in Yahoo initials.
 */
function namesMatchSeligsonYahooInitials(
  seligsonComparable: string,
  yahooComparable: string,
): boolean {
  const first = seligsonComparable.split(" ")[0] ?? "";
  if (first.length < 2 || first.length > 5 || !/^[a-z]+$/i.test(first)) {
    return false;
  }
  const ini = yahooNameInitialsString(yahooComparable);
  if (ini.length < 3) {
    return false;
  }
  return ini.includes(first.toLowerCase());
}

/** Words (len ≥ 2, not stopwords) from the shorter comparable must all appear on the longer side (e.g. Link REIT vs long trust name). */
function significantWordsForMatch(comp: string): string[] {
  return comp
    .split(" ")
    .filter((w) => w.length >= 2 && !NAME_INITIALS_STOPWORDS.has(w));
}

function namesMatchSeligsonYahooSignificantWords(
  seligsonComparable: string,
  yahooComparable: string,
): boolean {
  const shorter =
    seligsonComparable.length <= yahooComparable.length
      ? seligsonComparable
      : yahooComparable;
  const longer =
    seligsonComparable.length <= yahooComparable.length
      ? yahooComparable
      : seligsonComparable;
  const words = significantWordsForMatch(shorter);
  if (words.length === 0) {
    return false;
  }
  const longerWords = new Set(longer.split(" ").filter((w) => w.length > 0));
  return words.every((w) => longerWords.has(w));
}

/** Reject ambiguous two-letter pairs (e.g. stock tickers) while allowing real symbols like "eq". */
const TWO_LETTER_REJECT_EXACT = new Set([
  "ab",
  "ag",
  "am",
  "an",
  "as",
  "at",
  "be",
  "by",
  "do",
  "go",
  "if",
  "in",
  "is",
  "it",
  "no",
  "of",
  "on",
  "or",
  "so",
  "to",
  "us",
  "we",
]);

function namesMatchTwoLetterExact(a: string, b: string): boolean {
  if (a.length !== 2 || b.length !== 2 || a !== b) {
    return false;
  }
  return !TWO_LETTER_REJECT_EXACT.has(a);
}

/** Two-letter head ticker (e.g. EQ) appears as its own word on the Yahoo side (e.g. "EQ Plc"). */
function namesMatchTwoLetterWithLongToken(
  short: string,
  long: string,
): boolean {
  if (long.length <= short.length) {
    return false;
  }
  if (!/^[a-z]{2}$/.test(short)) {
    return false;
  }
  const longWords = new Set(long.split(" ").filter((w) => w.length > 0));
  return longWords.has(short);
}

export function namesMatchSeligsonYahoo(
  seligson: string,
  yahooDisplay: string,
): boolean {
  const a = comparableNameForMatch(seligson);
  const b = comparableNameForMatch(yahooDisplay);
  if (a.length < 2 || b.length < 2) {
    return false;
  }
  if (namesMatchTwoLetterExact(a, b)) {
    return true;
  }
  if (a.length < 3 && b.length < 3) {
    return false;
  }
  if (a.length === 2 && b.length > 2) {
    return namesMatchTwoLetterWithLongToken(a, b);
  }
  if (b.length === 2 && a.length > 2) {
    return namesMatchTwoLetterWithLongToken(b, a);
  }
  if (a.length < 3 || b.length < 3) {
    return false;
  }
  if (a === b || a.includes(b) || b.includes(a)) {
    return true;
  }
  if (namesMatchSeligsonYahooInitials(a, b)) {
    return true;
  }
  return namesMatchSeligsonYahooSignificantWords(a, b);
}

function sectorLabelFromYahooRaw(raw: YahooQuoteSummaryRaw): string | null {
  const asset = raw.assetProfile as
    | {
        sector?: unknown;
        industry?: unknown;
      }
    | undefined;
  const s = asset?.sector;
  if (typeof s === "string" && s.trim().length > 0) {
    return s.trim();
  }
  const ind = asset?.industry;
  if (typeof ind === "string" && ind.trim().length > 0) {
    return ind.trim();
  }
  return null;
}

function verifyYahooMatchesRow(
  raw: YahooQuoteSummaryRaw,
  symbol: string,
  row: SeligsonHoldingsRow,
  expectedIsin: string | null | undefined,
): boolean {
  const fromQuote = extractIsinFromQuoteSummaryRaw(raw);
  if (expectedIsin && fromQuote === expectedIsin) {
    return true;
  }
  const lookup = buildYahooInstrumentLookup(raw, symbol);
  const yn = displayNameFromYahooLookup(lookup, symbol);
  if (!namesMatchSeligsonYahoo(row.companyName, yn)) {
    return false;
  }
  if (expectedIsin && fromQuote && fromQuote !== expectedIsin) {
    return false;
  }
  return true;
}

type ResolvedSector = {
  sectorId: DistributionSectorId;
  source: "yahoo" | "seligson_fallback";
  yahooSymbol: string | null;
  yahooCompanyName: string | null;
  rawLabel: string | null;
};

function toResolvedFromDbRow(row: {
  sectorCanonicalId: string;
  source: string;
  yahooSymbol: string | null;
  yahooCompanyName: string | null;
  rawSectorLabel: string | null;
}): ResolvedSector {
  const sid = row.sectorCanonicalId;
  if (!isDistributionSectorId(sid)) {
    return {
      sectorId: "other",
      source: row.source === "yahoo" ? "yahoo" : "seligson_fallback",
      yahooSymbol: row.yahooSymbol,
      yahooCompanyName: row.yahooCompanyName,
      rawLabel: row.rawSectorLabel,
    };
  }
  return {
    sectorId: sid,
    source: row.source === "yahoo" ? "yahoo" : "seligson_fallback",
    yahooSymbol: row.yahooSymbol,
    yahooCompanyName: row.yahooCompanyName,
    rawLabel: row.rawSectorLabel,
  };
}

async function yahooSearchSymbolsForCompanyName(
  name: string,
): Promise<string[]> {
  const q = await yahooFinance.search(name, { quotesCount: 24, newsCount: 0 });
  const quotes = q.quotes ?? [];
  const out: string[] = [];
  for (const item of quotes) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const sym = (item as { symbol?: string }).symbol;
    const qt = (item as { quoteType?: string }).quoteType?.toUpperCase();
    if (typeof sym !== "string" || sym.trim().length === 0) {
      continue;
    }
    // Yahoo often omits this flag; only drop rows explicitly marked non-Finance.
    if ((item as { isYahooFinance?: boolean }).isYahooFinance === false) {
      continue;
    }
    if (
      qt === "INDEX" ||
      qt === "CURRENCY" ||
      qt === "OPTION" ||
      qt === "FUTURE" ||
      qt === "CRYPTOCURRENCY"
    ) {
      continue;
    }
    out.push(sym.trim());
  }
  return [...new Set(out.map((s) => s.toLowerCase()))];
}

/**
 * First candidate that verifies **and** yields a mappable sector/industry wins.
 * Many APAC listings expose an empty `sector` on one symbol but not another; the first
 * symbol that passed name/ISIN checks could still fail sector resolution—keep trying.
 */
async function quoteSummaryFirstResolvableSector(
  candidates: string[],
  row: SeligsonHoldingsRow,
  expectedIsin: string | null | undefined,
): Promise<ResolvedSector | null> {
  for (const sym of candidates) {
    try {
      const raw = await fetchYahooQuoteSummaryRaw(sym);
      if (!verifyYahooMatchesRow(raw, sym, row, expectedIsin)) {
        continue;
      }
      const resolved = resolvedSectorFromVerifiedQuote({ raw, symbol: sym });
      if (resolved) {
        return resolved;
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

function yahooDisplayNameFromRaw(
  raw: YahooQuoteSummaryRaw,
  symbol: string,
): string {
  const lookup = buildYahooInstrumentLookup(raw, symbol);
  return displayNameFromYahooLookup(lookup, symbol);
}

function resolvedSectorFromVerifiedQuote(got: {
  raw: YahooQuoteSummaryRaw;
  symbol: string;
}): ResolvedSector | null {
  const label = sectorLabelFromYahooRaw(got.raw);
  if (!label) {
    return null;
  }
  const sectorId = mapSectorLabelToCanonicalIdWithWarn(label);
  return {
    sectorId,
    source: "yahoo",
    yahooSymbol: normalizeYahooSymbolForStorage(got.symbol),
    yahooCompanyName: yahooDisplayNameFromRaw(got.raw, got.symbol),
    rawLabel: label,
  };
}

async function resolveViaYahooForRow(
  row: SeligsonHoldingsRow,
  getFigiRowsForIsin: (isin: string) => Promise<OpenFigiMappingRow[]>,
): Promise<ResolvedSector | null> {
  const isinNormalized = normalizeIsin12(row.isin);
  const expectedIsin = isinNormalized ?? undefined;
  if (row.companyName.trim().length > 0) {
    const q = stripTrailingIncompleteHyphen(
      stripTrailingIncompleteOf(
        stripSeligsonRegionSuffix(row.companyName.trim()),
      ),
    );
    const primary = q.length > 0 ? q : row.companyName.trim();
    const countryIsoForSearch = resolveRegionKeyToIso(row.countryFi) ?? null;
    const searchQueries = buildYahooSearchQueriesForSeligson(
      primary,
      countryIsoForSearch,
    );
    const searchSyms: string[] = [];
    const seenSym = new Set<string>();
    for (let i = 0; i < searchQueries.length; i++) {
      if (i > 0) {
        await sleep(yahooRefreshGapMs());
      }
      const query = searchQueries[i] ?? "";
      if (query.length === 0) {
        continue;
      }
      const batch = await yahooSearchSymbolsForCompanyName(query);
      for (const sym of batch) {
        if (!seenSym.has(sym)) {
          seenSym.add(sym);
          searchSyms.push(sym);
        }
      }
    }
    if (searchSyms.length > 0) {
      const r = await quoteSummaryFirstResolvableSector(
        searchSyms,
        row,
        expectedIsin,
      );
      if (r) {
        return r;
      }
    }
  }

  if (!isinNormalized) {
    return null;
  }

  const figiRows = await getFigiRowsForIsin(isinNormalized);
  const candSet = yahooSymbolCandidatesFromOpenFigiRows(
    isinNormalized,
    figiRows,
  );
  const candidates = [...candSet].sort((a, b) => a.localeCompare(b));
  return quoteSummaryFirstResolvableSector(candidates, row, expectedIsin);
}

async function upsertResolutionCache(
  key: SeligsonResolutionCacheKey,
  resolved: ResolvedSector,
  fetchedAt: Date,
): Promise<void> {
  await db
    .insert(seligsonHoldingsResolutionCache)
    .values({
      seligsonCompanyName: key.seligsonCompanyName,
      countryIso: key.countryIso,
      yahooSymbol: resolved.yahooSymbol,
      yahooCompanyName: resolved.yahooCompanyName,
      sectorCanonicalId: resolved.sectorId,
      rawSectorLabel: resolved.rawLabel,
      source: resolved.source,
      fetchedAt,
    })
    .onConflictDoUpdate({
      target: [
        seligsonHoldingsResolutionCache.seligsonCompanyName,
        seligsonHoldingsResolutionCache.countryIso,
      ],
      set: {
        yahooSymbol: resolved.yahooSymbol,
        yahooCompanyName: resolved.yahooCompanyName,
        sectorCanonicalId: resolved.sectorId,
        rawSectorLabel: resolved.rawLabel,
        source: resolved.source,
        fetchedAt,
      },
    });
}

/**
 * Value-weighted countries (Seligson Maa) and sectors (Yahoo `assetProfile.sector` when
 * strict resolution succeeds; else Seligson Toimiala).
 */
export async function buildResolvedSeligsonHoldingsPayload(
  holdingsHtml: string,
  fetchedAt: Date,
): Promise<{ payload: DistributionPayload; notes: string[] }> {
  const { rows, notes } = parseSeligsonHoldingsRows(holdingsHtml);

  const countries: Record<string, number> = {};
  const notesOut = [...notes];
  const gapMs = yahooRefreshGapMs();

  let isFirstHttp = true;
  async function beforeHttp(): Promise<void> {
    if (isFirstHttp) {
      isFirstHttp = false;
      return;
    }
    if (gapMs > 0) {
      await sleep(gapMs);
    }
  }

  const nonCashRows = rows.filter((r) => !isCashHoldingsRow(r));
  const uniquePairs: SeligsonResolutionCacheKey[] = [];
  const seenPair = new Set<string>();
  for (const row of nonCashRows) {
    const k = buildSeligsonResolutionCacheKey(row);
    const sk = serializeSeligsonResolutionCacheKey(k);
    if (!seenPair.has(sk)) {
      seenPair.add(sk);
      uniquePairs.push(k);
    }
  }

  const resolutionMap = new Map<string, ResolvedSector>();

  if (uniquePairs.length > 0) {
    const conditions = uniquePairs.map((p) =>
      and(
        eq(
          seligsonHoldingsResolutionCache.seligsonCompanyName,
          p.seligsonCompanyName,
        ),
        eq(seligsonHoldingsResolutionCache.countryIso, p.countryIso),
      ),
    );
    const cached = await db
      .select()
      .from(seligsonHoldingsResolutionCache)
      .where(or(...conditions));
    for (const row of cached) {
      resolutionMap.set(
        serializeSeligsonResolutionCacheKey({
          seligsonCompanyName: row.seligsonCompanyName,
          countryIso: row.countryIso,
        }),
        toResolvedFromDbRow(row),
      );
    }
  }

  const missingPairs = uniquePairs
    .filter((p) => !resolutionMap.has(serializeSeligsonResolutionCacheKey(p)))
    .sort((a, b) => {
      const c = a.seligsonCompanyName.localeCompare(b.seligsonCompanyName);
      return c !== 0 ? c : a.countryIso.localeCompare(b.countryIso);
    });

  const keyToSampleRow = new Map<string, SeligsonHoldingsRow>();
  for (const row of nonCashRows) {
    const k = buildSeligsonResolutionCacheKey(row);
    const sk = serializeSeligsonResolutionCacheKey(k);
    if (!keyToSampleRow.has(sk)) {
      keyToSampleRow.set(sk, row);
    }
  }

  const figiByIsin = new Map<string, OpenFigiMappingRow[]>();
  async function getFigiRowsForIsin(
    isin: string,
  ): Promise<OpenFigiMappingRow[]> {
    const normalized = normalizeIsin12(isin);
    if (!normalized) {
      return [];
    }
    const cached = figiByIsin.get(normalized);
    if (cached) {
      return cached;
    }
    await beforeHttp();
    const rows = await fetchOpenFigiMapping(normalized);
    figiByIsin.set(normalized, rows);
    return rows;
  }

  for (const p of missingPairs) {
    await beforeHttp();
    const row = keyToSampleRow.get(serializeSeligsonResolutionCacheKey(p));
    if (!row) {
      continue;
    }

    let resolved: ResolvedSector | null = await resolveViaYahooForRow(
      row,
      getFigiRowsForIsin,
    );

    if (!resolved) {
      const tid = sectorFromToimiala(row.toimialaFi);
      resolved = {
        sectorId: tid,
        source: "seligson_fallback",
        yahooSymbol: null,
        yahooCompanyName: null,
        rawLabel: row.toimialaFi.trim() || null,
      };
    }

    await upsertResolutionCache(p, resolved, fetchedAt);
    resolutionMap.set(serializeSeligsonResolutionCacheKey(p), resolved);
  }

  const sectors: Record<string, number> = {};

  for (const row of rows) {
    const w = row.weight;
    if (isCashHoldingsRow(row)) {
      sectors.cash = (sectors.cash ?? 0) + w;
      continue;
    }

    const iso = resolveRegionKeyToIso(row.countryFi);
    if (!iso) {
      notesOut.push(
        `Unknown Seligson country label: ${row.countryFi} (${row.companyName})`,
      );
    } else {
      countries[iso] = (countries[iso] ?? 0) + w;
    }

    const lk = buildSeligsonResolutionCacheKey(row);
    const res = resolutionMap.get(serializeSeligsonResolutionCacheKey(lk));
    if (!res) {
      const tid = sectorFromToimiala(row.toimialaFi);
      sectors[tid] = (sectors[tid] ?? 0) + w;
      continue;
    }
    sectors[res.sectorId] = (sectors[res.sectorId] ?? 0) + w;
  }

  return {
    payload: { countries, sectors },
    notes: notesOut,
  };
}
