import type { DistributionSectorId } from "@investments/lib/distribution/sectorIds";
import type { DistributionPayload } from "@investments/lib/distributionPayload";
import {
  normLabel,
  resolveRegionKeyToIso,
} from "@investments/lib/geo/countryIso";
import { normalizeIsinForStorage } from "@investments/lib/isin";
import * as cheerio from "cheerio";
import { SELIGSON_FINNISH_SECTOR_LABEL_MAP } from "./sectorMapping.js";

const SELIGSON_BASE =
  "https://www.seligson.fi/luotain/FundViewer.php?task=intro&lang=0";

const USER_AGENT = "InvestmentsTracker/0.1 (personal)";

/** FundViewer view=10 — holdings list (sector + country per line). */
export const SELIGSON_HOLDINGS_VIEW = 10;
/** FundViewer view=40 — allocation + bond-type split (korkorahastot). */
export const SELIGSON_BOND_ALLOCATION_VIEW = 40;
/** FundViewer view=20 — long-bond country maajakauma. */
export const SELIGSON_BOND_COUNTRY_VIEW = 20;

/** Finnish `%` cell (e.g. `17,6 %`) → 0–1 fraction. */
export function parseFiPercent(text: string): number | null {
  const t = text.trim().replace(/\s/g, "").replace(",", ".");
  if (!t || t === "&nbsp;") {
    return null;
  }
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? n * 0.01 : null;
}

