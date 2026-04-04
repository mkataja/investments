import {
  instruments,
  portfolioBenchmarkWeights,
  portfolios,
  type prices,
} from "@investments/db";
import type { InferSelectModel } from "drizzle-orm";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "../../db.js";
import {
  loadPriceRowsByInstrumentIdsUpToDate,
  pickLatestPriceRowAsOf,
} from "../instrument/latestPriceDistribution.js";
import { normalizeRawBenchmarkWeights } from "./benchmarkPortfolio.js";
import {
  type InstrumentRow,
  buildFxEurPerUnitMapAsOf,
  valuePortfolioRowsFromPriceMap,
} from "./valuation.js";

type BacktestVirtualTransaction = {
  id: number;
  portfolioId: number;
  brokerId: number;
  tradeDate: string;
  side: "buy";
  instrumentId: number;
  quantity: string;
  unitPrice: string;
  currency: string;
};

type BacktestValuedRow = {
  inst: InstrumentRow;
  qty: number;
  valueEur: number;
  source: "backtest";
};

function resolveStartDate(simulationStartDate: string | null): string {
  if (
    simulationStartDate != null &&
    /^\d{4}-\d{2}-\d{2}$/.test(simulationStartDate.trim())
  ) {
    return simulationStartDate.trim();
  }
  return new Date().toISOString().slice(0, 10);
}

function normalizeTotalEur(raw: string): number {
  const n = Number.parseFloat(String(raw));
  return Number.isFinite(n) && n > 0 ? n : 10_000;
}

function toUpperCurrencyOrEur(v: string | null | undefined): string {
  const c = v?.trim().toUpperCase() ?? "";
  return c.length > 0 ? c : "EUR";
}

async function loadBacktestBase(portfolioId: number): Promise<{
  parsed: Array<{
    inst: InstrumentRow;
    normalizedWeight: number;
    sortOrder: number;
  }>;
  startDate: string;
  totalEur: number;
}> {
  const [portfolioRowForBacktest] = await db
    .select({
      id: portfolios.id,
      benchmarkTotalEur: portfolios.benchmarkTotalEur,
      simulationStartDate: portfolios.simulationStartDate,
    })
    .from(portfolios)
    .where(eq(portfolios.id, portfolioId))
    .limit(1);
  if (!portfolioRowForBacktest) {
    return {
      parsed: [],
      startDate: new Date().toISOString().slice(0, 10),
      totalEur: 0,
    };
  }

  const weightRows = await db
    .select()
    .from(portfolioBenchmarkWeights)
    .where(eq(portfolioBenchmarkWeights.portfolioId, portfolioId))
    .orderBy(asc(portfolioBenchmarkWeights.sortOrder));
  if (weightRows.length === 0) {
    return {
      parsed: [],
      startDate: resolveStartDate(portfolioRowForBacktest.simulationStartDate),
      totalEur: normalizeTotalEur(
        String(portfolioRowForBacktest.benchmarkTotalEur),
      ),
    };
  }
  const instIds = [...new Set(weightRows.map((w) => w.instrumentId))];
  const instRows = await db
    .select()
    .from(instruments)
    .where(inArray(instruments.id, instIds));
  const byId = new Map(instRows.map((i) => [i.id, i] as const));
  const parsedRaw = weightRows
    .map((w) => {
      const inst = byId.get(w.instrumentId);
      const rawW = Number.parseFloat(String(w.weight));
      if (!inst || !Number.isFinite(rawW) || rawW <= 0) {
        return null;
      }
      return {
        inst,
        rawW,
        sortOrder: w.sortOrder,
      };
    })
    .filter(
      (x): x is { inst: InstrumentRow; rawW: number; sortOrder: number } =>
        x != null,
    );
  const norm = normalizeRawBenchmarkWeights(parsedRaw.map((x) => x.rawW));
  if (norm == null) {
    return {
      parsed: [],
      startDate: resolveStartDate(portfolioRowForBacktest.simulationStartDate),
      totalEur: normalizeTotalEur(
        String(portfolioRowForBacktest.benchmarkTotalEur),
      ),
    };
  }
  const parsed = parsedRaw.map((row, idx) => ({
    inst: row.inst,
    normalizedWeight: norm[idx] ?? 0,
    sortOrder: row.sortOrder,
  }));
  return {
    parsed,
    startDate: resolveStartDate(portfolioRowForBacktest.simulationStartDate),
    totalEur: normalizeTotalEur(
      String(portfolioRowForBacktest.benchmarkTotalEur),
    ),
  };
}

