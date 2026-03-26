import type { DistributionPayload } from "@investments/db";
import { resolveRegionKeyToIso } from "@investments/db";
import * as cheerio from "cheerio";

const SELIGSON_BASE =
  "https://www.seligson.fi/luotain/FundViewer.php?task=intro&lang=0";

const USER_AGENT = "InvestmentsTracker/0.1 (personal)";

const REGION_KEYS = ["europe", "north_america", "pacific", "emerging"] as const;

const SECTOR_LABEL_TO_KEY: Record<string, string> = {
  Teollisuus: "industrials",
  Teknologia: "technology",
  Kulutustavarat: "consumer",
  Terveys: "healthcare",
  Rahoitus: "financials",
};

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

function parseMacroRegionsFromTotalsRow(html: string): Record<string, number> {
  const $ = cheerio.load(html);
  const regions: Record<string, number> = {};
  const shareTable = $("#shares table.fundprobe.overflow").first();
  if (shareTable.length === 0) {
    return regions;
  }
  shareTable.find("tr").each((_, el) => {
    const tds = $(el).find("td");
    if (tds.length < 6) {
      return;
    }
    const first = $(tds[0]).text().trim();
    if (first === "Yhteensä" && $(tds[0]).find("b").length > 0) {
      for (let i = 0; i < REGION_KEYS.length; i++) {
        const rk = REGION_KEYS[i];
        const p = parseFiPercent($(tds[i + 1]).text());
        if (p !== null && rk) {
          regions[rk] = p;
        }
      }
    }
  });
  return regions;
}

/**
 * Country weights from view=20 "Maajakauma" table; keys are ISO 3166-1 alpha-2.
 */
function parseSeligsonCountryTable(
  html: string,
  notes: string[],
): Record<string, number> {
  const $ = cheerio.load(html);
  const regions: Record<string, number> = {};
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
      regions[iso] = (regions[iso] ?? 0) + pct;
    });
  });
  return regions;
}

export function parseSeligsonDistributions(
  html40: string,
  html20: string,
): {
  payload: DistributionPayload;
  notes: string[];
} {
  const notes: string[] = [];
  const sectors: Record<string, number> = {};

  const $40 = cheerio.load(html40);
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
      if (first in SECTOR_LABEL_TO_KEY) {
        const key =
          SECTOR_LABEL_TO_KEY[first as keyof typeof SECTOR_LABEL_TO_KEY];
        const lastCell = parseFiPercent($40(tds[tds.length - 1]).text());
        if (lastCell !== null && lastCell > 0 && key) {
          sectors[key] = lastCell;
        }
      }
    });
  }

  let regions = parseSeligsonCountryTable(html20, notes);
  if (Object.keys(regions).length === 0) {
    notes.push(
      "Country table (Maajakauma) not parsed; falling back to macro regions.",
    );
    regions = parseMacroRegionsFromTotalsRow(html40);
  }

  if (Object.keys(regions).length === 0) {
    notes.push("Region totals row not parsed (check layout).");
  }
  if (Object.keys(sectors).length === 0) {
    notes.push("Sector rows not parsed (check layout).");
  }

  return {
    payload: { regions, sectors },
    notes,
  };
}

export async function fetchSeligsonDistributions(fid: number): Promise<{
  payload: DistributionPayload;
  notes: string[];
}> {
  const [html40, html20] = await Promise.all([
    fetchSeligsonHtml(fid, 40),
    fetchSeligsonHtml(fid, 20),
  ]);
  return parseSeligsonDistributions(html40, html20);
}
