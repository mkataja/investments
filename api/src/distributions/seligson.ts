import type {
  DistributionPayload,
  DistributionSectorId,
} from "@investments/db";
import { resolveRegionKeyToIso } from "@investments/db";
import * as cheerio from "cheerio";
import { SELIGSON_FINNISH_SECTOR_LABEL_MAP } from "./sectorMapping.js";

const SELIGSON_BASE =
  "https://www.seligson.fi/luotain/FundViewer.php?task=intro&lang=0";

const USER_AGENT = "InvestmentsTracker/0.1 (personal)";

/** FundViewer view=10 — holdings list (sector + country per line). */
export const SELIGSON_HOLDINGS_VIEW = 10;

function parseFiPercent(text: string): number | null {
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

/** Parses fund display name from FundViewer intro HTML (any Salkun* view). */
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
  const withoutSuffix = text.replace(/\s*-\s*Salkun.*$/i, "").trim();
  return withoutSuffix || null;
}

export async function fetchSeligsonFundName(fid: number): Promise<string> {
  const html = await fetchSeligsonHtml(fid, SELIGSON_HOLDINGS_VIEW);
  const name = parseSeligsonFundName(html);
  if (!name) {
    throw new Error(
      `Could not parse fund name from Seligson page for fid=${fid}`,
    );
  }
  return name;
}

export type SeligsonHoldingsRow = {
  companyName: string;
  countryFi: string;
  toimialaFi: string;
  /** Weight 0–1 from Osuus % column. */
  weight: number;
};

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

function isCashHoldingsRow(row: SeligsonHoldingsRow): boolean {
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
    const companyName = $(tds[0]).text().trim();
    const countryFi = $(tds[1]).text().trim();
    const toimialaFi = $(tds[2]).text().trim();
    const pctText = $(tds[4]).text();
    const weight = parseFiPercent(pctText);
    if (!companyName || weight === null || weight <= 0) {
      return;
    }
    rows.push({ companyName, countryFi, toimialaFi, weight });
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

export async function fetchSeligsonDistributions(fid: number): Promise<{
  payload: DistributionPayload;
  notes: string[];
}> {
  const holdingsHtml = await fetchSeligsonHtml(fid, SELIGSON_HOLDINGS_VIEW);
  return parseSeligsonHoldingsDistributions(holdingsHtml);
}
