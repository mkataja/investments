import * as cheerio from "cheerio";
import { parseFiPercent } from "./seligson.js";

const USER_AGENT = "InvestmentsTracker/0.1 (personal)";

type SeligsonPharosAllocationRow = {
  rawLabel: string;
  /** Share of total fund (0–1), from “Osuus rahastosta”. */
  pctOfFund: number;
};

/**
 * Fetch a public Seligson.fi HTML page (e.g. Pharos allocation table).
 */
export async function fetchSeligsonPublicPageHtml(
  url: string,
): Promise<string> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error("Invalid URL");
  }
  if (u.protocol !== "https:") {
    throw new Error("URL must use HTTPS");
  }
  const host = u.hostname.toLowerCase();
  if (host !== "www.seligson.fi" && host !== "seligson.fi") {
    throw new Error("URL must be on seligson.fi");
  }
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`Seligson HTTP ${res.status}`);
  }
  return res.text();
}

function normalizeRowLabel(s: string): string {
  return s
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Best-effort fund label from the main page heading (`<h1>`), else `<title>`, for
 * synthetic `seligson_funds` rows (NAV matching vs FundValues).
 */
export function parseSeligsonPublicPageFundName(html: string): string | null {
  const $ = cheerio.load(html);
  const h1 = $("h1").first().text().replace(/\s+/g, " ").trim();
  if (h1.length > 0) {
    return h1;
  }
  const title = $("title").first().text().replace(/\s+/g, " ").trim();
  if (title) {
    const pipe = title.split("|")[0]?.trim();
    const dash = (pipe ?? title).split(/\s*[–—-]\s*/)[0]?.trim();
    const candidate = (dash ?? pipe ?? title).trim();
    if (candidate.length > 0) {
      return candidate;
    }
  }
  return null;
}

/** `d.m.yyyy` in page heading → ISO `yyyy-mm-dd` when parsable. */
export function parseSeligsonTilanneDate(html: string): string | null {
  const $ = cheerio.load(html);
  const text = $.text();
  const m = /Tilanne\s+(\d{1,2})\.(\d{1,2})\.(\d{4})/i.exec(text);
  if (!m?.[1] || !m?.[2] || !m?.[3]) {
    return null;
  }
  const dd = m[1].padStart(2, "0");
  const mm = m[2].padStart(2, "0");
  const yyyy = m[3];
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Parses “Osuus rahastosta” column from Seligson public allocation tables (e.g. Pharos).
 * Expects at least three columns: label, sleeve %, fund %.
 */
export function parseSeligsonPharosAllocationTable(html: string): {
  asOfDate: string | null;
  rows: SeligsonPharosAllocationRow[];
  notes: string[];
} {
  const notes: string[] = [];
  const rows: SeligsonPharosAllocationRow[] = [];
  const asOfDate = parseSeligsonTilanneDate(html);
  const $ = cheerio.load(html);

  $("tr").each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.length < 3) {
      return;
    }
    const rawName = normalizeRowLabel($(tds[0]).text());
    if (!rawName) {
      return;
    }
    const upper = rawName.toUpperCase();
    if (
      upper.startsWith("YHTEENSÄ") ||
      upper.includes("RAHASTON KOKO") ||
      upper === "OSAKESIJOITUKSET" ||
      upper === "PITKÄT KORKOSIJOITUKSET (>1V)" ||
      upper.includes("PITKÄT KORKOSIJOITUKSET") ||
      upper.includes("LYHYET KORKOSIJOITUKSET") ||
      upper.includes("KORKORISKI") ||
      upper.includes("DURAATIO")
    ) {
      return;
    }
    const fundShareCell = $(tds[tds.length - 1]).text();
    const pct = parseFiPercent(fundShareCell);
    if (pct === null || pct <= 0) {
      return;
    }
    rows.push({ rawLabel: rawName, pctOfFund: pct });
  });

  if (rows.length === 0) {
    notes.push("No data rows parsed (expected table cells with fund share %).");
  }

  const sum = rows.reduce((s, r) => s + r.pctOfFund, 0);
  if (sum > 1e-6 && (sum < 0.97 || sum > 1.03)) {
    notes.push(
      `Fund share column sums to ${(sum * 100).toFixed(1)}% — normalizing weights to 100%.`,
    );
    for (const r of rows) {
      r.pctOfFund /= sum;
    }
  }

  return { asOfDate, rows, notes };
}
