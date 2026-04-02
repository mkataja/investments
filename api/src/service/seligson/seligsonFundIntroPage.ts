import * as cheerio from "cheerio";

const USER_AGENT = "InvestmentsTracker/0.1 (personal)";

const SELIGSON_HOST = "www.seligson.fi";

function assertAllowedSeligsonFundPageUrl(urlString: string): URL {
  let u: URL;
  try {
    u = new URL(urlString.trim());
  } catch {
    throw new Error("Invalid fund page URL");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    throw new Error("Fund page URL must be http(s)");
  }
  if (u.hostname !== SELIGSON_HOST) {
    throw new Error(`Fund page URL must be on ${SELIGSON_HOST}`);
  }
  return u;
}

/**
 * Parses Seligson fund intro HTML (`rahes_*.htm`) for FundViewer `fid` and the
 * "Arvohistoria csv-muodossa" download link (absolute URL).
 */
export function parseSeligsonFundIntroHtml(
  html: string,
  pageUrl: string,
): { fid: number; priceHistoryCsvUrl: string } {
  const base = new URL(pageUrl);
  const fids = new Set<number>();
  const fidRe = /[?&]fid=(\d+)/gi;
  let m: RegExpExecArray | null = fidRe.exec(html);
  while (m !== null) {
    fids.add(Number.parseInt(m[1] ?? "", 10));
    m = fidRe.exec(html);
  }
  if (fids.size === 0) {
    throw new Error("Could not find fund fid on page");
  }
  if (fids.size > 1) {
    throw new Error(
      `Multiple distinct fid values on page: ${[...fids].sort((a, b) => a - b).join(", ")}`,
    );
  }
  const fid = Array.from(fids)[0];
  if (fid === undefined) {
    throw new Error("Could not find fund fid on page");
  }

  const $ = cheerio.load(html);
  let csvHref: string | null = null;
  $("a[href]").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim().toLowerCase();
    if (t.includes("arvohistoria") && t.includes("csv")) {
      csvHref = $(el).attr("href") ?? null;
      return false;
    }
    return undefined;
  });
  if (csvHref == null || csvHref === "") {
    throw new Error("Could not find Arvohistoria csv link on page");
  }
  const abs = new URL(csvHref, base);
  if (abs.hostname !== SELIGSON_HOST) {
    throw new Error("CSV link must point to seligson.fi");
  }
  return { fid, priceHistoryCsvUrl: abs.href };
}

const RAHASTON_SIJOITUKSET_HINT = "rahaston sijoitukset";

/**
 * From fund intro HTML (`rahes_*.htm`), finds the "Rahaston sijoitukset" link and returns its
 * absolute URL (allocation table or FundViewer), or `null` if missing.
 */
export function resolveRahastonSijoituksetTableUrl(
  introHtml: string,
  introPageUrl: string,
): string | null {
  const base = new URL(introPageUrl);
  const $ = cheerio.load(introHtml);
  let href: string | null = null;
  for (const el of $("a[href]").toArray()) {
    const text = $(el).text().replace(/\s+/g, " ").trim().toLowerCase();
    if (text.includes(RAHASTON_SIJOITUKSET_HINT)) {
      href = $(el).attr("href") ?? null;
      break;
    }
  }
  if (href == null || href === "" || href.startsWith("#")) {
    return null;
  }
  const abs = new URL(href, base);
  const host = abs.hostname.toLowerCase();
  if (host !== "www.seligson.fi" && host !== "seligson.fi") {
    return null;
  }
  return abs.href;
}

/**
 * True when “Rahaston sijoitukset” points at dynamic FundViewer (normal funds). False for the
 * static HTML allocation table used by Pharos-style multi-line merge.
 */
export function isSeligsonFundViewerUrl(urlString: string): boolean {
  try {
    const u = new URL(urlString);
    return u.pathname.toLowerCase().includes("fundviewer.php");
  } catch {
    return false;
  }
}

/** Normalize `http:` Seligson URLs to `https:` for storage and for `fetchSeligsonPublicPageHtml`. */
export function normalizeSeligsonFundPageToHttps(url: string): string {
  const u = new URL(url);
  if (u.protocol === "http:") {
    u.protocol = "https:";
  }
  return u.href;
}

export async function fetchSeligsonFundIntroPageHtml(
  pageUrl: string,
): Promise<{ href: string; html: string }> {
  const u = assertAllowedSeligsonFundPageUrl(pageUrl);
  const res = await fetch(u.href, {
    headers: { "User-Agent": USER_AGENT },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`Seligson fund page HTTP ${res.status}`);
  }
  const html = await res.text();
  return { href: u.href, html };
}
