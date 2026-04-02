import type { DbClient } from "../db.js";
import { parseEuropeanDecimalString } from "../import/degiroTransactions.js";
import { parseSeligsonTradeDateDMY } from "../import/seligsonTransactions.js";
import { upsertPriceForDate } from "./priceDistributionWrite.js";

const SELIGSON_ARVOHISTORIA_CSV_PRICE_SOURCE = "seligson_csv_backfill";

const USER_AGENT = "InvestmentsTracker/0.1 (personal)";

/**
 * Parses Seligson "Arvohistoria csv-muodossa" files: one `d.m.yyyy;value` per line, comma decimal.
 */
export function parseSeligsonArvohistoriaCsv(
  text: string,
): { priceDate: string; quotedPrice: string }[] {
  const out: { priceDate: string; quotedPrice: string }[] = [];
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (t === "") {
      continue;
    }
    const semi = t.indexOf(";");
    if (semi < 0) {
      continue;
    }
    const dateRaw = t.slice(0, semi).trim();
    const valRaw = t.slice(semi + 1).trim();
    const priceDate = parseSeligsonTradeDateDMY(dateRaw);
    if (priceDate === null) {
      continue;
    }
    const parsed = parseEuropeanDecimalString(valRaw);
    if (parsed === null) {
      continue;
    }
    const n = Number.parseFloat(parsed);
    if (!Number.isFinite(n) || n <= 0) {
      continue;
    }
    out.push({ priceDate, quotedPrice: parsed });
  }
  return out;
}

/**
 * Fetches the CSV and upserts one `close` price per row (EUR). Skips when `csvUrl` is empty.
 */
export async function backfillSeligsonPricesFromArvohistoriaCsv(
  d: DbClient,
  instrumentId: number,
  csvUrl: string,
): Promise<{ rowsUpserted: number }> {
  const url = csvUrl.trim();
  if (url === "") {
    return { rowsUpserted: 0 };
  }
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`Seligson Arvohistoria CSV HTTP ${res.status}`);
  }
  const text = await res.text();
  const rows = parseSeligsonArvohistoriaCsv(text);
  if (rows.length === 0) {
    throw new Error("Seligson Arvohistoria CSV: no rows parsed");
  }
  const fetchedAt = new Date();
  let n = 0;
  for (const r of rows) {
    await upsertPriceForDate(d, {
      instrumentId,
      priceDate: r.priceDate,
      quotedPrice: r.quotedPrice,
      currency: "EUR",
      fetchedAt,
      source: SELIGSON_ARVOHISTORIA_CSV_PRICE_SOURCE,
      priceType: "close",
      skipFxEnqueue: true,
    });
    n += 1;
  }
  return { rowsUpserted: n };
}
