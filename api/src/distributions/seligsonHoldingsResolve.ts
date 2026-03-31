import type {
  DistributionPayload,
  DistributionSectorId,
} from "@investments/db";
import {
  isDistributionSectorId,
  normalizeYahooSymbolForStorage,
  resolveRegionKeyToIso,
  seligsonHoldingsResolutionCache,
} from "@investments/db";
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

function normalizeComparableName(s: string): string {
  const pre = stripTrailingIncompleteOf(stripSeligsonRegionSuffix(s))
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "");
  const withAnd = pre
    .replace(/\ba\s*\/\s*s\b/gi, " as")
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
  return normalized
    .replace(/\bk\s+k\b/g, "kk")
    .replace(/\bl\s+oreal\b/g, "loreal")
    .replace(/\bs\s+p\s+a\b/g, "spa")
    .replace(/\bs\s+a\b/g, "sa");
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
    const q = stripTrailingIncompleteOf(
      stripSeligsonRegionSuffix(row.companyName.trim()),
    );
    const searchSyms = await yahooSearchSymbolsForCompanyName(
      q.length > 0 ? q : row.companyName.trim(),
    );
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
