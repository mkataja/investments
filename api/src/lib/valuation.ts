import { DEFAULT_CASH_CURRENCY, type instruments } from "@investments/db";
import type { InferSelectModel } from "drizzle-orm";
import yahooFinance from "yahoo-finance2";

export type InstrumentRow = InferSelectModel<typeof instruments>;

let eurUsdCache: { rate: number; at: number } | null = null;
const EUR_USD_TTL_MS = 60 * 60 * 1000;

async function getEurPerUsd(): Promise<number> {
  const now = Date.now();
  if (eurUsdCache && now - eurUsdCache.at < EUR_USD_TTL_MS) {
    return eurUsdCache.rate;
  }
  const [q] = await yahooFinance.quote(["EURUSD=X"]);
  const price = q?.regularMarketPrice;
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
    return 0.92;
  }
  /** Yahoo EURUSD=X: USD per 1 EUR */
  const eurPerUsd = 1 / price;
  eurUsdCache = { rate: eurPerUsd, at: now };
  return eurPerUsd;
}

function toEur(amount: number, currency: string | undefined): Promise<number> {
  const c = (currency ?? "USD").toUpperCase();
  if (c === "EUR") {
    return Promise.resolve(amount);
  }
  if (c === "USD") {
    return getEurPerUsd().then((r) => amount * r);
  }
  return Promise.resolve(amount);
}

export type ValuationResult = {
  valueEur: number;
  source: "yahoo_quote" | "mark_eur" | "cash" | "none";
  detail: string;
};

export async function valuePositionEur(
  instrument: InstrumentRow,
  quantity: number,
): Promise<ValuationResult> {
  if (instrument.kind === "cash_account") {
    const cur =
      instrument.cashCurrency?.trim().toUpperCase() ?? DEFAULT_CASH_CURRENCY;
    const valueEur = await toEur(quantity, cur);
    return {
      valueEur,
      source: "cash",
      detail: `Cash ${quantity} ${cur}`,
    };
  }

  if (instrument.yahooSymbol) {
    try {
      const [q] = await yahooFinance.quote([instrument.yahooSymbol]);
      const price = q?.regularMarketPrice;
      const cur = q?.currency;
      if (typeof price === "number" && Number.isFinite(price)) {
        const native = quantity * price;
        const eur = await toEur(native, cur);
        return {
          valueEur: eur,
          source: "yahoo_quote",
          detail: `${instrument.yahooSymbol} @ ${price} ${cur ?? ""}`,
        };
      }
    } catch {
      // fall through
    }
  }

  if (instrument.markPriceEur) {
    const m = Number.parseFloat(String(instrument.markPriceEur));
    if (Number.isFinite(m)) {
      return {
        valueEur: quantity * m,
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