async function loadBacktestComputed(portfolioId: number): Promise<{
  rows: BacktestValuedRow[];
  virtualTransactions: BacktestVirtualTransaction[];
}> {
  const base = await loadBacktestBase(portfolioId);
  if (base.parsed.length === 0) {
    return { rows: [], virtualTransactions: [] };
  }
  const today = new Date().toISOString().slice(0, 10);
  const nonCashIds = base.parsed
    .map((p) => p.inst)
    .filter((i) => i.kind !== "cash_account")
    .map((i) => i.id);
  const nonCashPricesByInstrument =
    nonCashIds.length > 0
      ? await loadPriceRowsByInstrumentIdsUpToDate(db, nonCashIds, today)
      : new Map<number, InferSelectModel<typeof prices>[]>();
  const fxInstRows = await db
    .select()
    .from(instruments)
    .where(eq(instruments.kind, "fx"));
  const fxIds = fxInstRows.map((i) => i.id);
  const fxPricesByInstrument =
    fxIds.length > 0
      ? await loadPriceRowsByInstrumentIdsUpToDate(db, fxIds, today)
      : new Map<number, InferSelectModel<typeof prices>[]>();
  const startFxMap = buildFxEurPerUnitMapAsOf(
    fxInstRows,
    fxPricesByInstrument,
    base.startDate,
  );
  const latestFxMap = buildFxEurPerUnitMapAsOf(
    fxInstRows,
    fxPricesByInstrument,
    today,
  );
  const unitRows = base.parsed.map((p) => ({
    inst: p.inst,
    qty: 1,
  }));
  const startPriceRows = base.parsed
    .filter((p) => p.inst.kind !== "cash_account")
    .map((p) => ({
      instrumentId: p.inst.id,
      row: pickLatestPriceRowAsOf(
        nonCashPricesByInstrument.get(p.inst.id) ?? [],
        base.startDate,
      ),
    }));
  if (startPriceRows.some((x) => x.row == null)) {
    return { rows: [], virtualTransactions: [] };
  }
  const startPriceMap = new Map(
    startPriceRows.map(
      (x) =>
        [x.instrumentId, x.row as InferSelectModel<typeof prices>] as const,
    ),
  );
  const startUnitValues = valuePortfolioRowsFromPriceMap(
    unitRows,
    startPriceMap,
    startFxMap,
  );
  const computedRows = base.parsed.map((p, idx) => {
    const eurPerUnit = startUnitValues[idx]?.valueEur ?? 0;
    const qty =
      Number.isFinite(eurPerUnit) && eurPerUnit > 0
        ? (base.totalEur * p.normalizedWeight) / eurPerUnit
        : 0;
    return { ...p, qty };
  });
  const latestPriceMap = new Map(
    base.parsed
      .filter((p) => p.inst.kind !== "cash_account")
      .map((p) => {
        const row = pickLatestPriceRowAsOf(
          nonCashPricesByInstrument.get(p.inst.id) ?? [],
          today,
        );
        return row ? ([p.inst.id, row] as const) : null;
      })
      .filter(
        (x): x is readonly [number, InferSelectModel<typeof prices>] =>
          x != null,
      ),
  );
  const currentValues = valuePortfolioRowsFromPriceMap(
    computedRows.map((p) => ({ inst: p.inst, qty: p.qty })),
    latestPriceMap,
    latestFxMap,
  );
  const rows: BacktestValuedRow[] = computedRows.map((p, idx) => ({
    inst: p.inst,
    qty: p.qty,
    valueEur: currentValues[idx]?.valueEur ?? 0,
    source: "backtest",
  }));
  const tradeDate = `${base.startDate}T00:00:00.000Z`;
  const virtualTransactions: BacktestVirtualTransaction[] = computedRows.map(
    (p, idx) => {
      const startPrice = startPriceMap.get(p.inst.id);
      const quantity = String(p.qty);
      const unitPrice =
        p.inst.kind === "cash_account"
          ? "1"
          : String(Number(startPrice?.quotedPrice ?? 0));
      const currency =
        p.inst.kind === "cash_account"
          ? toUpperCurrencyOrEur(p.inst.cashCurrency)
          : toUpperCurrencyOrEur(startPrice?.currency);
      return {
        id: -1_000_000_000 - portfolioId * 1000 - idx,
        portfolioId,
        brokerId: p.inst.brokerId ?? 0,
        tradeDate,
        side: "buy",
        instrumentId: p.inst.id,
        quantity,
        unitPrice,
        currency,
      };
    },
  );
  return { rows, virtualTransactions };
}

export async function loadBacktestValuedRows(
  portfolioId: number,
): Promise<BacktestValuedRow[]> {
  const result = await loadBacktestComputed(portfolioId);
  return result.rows;
}

export async function loadBacktestVirtualTransactions(
  portfolioId: number,
): Promise<BacktestVirtualTransaction[]> {
  const result = await loadBacktestComputed(portfolioId);
  return result.virtualTransactions;
}
