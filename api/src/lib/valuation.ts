import { DEFAULT_CASH_CURRENCY, type instruments } from "@investments/db";
import type { InferSelectModel } from "drizzle-orm";
import { yahooFinance } from "./yahooClient.js";
import { withYahooRetries } from "./yahooUpstream.js";

export type InstrumentRow = InferSelectModel<typeof instruments>;

type QuoteLike = {
  regularMarketPrice?: number;
  currency?: string;
};

let eurUsdCache: { rate: number; at: number } | null = null;
const EUR_USD_TTL_MS = 60 * 60 * 1000;

async function getEurPerUsd(): Promise<number> {
  const now = Date.now();
  if (eurUsdCache && now - eurUsdCache.at < EUR_USD_TTL_MS) {
    return eurUsdCache.rate;
  }
  try {
    const q = await withYahooRetries(() => yahooFinance.quote("EURUSD=X"));
    const price = q?.regularMarketPrice;
    if (typeof price === "number" && Number.isFinite(price) && price > 0) {
      /** Yahoo EURUSD=X: USD per 1 EUR */
      const eurPerUsd = 1 / price;
      eurUsdCache = { rate: eurPerUsd, at: now };
      return eurPerUsd;
    }
  } catch {
    // fall through
  }
  return 0.92;
}

function toEurFromRates(
  amount: number,
  currency: string | undefined,
  eurPerUsd: number,
): number {
  const c = (currency ?? "USD").toUpperCase();
  if (c === "EUR") {
    return amount;
  }
  if (c === "USD") {
    return amount * eurPerUsd;
  }
  return amount;
}

async function resolveEurPerUsdFromBatch(
  quotes: Record<string, QuoteLike>,
): Promise<number> {
  const q = quotes["EURUSD=X"];
  const price = q?.regularMarketPrice;
  if (typeof price === "number" && Number.isFinite(price) && price > 0) {
    const rate = 1 / price;
    eurUsdCache = { rate, at: Date.now() };
    return rate;
  }
  return getEurPerUsd();
}

function markOrNone(inst: InstrumentRow, qty: number): ValuationResult {
  if (inst.markPriceEur) {
    const m = Number.parseFloat(String(inst.markPriceEur));
    if (Number.isFinite(m)) {
      return {
        valueEur: qty * m,
        source: "mark_eur",
        detail: "instrument.mark_price_eur",
      };
    }
  }
  return {
    valueEur: 0,
    source: "none",
    detail: "No quote or mark_price_eur",
  };
}

function valueYahooRow(
  inst: InstrumentRow,
  qty: number,
  quotes: Record<string, QuoteLike>,
  eurPerUsd: number,
): ValuationResult {
  const sym = inst.yahooSymbol;
  if (!sym) {
    return markOrNone(inst, qty);
  }
  const q = quotes[sym];
  const price = q?.regularMarketPrice;
  const cur = q?.currency;
  if (typeof price === "number" && Number.isFinite(price)) {
    const native = qty * price;
    const valueEur = toEurFromRates(native, cur, eurPerUsd);
    return {
      valueEur,
      source: "yahoo_quote",
      detail: `${sym} @ ${price} ${cur ?? ""}`,
    };
  }
  return markOrNone(inst, qty);
}

export type ValuationResult = {
  valueEur: number;
  source: "yahoo_quote" | "mark_eur" | "cash" | "none";
  detail: string;
};

export async function valuePortfolioRowsEur(
  rows: Array<{ inst: InstrumentRow; qty: number }>,
): Promise<ValuationResult[]> {
  const yahooSyms = [
    ...new Set(
      rows
        .map((r) => r.inst.yahooSymbol)
        .filter((s): s is string => typeof s === "string" && s.length > 0),
    ),
  ];
  const hasCashUsd = rows.some(
    (r) =>
      r.inst.kind === "cash_account" &&
      (r.inst.cashCurrency?.trim().toUpperCase() ?? DEFAULT_CASH_CURRENCY) ===
        "USD",
  );
  const needQuoteFetch = yahooSyms.length > 0 || hasCashUsd;

  let quotes: Record<string, QuoteLike> = {};
  if (needQuoteFetch) {
    const symbols = [...new Set([...yahooSyms, "EURUSD=X"])];
    try {
      quotes = (await withYahooRetries(() =>
        yahooFinance.quote(symbols, { return: "object" }),
      )) as Record<string, QuoteLike>;
    } catch {
      quotes = {};
    }
  }

  const eurPerUsd = await resolveEurPerUsdFromBatch(quotes);

  return rows.map(({ inst, qty }) => {
    if (inst.kind === "cash_account") {
      const cur =
        inst.cashCurrency?.trim().toUpperCase() ?? DEFAULT_CASH_CURRENCY;
      const valueEur = toEurFromRates(qty, cur, eurPerUsd);
      return {
        valueEur,
        source: "cash",
        detail: `Cash ${qty} ${cur}`,
      };
    }
    if (inst.yahooSymbol) {
      return valueYahooRow(inst, qty, quotes, eurPerUsd);
    }
    return markOrNone(inst, qty);
  });
}
