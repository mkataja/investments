import type { DistributionPayload } from "@investments/db";
import { resolveRegionKeyToIso } from "@investments/db";
import * as cheerio from "cheerio";
import { SELIGSON_FINNISH_SECTOR_LABEL_MAP } from "./sectorMapping.js";

const SELIGSON_BASE =
  "https://www.seligson.fi/luotain/FundViewer.php?task=intro&lang=0";

const USER_AGENT = "InvestmentsTracker/0.1 (personal)";

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
  view = 40,
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
  const html = await fetchSeligsonHtml(fid, 40);
  const name = parseSeligsonFundName(html);
  if (!name) {
    throw new Error(
      `Could not parse fund name from Seligson page for fid=${fid}`,
    );
  }
  return name;
}

/**
 * Country weights from view=20 "Maajakauma" table; keys are ISO 3166-1 alpha-2.
 */
export function parseSeligsonCountryTable(
  html: string,
  notes: string[],
): Record<string, number> {
  const $ = cheerio.load(html);
  const countries: Record<string, number> = {};
  $("table.fundprobe").each((_, table) => {
    const $t = $(table);
    const headerText = $t.find("tr.darkheader").first().text();
    if (!headerText.includes("Maajakauma")) {
      return;
    }
    $t.find("tr").each((_, tr) => {
      const tds = $(tr).find("td");
      if (tds.length < 2) {
        return;
      }
      if ($(tds[0]).attr("colspan")) {
        return;
      }
      const name = $(tds[0]).text().trim();
      if (
        name === "" ||
        /Maajakauma/i.test(name) ||
        $(tds[0]).hasClass("spacing")
      ) {
        return;
      }
      const pct = parseFiPercent($(tds[tds.length - 1]).text());
      if (pct === null || pct <= 0) {
        return;
      }
      const iso = resolveRegionKeyToIso(name);
      if (!iso) {
        notes.push(`Unknown Seligson country label: ${name}`);
        return;
      }
      countries[iso] = (countries[iso] ?? 0) + pct;
    });
  });
  return countries;
}

export function parseSeligsonDistributions(
  otherDistributionHtml: string,
  countryHtml: string,
): {
  payload: DistributionPayload;
  notes: string[];
} {
  const notes: string[] = [];
  const sectors: Record<string, number> = {};

  const $40 = cheerio.load(otherDistributionHtml);
  const shareTableEl = $40("#shares table.fundprobe.overflow").first();
  if (shareTableEl.length === 0) {
    notes.push("Could not find #shares sector/region table.");
  } else {
    shareTableEl.find("tr").each((_, el) => {
      const tds = $40(el).find("td");
      if (tds.length < 6) {
        return;
      }
      const first = $40(tds[0]).text().trim();
      const sectorId = SELIGSON_FINNISH_SECTOR_LABEL_MAP[first];
      if (!sectorId) {
        return;
      }
      const lastCell = parseFiPercent($40(tds[tds.length - 1]).text());
      if (lastCell !== null && lastCell > 0) {
        sectors[sectorId] = (sectors[sectorId] ?? 0) + lastCell;
      }
    });
  }

  const countries = parseSeligsonCountryTable(countryHtml, notes);
  if (Object.keys(countries).length === 0) {
    notes.push("Maajakauma table not parsed or empty.");
  }
  if (Object.keys(sectors).length === 0) {
    notes.push("Sector rows not parsed (check layout).");
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
  const [otherDistributionHtml, countryHtml] = await Promise.all([
    fetchSeligsonHtml(fid, 40),
    fetchSeligsonHtml(fid, 20),
  ]);
  return parseSeligsonDistributions(otherDistributionHtml, countryHtml);
}
