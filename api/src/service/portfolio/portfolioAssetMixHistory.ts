import {
  type distributions,
  instruments,
  type portfolios,
  type prices,
  transactions,
} from "@investments/db";
import type { InferSelectModel } from "drizzle-orm";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "../../db.js";
import { calendarDateUtcFromInstant } from "../../lib/calendarDateUtc.js";
import {
  loadDistributionRowsByInstrumentIdsUpToDate,
  loadPriceRowsByInstrumentIdsUpToDate,
  pickDistributionRowForAssetMixHistory,
  pickLatestPriceRowAsOf,
} from "../instrument/latestPriceDistribution.js";
import { loadPortfolioOwnedByUser } from "./portfolioAccess.js";
import {
  buildMergedSectorsForAssetMix,
  computeAssetMixEur,
  equitySectorsEurFromSnapshot,
} from "./portfolioAssetMix.js";
import {
  type InstrumentRow,
  buildFxEurPerUnitMapAsOf,
  valuePortfolioRowsFromPriceMap,
} from "./valuation.js";

const STEP_DAYS = 7;

function endOfUtcDay(dateStr: string): Date {
  return new Date(`${dateStr}T23:59:59.999Z`);
}

function addDaysUtc(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function candidateDatesForAssetMixHistory(
  startDate: string,
  today: string,
): string[] {
  const dates: string[] = [];
  for (let d = startDate; d <= today; d = addDaysUtc(d, STEP_DAYS)) {
    dates.push(d);
    if (d >= today) {
      break;
    }
  }
  if (startDate <= today && !dates.includes(today)) {
    dates.push(today);
  }
  return dates;
}

function positionRowsFromQty(
  qty: Map<number, number>,
  instrumentsById: Map<number, InstrumentRow>,
): Array<{ inst: InstrumentRow; qty: number }> {
  const out: Array<{ inst: InstrumentRow; qty: number }> = [];
  for (const [instrumentId, q] of qty) {
    if (!Number.isFinite(q) || q === 0) {
      continue;
    }
    const inst = instrumentsById.get(instrumentId);
    if (!inst) {
      continue;
    }
    out.push({ inst, qty: q });
  }
  return out;
}

type TxRow = {
  tradeDate: Date;
  instrumentId: number;
  side: string;
  quantity: string;
};

function applyTransactionsUpTo(
  txRows: TxRow[],
  state: { i: number },
  qty: Map<number, number>,
  asOfEnd: Date,
): void {
  while (state.i < txRows.length) {
    const t = txRows[state.i];
    if (!t || t.tradeDate > asOfEnd) {
      break;
    }
    state.i++;
    const q = Number.parseFloat(String(t.quantity));
    if (!Number.isFinite(q)) {
      continue;
    }
    const delta = t.side === "buy" ? q : -q;
    const prev = qty.get(t.instrumentId) ?? 0;
    const next = prev + delta;
    if (next === 0) {
      qty.delete(t.instrumentId);
    } else {
      qty.set(t.instrumentId, next);
    }
  }
}

function priceMapForDate(
  positionRows: Array<{ inst: InstrumentRow; qty: number }>,
  pricesByInstrument: Map<number, InferSelectModel<typeof prices>[]>,
  asOfDate: string,
): Map<number, InferSelectModel<typeof prices>> {
  const m = new Map<number, InferSelectModel<typeof prices>>();
  for (const { inst } of positionRows) {
    if (inst.kind === "cash_account") {
      continue;
    }
    const rows = pricesByInstrument.get(inst.id);
    if (!rows?.length) {
      continue;
    }
    const p = pickLatestPriceRowAsOf(rows, asOfDate);
    if (p) {
      m.set(inst.id, p);
    }
  }
  return m;
}

function distributionMapForDate(
  positionRows: Array<{ inst: InstrumentRow; qty: number }>,
  distByInstrument: Map<number, InferSelectModel<typeof distributions>[]>,
  asOfDate: string,
): Map<number, InferSelectModel<typeof distributions>> {
  const m = new Map<number, InferSelectModel<typeof distributions>>();
  for (const { inst } of positionRows) {
    if (inst.kind === "cash_account") {
      continue;
    }
    const rows = distByInstrument.get(inst.id);
    if (!rows?.length) {
      continue;
    }
    const r = pickDistributionRowForAssetMixHistory(rows, asOfDate);
    if (r) {
      m.set(inst.id, r);
    }
  }
  return m;
}

type PortfolioRow = typeof portfolios.$inferSelect;

/**
 * Weekly samples from first portfolio trade, plus a trailing point for **today** (UTC calendar)
 * when the weekly grid does not land on today. Each point matches **asset mix** slices from
 * `computeAssetMixEur` (same sleeves as the asset mix pie), including emergency fund split for cash
 * in accounts, plus `equitySectorsEur` (equity sleeve only, same sector keys as the sectors bar chart).
 * Stops when any non-cash position lacks a price on or before the date. Distribution
 * snapshots: earliest `snapshot_date >= asOf` per instrument (next snapshot fills gaps); if as-of is
 * after all snapshots, the newest snapshot is used. Prices still use latest `price_date <= asOf`.
 *
 * Loads transactions once, walks dates in memory, and batches price and distribution queries.
 */
export async function getPortfolioAssetMixHistory(
  portfolioId: number,
  options?: { portfolio: PortfolioRow },
): Promise<{
  points: Array<{
    date: string;
    equitiesEur: number;
    bondsTotalEur: number;
    commodityGoldEur: number;
    commoditySilverEur: number;
    commodityOtherEur: number;
    cashInFundsEur: number;
    cashExcessEur: number;
    equitySectorsEur: Record<string, number>;
  }>;
}> {
  const pf =
    options?.portfolio ?? (await loadPortfolioOwnedByUser(portfolioId));
  if (!pf || pf.id !== portfolioId) {
    return { points: [] };
  }
  if (pf.kind === "benchmark") {
    return { points: [] };
  }

  const emergencyFundTargetEurRaw = Number(pf.emergencyFundEur);
  const emergencyFundTargetEur = Number.isFinite(emergencyFundTargetEurRaw)
    ? emergencyFundTargetEurRaw
    : 0;

  const txRows = await db
    .select({
      tradeDate: transactions.tradeDate,
      instrumentId: transactions.instrumentId,
      side: transactions.side,
      quantity: transactions.quantity,
    })
    .from(transactions)
    .where(eq(transactions.portfolioId, portfolioId))
    .orderBy(asc(transactions.tradeDate));

  const [firstRow] = txRows;
  if (!firstRow) {
    return { points: [] };
  }

  const startDate = calendarDateUtcFromInstant(new Date(firstRow.tradeDate));

  const today = new Date().toISOString().slice(0, 10);
  const candidateDates = candidateDatesForAssetMixHistory(startDate, today);
  if (candidateDates.length === 0) {
    return { points: [] };
  }

  const maxDate = candidateDates.reduce((a, b) => (a > b ? a : b));

  const fxInstRows = await db
    .select()
    .from(instruments)
    .where(eq(instruments.kind, "fx"));
  const fxIds = fxInstRows.map((i) => i.id);
  const fxPricesByInstrument =
    fxIds.length > 0
      ? await loadPriceRowsByInstrumentIdsUpToDate(db, fxIds, maxDate)
      : new Map<number, InferSelectModel<typeof prices>[]>();

  const instrumentIds = [...new Set(txRows.map((t) => t.instrumentId))];
  const instRows = await db
    .select()
    .from(instruments)
    .where(inArray(instruments.id, instrumentIds));
  const instrumentsById = new Map(
    instRows.map((i) => [i.id, i] as [number, InstrumentRow]),
  );

  const nonCashInstrumentIds = instRows
    .filter((i) => i.kind !== "cash_account")
    .map((i) => i.id);

  const [pricesByInstrument, distByInstrument] = await Promise.all([
    loadPriceRowsByInstrumentIdsUpToDate(db, nonCashInstrumentIds, maxDate),
    loadDistributionRowsByInstrumentIdsUpToDate(
      db,
      nonCashInstrumentIds,
      maxDate,
    ),
  ]);

  const emptyMix = computeAssetMixEur({
    nonCashPrincipalEur: 0,
    mergedSectors: {},
    cashInFundsEur: 0,
    cashExcessEur: 0,
  });

  const points: Array<{
    date: string;
    equitiesEur: number;
    bondsTotalEur: number;
    commodityGoldEur: number;
    commoditySilverEur: number;
    commodityOtherEur: number;
    cashInFundsEur: number;
    cashExcessEur: number;
    equitySectorsEur: Record<string, number>;
  }> = [];
  const qty = new Map<number, number>();
  const txState = { i: 0 };

  for (const d of candidateDates) {
    applyTransactionsUpTo(txRows, txState, qty, endOfUtcDay(d));
    const rows = positionRowsFromQty(qty, instrumentsById);
    if (rows.length === 0) {
      points.push({ date: d, ...emptyMix, equitySectorsEur: {} });
      continue;
    }

    const priceMap = priceMapForDate(rows, pricesByInstrument, d);
    const eurPerUnit = buildFxEurPerUnitMapAsOf(
      fxInstRows,
      fxPricesByInstrument,
      d,
    );
    const valuedResults = valuePortfolioRowsFromPriceMap(
      rows,
      priceMap,
      eurPerUnit,
    );

    let cashEur = 0;
    let stop = false;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const v = valuedResults[i];
      if (!row || !v) {
        continue;
      }
      if (row.inst.kind === "cash_account") {
        cashEur += v.valueEur;
        continue;
      }
      if (v.source === "none") {
        stop = true;
        break;
      }
    }
    if (stop) {
      break;
    }

    const valuedFull = rows.map((row, i) => ({
      inst: row.inst,
      valueEur: valuedResults[i]?.valueEur ?? 0,
    }));
    const distMap = distributionMapForDate(rows, distByInstrument, d);
    const { mergedSectors, nonCashPrincipalEur, cashInFundsEur } =
      buildMergedSectorsForAssetMix(valuedFull, distMap);
    const cashExcessEur = Math.max(0, cashEur - emergencyFundTargetEur);
    const mix = computeAssetMixEur({
      nonCashPrincipalEur,
      mergedSectors,
      cashInFundsEur,
      cashExcessEur,
    });
    const equitySectorsEur = equitySectorsEurFromSnapshot({
      nonCashPrincipalEur,
      mergedSectors,
      cashInFundsEur,
      cashExcessEur,
    });
    points.push({
      date: d,
      ...mix,
      equitySectorsEur,
    });
  }

  return { points };
}
