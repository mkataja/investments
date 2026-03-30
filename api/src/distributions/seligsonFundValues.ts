import {
  instruments,
  prices,
  seligsonFundValueCache,
  seligsonFunds,
} from "@investments/db";
import * as cheerio from "cheerio";
import { eq } from "drizzle-orm";
import type { DbClient } from "../db.js";
import { normalizeSeligsonFundNameForMatch } from "../import/seligsonTransactions.js";

const FUND_VALUES_URL =
  "https://www.seligson.fi/suomi/rahastot/FundValues_FI.html";

const USER_AGENT = "InvestmentsTracker/0.1 (personal)";

/**
 * Short `FundValues_FI.html` link labels that do not substring-match the FundViewer fund name.
 * Values are lowercased needles checked against the normalized DB name.
 */
const FUND_VALUES_TABLE_LABEL_ALIASES: Readonly<Record<string, string>> = {
  "global brands": "top 25 brands",
};

export type ParsedFundValueRow = {
  fundLabel: string;
  value: number;
  currency: string;
};

export async function fetchSeligsonFundValuesHtml(): Promise<string> {
  const res = await fetch(FUND_VALUES_URL, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`Seligson FundValues HTTP ${res.status}`);
  }
  return res.text();
}

/**
 * Parse Finnish fund NAV: comma is the decimal separator; spaces and `.` group thousands
 * (e.g. `1 234,56 €`, `1.234,56 €`, `2,7224 €`). Never treat `,` as a thousands separator.
 */
function parseArvoCell(
  text: string,
): { value: number; currency: string } | null {
  const t = text.replace(/\u00a0/g, " ").trim();
  const m = /^([\d\s.,]+)\s*(€|EUR)?\s*$/i.exec(t);
  if (!m?.[1]) {
    return null;
  }
  const numPart = m[1].trim();
  let n: number;
  const lastComma = numPart.lastIndexOf(",");
  if (lastComma >= 0) {
    const intRaw = numPart
      .slice(0, lastComma)
      .replace(/\s/g, "")
      .replace(/\./g, "");
    const fracRaw = numPart.slice(lastComma + 1).replace(/\s/g, "");
    if (!/^\d+$/.test(intRaw) || !/^\d+$/.test(fracRaw)) {
      return null;
    }
    n = Number.parseFloat(`${intRaw}.${fracRaw}`);
  } else {
    let compact = numPart.replace(/\s/g, "");
    if (/^\d{1,3}(\.\d{3})+$/.test(compact)) {
      compact = compact.replace(/\./g, "");
    }
    n = Number.parseFloat(compact);
  }
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  const cur = m[2]?.toUpperCase() === "EUR" || m[2] === "€" ? "EUR" : "EUR";
  return { value: n, currency: cur };
}

/**
 * Parse the main `table.rahasto` on FundValues_FI.html (fund short name + NAV).
 */
export function parseFundValuesTable(html: string): ParsedFundValueRow[] {
  const $ = cheerio.load(html);
  const out: ParsedFundValueRow[] = [];
  $("table.rahasto tr").each((_, tr) => {
    const $tr = $(tr);
    const tds = $tr.find("td");
    if (tds.length < 3) {
      return;
    }
    const first = $(tds[0]);
    if (first.attr("colspan")) {
      return;
    }
    const link = first.find("a").first();
    const label = link.length
      ? link.text().trim()
      : first
          .text()
          .replace(/\u00a0/g, " ")
          .trim();
    if (!label) {
      return;
    }
    const arvoCell = $tr.find('td[data-label="Arvo"]').first().text();
    const parsed = parseArvoCell(arvoCell);
    if (!parsed) {
      return;
    }
    out.push({
      fundLabel: label,
      value: parsed.value,
      currency: parsed.currency,
    });
  });
  return out;
}

/**
 * Match a short table label (e.g. `Eurooppa`) to `seligson_funds.name` from FundViewer.
 */
export function fundValuesRowMatchesDbName(
  tableLabel: string,
  dbFundName: string,
): boolean {
  const a = normalizeSeligsonFundNameForMatch(tableLabel).toLowerCase();
  const b = normalizeSeligsonFundNameForMatch(dbFundName).toLowerCase();
  const aliasNeedle = FUND_VALUES_TABLE_LABEL_ALIASES[a];
  if (aliasNeedle !== undefined) {
    return b.includes(aliasNeedle);
  }
  if (a === b) {
    return true;
  }
  if (a.length >= 3 && (b.includes(a) || a.includes(b))) {
    return true;
  }
  return false;
}

/**
 * Fetch FundValues_FI once, upsert `seligson_fund_value_cache` and `prices` for all matched funds.
 */
export async function upsertSeligsonFundValuesFromPage(
  d: DbClient,
  fetchedAt: Date,
): Promise<void> {
  let html: string;
  try {
    html = await fetchSeligsonFundValuesHtml();
  } catch (e) {
    console.error("Seligson FundValues fetch failed", e);
    return;
  }
  const parsed = parseFundValuesTable(html);
  if (parsed.length === 0) {
    console.warn("Seligson FundValues: no rows parsed");
    return;
  }
  const funds = await d.select().from(seligsonFunds);
  for (const sf of funds) {
    const row = parsed.find((r) =>
      fundValuesRowMatchesDbName(r.fundLabel, sf.name),
    );
    if (!row) {
      console.warn(`Seligson FundValues: no table row for fund "${sf.name}"`);
      continue;
    }
    await d
      .insert(seligsonFundValueCache)
      .values({
        seligsonFundId: sf.id,
        fetchedAt,
        raw: row,
      })
      .onConflictDoUpdate({
        target: seligsonFundValueCache.seligsonFundId,
        set: {
          fetchedAt,
          raw: row,
        },
      });
    const insts = await d
      .select()
      .from(instruments)
      .where(eq(instruments.seligsonFundId, sf.id));
    for (const inst of insts) {
      await d
        .insert(prices)
        .values({
          instrumentId: inst.id,
          quotedPrice: String(row.value),
          currency: row.currency,
          fetchedAt,
          source: "seligson_fund_values",
        })
        .onConflictDoUpdate({
          target: prices.instrumentId,
          set: {
            quotedPrice: String(row.value),
            currency: row.currency,
            fetchedAt,
            source: "seligson_fund_values",
          },
        });
    }
  }
}
