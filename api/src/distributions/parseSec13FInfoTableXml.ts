import * as cheerio from "cheerio";

export type Sec13FInfoTableRow = {
  nameOfIssuer: string;
  cusip: string;
  /** Dollar value as reported in the filing (typically thousands of USD; only ratios matter). */
  valueRaw: number;
  putCall: string | null;
};

function parseValue(s: string): number | null {
  const t = s.replace(/,/g, "").trim();
  if (!t) {
    return null;
  }
  const n = Number.parseInt(t, 10);
  if (!Number.isFinite(n) || n < 0) {
    return null;
  }
  return n;
}

/**
 * SEC Form 13F information table XML (`INFORMATION TABLE` document).
 * Accepts the root used in EDGAR (`informationTable` / `edgarSubmission` wrappers).
 */
export function parseSec13FInfoTableXml(xmlText: string): Sec13FInfoTableRow[] {
  const $ = cheerio.load(xmlText.trim(), { xml: true });
  const out: Sec13FInfoTableRow[] = [];
  $("infoTable").each((_i, node) => {
    const el = $(node);
    const nameOfIssuer = el.find("nameOfIssuer").first().text().trim();
    const cusip = el.find("cusip").first().text().trim().replace(/\s+/g, "");
    const valueRaw = parseValue(el.find("value").first().text().trim());
    const putCallRaw = el.find("putCall").first().text().trim();
    const putCall = putCallRaw.length > 0 ? putCallRaw.toLowerCase() : null;
    out.push({ nameOfIssuer, cusip, valueRaw: valueRaw ?? 0, putCall });
  });

  return out.filter((r) => {
    if (r.cusip.length < 9) {
      return false;
    }
    if (!(r.valueRaw > 0)) {
      return false;
    }
    if (r.putCall === "put" || r.putCall === "call") {
      return false;
    }
    return true;
  });
}
