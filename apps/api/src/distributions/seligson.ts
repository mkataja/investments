import type { DistributionPayload } from "@investments/db";
import * as cheerio from "cheerio";

const SELIGSON_URL =
  "https://www.seligson.fi/luotain/FundViewer.php?task=intro&view=40&lang=0";

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

export async function fetchSeligsonHtml(fid: number): Promise<string> {
  const url = `${SELIGSON_URL}&fid=${fid}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`Seligson HTTP ${res.status} for fid=${fid}`);
  }
  return res.text();
}

export function parseSeligsonDistributions(html: string): {
  payload: DistributionPayload;
  notes: string[];
} {
  const $ = cheerio.load(html);
  const notes: string[] = [];
  const regions: Record<string, number> = {};
  const sectors: Record<string, number> = {};

  const shareTable = $("#shares table.fundprobe.overflow").first();
  if (shareTable.length === 0) {
    notes.push("Could not find #shares sector/region table.");
    return { payload: { regions, sectors }, notes };
  }

  shareTable.find("tr").each((_, el) => {
    const tds = $(el).find("td");
    if (tds.length < 6) {
      return;
    }
    const first = $(tds[0]).text().trim();
    if (first in SECTOR_LABEL_TO_KEY) {
      const key =
        SECTOR_LABEL_TO_KEY[first as keyof typeof SECTOR_LABEL_TO_KEY];
      const lastCell = parseFiPercent($(tds[tds.length - 1]).text());
      if (lastCell !== null && lastCell > 0 && key) {
        sectors[key] = lastCell;
      }
      return;
    }
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

  if (Object.keys(regions).length === 0) {
    notes.push("Region totals row not parsed (check layout).");
  }
  if (Object.keys(sectors).length === 0) {
    notes.push("Sector rows not parsed (check layout).");
  }

  return { payload: { regions, sectors }, notes };
}

export async function fetchSeligsonDistributions(fid: number): Promise<{
  payload: DistributionPayload;
  notes: string[];
}> {
  const html = await fetchSeligsonHtml(fid);
  return parseSeligsonDistributions(html);
}