export async function fetchSeligsonHtml(
  fid: number,
  view = SELIGSON_HOLDINGS_VIEW,
): Promise<string> {
  const url = `${SELIGSON_BASE}&view=${view}&fid=${fid}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`Seligson HTTP ${res.status} for fid=${fid} view=${view}`);
  }
  return res.text();
}

/** Match ASCII hyphen and common Unicode dash punctuation (e.g. Seligson uses en-dash in h1). */
const SELIGSON_VIEW_TITLE_DASH = /\s*\p{Pd}\s*/u;

/**
 * Strips FundViewer view suffixes from a title string (same rules as {@link parseSeligsonFundName}).
 * Used to sync stale `instruments.display_name` with parsed fund names.
 */
export function stripSeligsonFundViewerTitleSuffix(raw: string): string {
  const text = raw
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text
    .replace(
      new RegExp(`${SELIGSON_VIEW_TITLE_DASH.source}Salkun.*$`, "iu"),
      "",
    )
    .replace(
      new RegExp(`${SELIGSON_VIEW_TITLE_DASH.source}Arvopaperi.*$`, "iu"),
      "",
    )
    .trim();
}

/**
 * Parses fund display name from FundViewer intro HTML.
 * Strips view-specific suffixes (e.g. **Salkun ...**, **Arvopaperien listaus** on holdings view=10).
 */
export function parseSeligsonFundName(html: string): string | null {
  const $ = cheerio.load(html);
  const h1 = $("#content h1").first();
  if (h1.length === 0) {
    return null;
  }
  const text = h1
    .text()
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const withoutSuffix = stripSeligsonFundViewerTitleSuffix(text);
  return withoutSuffix || null;
}

export async function fetchSeligsonFundName(fid: number): Promise<string> {
  for (const view of [
    SELIGSON_HOLDINGS_VIEW,
    SELIGSON_BOND_ALLOCATION_VIEW,
    SELIGSON_BOND_COUNTRY_VIEW,
  ] as const) {
    const html = await fetchSeligsonHtml(fid, view);
    const name = parseSeligsonFundName(html);
    if (name) {
      return name;
    }
  }
  throw new Error(
    `Could not parse fund name from Seligson page for fid=${fid}`,
  );
}

export type SeligsonHoldingsRow = {
  companyName: string;
  countryFi: string;
  toimialaFi: string;
  /** Weight 0–1 from Osuus % column. */
  weight: number;
  /** Parsed from row HTML when an ISIN appears in markup (optional). */
  isin: string | null;
};

/** First valid ISIN in text (e.g. row HTML), or null. */
export function extractIsinFromText(text: string): string | null {
  const re = /\b([A-Z]{2}[A-Z0-9]{9}[0-9])\b/gi;
  for (const m of text.matchAll(re)) {
    const n = normalizeIsinForStorage(m[1]);
    if (n) {
      return n;
    }
  }
  return null;
}

/** When Finnish **Maa** does not map to ISO, resolution cache uses this sentinel (not a real country). */
export const SELIGSON_RESOLUTION_UNKNOWN_COUNTRY_ISO = "ZZ";

export type SeligsonResolutionCacheKey = {
  /** Normalized via `normLabel` (lowercase, collapsed whitespace). */
  seligsonCompanyName: string;
  /** ISO 3166-1 alpha-2 from Seligson Maa, or {@link SELIGSON_RESOLUTION_UNKNOWN_COUNTRY_ISO}. */
  countryIso: string;
};

/** Natural key for `seligson_holdings_resolution_cache` (name + parsed country ISO). */
export function buildSeligsonResolutionCacheKey(
  row: SeligsonHoldingsRow,
): SeligsonResolutionCacheKey {
  return {
    seligsonCompanyName: normLabel(row.companyName),
    countryIso:
      resolveRegionKeyToIso(row.countryFi) ??
      SELIGSON_RESOLUTION_UNKNOWN_COUNTRY_ISO,
  };
}

export function serializeSeligsonResolutionCacheKey(
  k: SeligsonResolutionCacheKey,
): string {
  return `${k.seligsonCompanyName}\x1f${k.countryIso}`;
}

function normalizeDashCell(s: string): string {
  return s
    .replace(/\u00a0/g, " ")
    .trim()
    .replace(/[\u2013\u2014\u2212-]/g, "-");
}

function isDashOnlyCell(s: string): boolean {
  const n = normalizeDashCell(s);
  return n === "" || n === "-";
}

export function isCashHoldingsRow(row: SeligsonHoldingsRow): boolean {
  const upper = row.companyName.toUpperCase();
  if (upper.includes("KÄTEINEN") || upper.includes("KATEINEN")) {
    return true;
  }
  if (isDashOnlyCell(row.countryFi) && isDashOnlyCell(row.toimialaFi)) {
    return true;
  }
  return false;
}

/**
 * Parses view=10 `table.fundprobe.company` rows (Yritys, Maa, Toimiala, Osuus EUR, Osuus %).
 */
export function parseSeligsonHoldingsRows(holdingsHtml: string): {
  rows: SeligsonHoldingsRow[];
  notes: string[];
} {
  const notes: string[] = [];
  const rows: SeligsonHoldingsRow[] = [];
  const $ = cheerio.load(holdingsHtml);
  const table = $("table.fundprobe.company").first();
  if (table.length === 0) {
    notes.push("Could not find holdings table (table.fundprobe.company).");
    return { rows, notes };
  }

  table.find("tbody tr").each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.length < 5) {
      return;
    }
    const rowHtml = $(tr).html() ?? "";
    const companyName = $(tds[0]).text().trim();
    const countryFi = $(tds[1]).text().trim();
    const toimialaFi = $(tds[2]).text().trim();
    const pctText = $(tds[4]).text();
    const weight = parseFiPercent(pctText);
    if (!companyName || weight === null || weight <= 0) {
      return;
    }
    const isin = extractIsinFromText(rowHtml);
    rows.push({ companyName, countryFi, toimialaFi, weight, isin });
  });

  if (rows.length === 0) {
    notes.push("Holdings table tbody had no data rows.");
  }
  return { rows, notes };
}

/**
 * Sector and country weights from FundViewer view=10 holdings only (no Maajakauma / sector summary views).
 * Each line’s Osuus % is allocated to ISO country (from Finnish Maa) and canonical sector (from Finnish Toimiala).
 * Cash / cash-equivalent lines go to `sectors.cash` and are omitted from `countries`.
 */
export function parseSeligsonHoldingsDistributions(holdingsHtml: string): {
  payload: DistributionPayload;
  notes: string[];
} {
  const { rows, notes } = parseSeligsonHoldingsRows(holdingsHtml);
  const countries: Record<string, number> = {};
  const sectors: Record<string, number> = {};

  for (const row of rows) {
    const w = row.weight;
    if (isCashHoldingsRow(row)) {
      sectors.cash = (sectors.cash ?? 0) + w;
      continue;
    }

    const iso = resolveRegionKeyToIso(row.countryFi);
    if (!iso) {
      notes.push(
        `Unknown Seligson country label: ${row.countryFi} (${row.companyName})`,
      );
    } else {
      countries[iso] = (countries[iso] ?? 0) + w;
    }

    const t = row.toimialaFi.trim();
    const sectorId: DistributionSectorId =
      SELIGSON_FINNISH_SECTOR_LABEL_MAP[t] ?? "other";
    sectors[sectorId] = (sectors[sectorId] ?? 0) + w;
  }

  return {
    payload: { countries, sectors },
    notes,
  };
}

/**
 * Parses FundViewer view=40 bond sleeve + inner bond-type split (korkorahastot).
 * Returns null when this is not a bond allocation page (e.g. equity fund: Osakkeet only, or “Ei korkosijoituksia”).
 */
function parseBondAllocationSectors(html: string): {
  sectors: Record<string, number>;
  notes: string[];
} | null {
  const notes: string[] = [];
  const $ = cheerio.load(html);
  let korkoTotal: number | null = null;
  let cash: number | null = null;

  $("table.fundprobe").each((_, table) => {
    const $t = $(table);
    const headerText = $t.find("tr.darkheader").first().text();
    if (!/Allokaatio/i.test(headerText)) {
      return;
    }
    $t.find("tr").each((_, tr) => {
      const cells = $(tr).find("td");
      if (cells.length < 2) {
        return;
      }
      const label = $(cells[0]).text().trim().replace(/\s+/g, " ");
      const pct = parseFiPercent($(cells[cells.length - 1]).text());
      if (pct === null) {
        return;
      }
      if (/^Korkosijoitukset$/i.test(label)) {
        korkoTotal = pct;
      }
      if (/Käteinen/i.test(label)) {
        cash = pct;
      }
    });
  });

  if (korkoTotal === null || cash === null || korkoTotal <= 1e-9) {
    return null;
  }

  let longCorp = 0;
  let longGovt = 0;
  let shortPart = 0;
  let sawInnerHeader = false;

  $("table.fundprobe").each((_, table) => {
    const $t = $(table);
    const headerText = $t.find("tr.darkheader").first().text();
    if (!/Korkosijoitusten jakauma/i.test(headerText)) {
      return;
    }
    sawInnerHeader = true;
    $t.find("tr").each((_, tr) => {
      const cells = $(tr).find("td");
      if (cells.length === 1) {
        const only = $(cells[0]).text().trim();
        if (/Ei korkosijoituksia/i.test(only)) {
          longCorp = -1;
        }
        return;
      }
      if (cells.length < 2) {
        return;
      }
      const label = $(cells[0]).text().trim().replace(/\s+/g, " ");
      if (/Ei korkosijoituksia/i.test(label)) {
        longCorp = -1;
        return;
      }
      const pct = parseFiPercent($(cells[cells.length - 1]).text());
      if (pct === null) {
        return;
      }
      if (/Pitkät korot \(yrityslainat\)/i.test(label)) {
        longCorp = pct;
      }
      if (/Pitkät korot \(valtionlainat\)/i.test(label)) {
        longGovt = pct;
      }
      if (/^Lyhyet korot$/i.test(label)) {
        shortPart = pct;
      }
    });
  });

  if (!sawInnerHeader || longCorp < 0) {
    return null;
  }

  const innerSum = longCorp + longGovt + shortPart;
  if (innerSum < 1e-9) {
    return null;
  }

  const normCorp = longCorp / innerSum;
  const normGovt = longGovt / innerSum;
  const normShort = shortPart / innerSum;

  return {
    sectors: {
      cash,
      long_corporate_bonds: korkoTotal * normCorp,
      long_government_bonds: korkoTotal * normGovt,
      short_bonds: korkoTotal * normShort,
    },
    notes,
  };
}

/** True when view=40 contains bond sleeve + inner pitkät/lyhyet korot breakdown. */
export function isSeligsonBondAllocationPage(html: string): boolean {
  return parseBondAllocationSectors(html) != null;
}

/**
 * Parses FundViewer view=20 “Pitkien korkosijoitusten maajakauma” (weights sum to 100% of long bonds).
 */
function parseSeligsonBondCountryRows(countryHtml: string): {
  countries: Record<string, number>;
  notes: string[];
} {
  const $ = cheerio.load(countryHtml);
  const countries: Record<string, number> = {};
  const notes: string[] = [];
  let target: ReturnType<typeof $> | undefined;

  $("table.fundprobe").each((_, table) => {
    const head = $(table).find("tr.darkheader").first().text();
    if (/maajakauma/i.test(head)) {
      target = $(table);
      return false;
    }
  });

  if (!target) {
    notes.push("Could not find maajakauma table.");
    return { countries, notes };
  }

  target.find("tr").each((_, tr) => {
    const row = $(tr);
    if (row.hasClass("darkheader")) {
      return;
    }
    const cells = row.find("td");
    if (cells.length < 2) {
      return;
    }
    const label = $(cells[0]).text().trim().replace(/\s+/g, " ");
    if (!label || /osuus\s*%/i.test(label)) {
      return;
    }
    const pct = parseFiPercent($(cells[cells.length - 1]).text());
    if (pct === null || pct <= 0) {
      return;
    }
    const iso = resolveRegionKeyToIso(label);
    if (!iso) {
      notes.push(`Unknown country label: ${label}`);
      return;
    }
    countries[iso] = (countries[iso] ?? 0) + pct;
  });

  const sum = Object.values(countries).reduce((a, b) => a + b, 0);
  if (sum > 1e-9) {
    for (const k of Object.keys(countries)) {
      const v = countries[k];
      if (v !== undefined) {
        countries[k] = v / sum;
      }
    }
  }

  return { countries, notes };
}

export function parseSeligsonBondFundDistributions(
  allocationHtml: string,
  countryHtml: string,
): { payload: DistributionPayload; notes: string[] } {
  const alloc = parseBondAllocationSectors(allocationHtml);
  if (!alloc) {
    return {
      payload: { countries: {}, sectors: {} },
      notes: ["Bond allocation parse failed"],
    };
  }
  const { countries, notes: geoNotes } =
    parseSeligsonBondCountryRows(countryHtml);
  return {
    payload: { countries, sectors: alloc.sectors },
    notes: [...alloc.notes, ...geoNotes],
  };
}
