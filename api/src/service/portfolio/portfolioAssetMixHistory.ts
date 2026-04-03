import {
  type distributions,
  instruments,
  interestRates,
  type portfolios,
  type prices,
  transactions,
  users,
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
import {
  DIAMOND_HANDS_LOAN_INTEREST_INDEX_NAME,
  closestObservationRateForDate,
} from "./diamondHandsLoanInterest.js";
import { emergencyFundTargetEurFromDb } from "./emergencyFundTargetEurFromDb.js";
import { loadPortfolioOwnedByUser } from "./portfolioAccess.js";
import {
  buildMergedSectorsForAssetMix,
  computeAssetMixEur,
  equitySectorsEurFromSnapshot,
} from "./portfolioAssetMix.js";
import {
  type AssetMixHistoryTxRow,
  applyTransactionsUpToActual,
  applyTransactionsUpToHodl,
} from "./portfolioAssetMixHistoryApply.js";
import {
  type InstrumentRow,
  buildFxEurPerUnitMapAsOf,
  valuePortfolioRowsFromPriceMap,
} from "./valuation.js";

const STEP_DAYS = 7;

/** Act/365-style daily accrual from annual rate fractions. */
const ANNUAL_RATE_TO_DAILY = 1 / 365;

export type AssetMixHistoryVariant = "actual" | "hodl";

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

type AssetMixHistoryPointRow = {
  date: string;
  equitiesEur: number;
  bondsTotalEur: number;
  commodityGoldEur: number;
  commoditySilverEur: number;
  commodityOtherEur: number;
  cashInFundsEur: number;
  cashExcessEur: number;
  /** Sum of cash-account position values in EUR (same basis as `cashExcessEur` split). */
  cashTotalEur: number;
  equitySectorsEur: Record<string, number>;
  /** Cumulative virtual leverage from security sells after cash is depleted (≤ 0); 0 when `variant` is `actual`. */
  virtualLeverageEur: number;
  /** Cumulative interest on `virtualLeverageEur` principal (≤ 0); 0 when `variant` is `actual`. */
  virtualLeverageInterestEur: number;
};

/**
 * Weekly samples from first portfolio trade, plus a trailing point for **today** (UTC calendar)
 * when the weekly grid does not land on today. Each point matches **asset mix** slices from
 * `computeAssetMixEur` (same sleeves as the asset mix pie), including emergency fund split for cash
 * in accounts, plus `equitySectorsEur` (equity sleeve only, same sector keys as the sectors bar chart).
 * Stops when any non-cash position lacks a price on or before the date. Distribution
 * snapshots: earliest `snapshot_date >= asOf` per instrument (next snapshot fills gaps); if as-of is
 * after all snapshots, the newest snapshot is used. Prices still use latest `price_date <= asOf`.
 *
 * `variant=hodl`: non-cash buys apply as usual; security sells do not reduce quantities. Proceeds
 * in EUR (FX as of trade date) first reduce cash above the portfolio emergency fund target
 * (instrument id order within that cap); any remainder reduces `virtualLeverageEur`. Cash deposits
 * (cash account buys) first increase `virtualLeverageEur` toward zero when it is negative, then
 * credit the remainder to cash. Cash sells remove at most the amount that leaves total cash EUR at
 * or above the emergency fund target (same cap as security-sell drains); any shortfall vs the
 * transaction size, or withdrawal past balance, books to `virtualLeverageEur`.
 *
 * `variant=hodl` also accrues simple daily interest on outstanding leverage (after each calendar
 * day's transactions): annual rate = closest 3-month EURIBOR fixing in `interest_rates` to that day
 * plus `users.rate_margin`, at 1/365 per day. `virtualLeverageInterestEur` is cumulative (≤ 0).
 *
 * Loads transactions once, walks dates in memory, and batches price and distribution queries.
 */
export async function getPortfolioAssetMixHistory(
  portfolioId: number,
  options?: {
    portfolio?: PortfolioRow;
    variant?: AssetMixHistoryVariant;
  },
): Promise<{ points: AssetMixHistoryPointRow[] }> {
  const variant: AssetMixHistoryVariant = options?.variant ?? "actual";
  const pf =
    options?.portfolio ?? (await loadPortfolioOwnedByUser(portfolioId));
  if (!pf || pf.id !== portfolioId) {
    return { points: [] };
  }
  if (pf.kind === "benchmark") {
    return { points: [] };
  }

  const emergencyFundTargetEur = emergencyFundTargetEurFromDb(
    pf.emergencyFundEur,
  );

  const txRows: AssetMixHistoryTxRow[] = await db
    .select({
      tradeDate: transactions.tradeDate,
      instrumentId: transactions.instrumentId,
      side: transactions.side,
      quantity: transactions.quantity,
      unitPrice: transactions.unitPrice,
      currency: transactions.currency,
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

  let rateMargin = 0;
  let euriborObservations: { date: string; rate: number }[] = [];
  if (variant === "hodl") {
    const [userRow] = await db
      .select({ rateMargin: users.rateMargin })
      .from(users)
      .where(eq(users.id, pf.userId))
      .limit(1);
    const parsedMargin = Number(userRow?.rateMargin ?? 0);
    rateMargin = Number.isFinite(parsedMargin) ? parsedMargin : 0;

    const euriborRateRows = await db
      .select({
        observationDate: interestRates.observationDate,
        rate: interestRates.rate,
      })
      .from(interestRates)
      .where(
        eq(interestRates.indexName, DIAMOND_HANDS_LOAN_INTEREST_INDEX_NAME),
      )
      .orderBy(asc(interestRates.observationDate));

    euriborObservations = euriborRateRows
      .map((r) => {
        const s = String(r.observationDate);
        const dateStr = s.length >= 10 ? s.slice(0, 10) : s;
        return { date: dateStr, rate: Number(r.rate) };
      })
      .filter((o) => Number.isFinite(o.rate));
  }

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
  const emptyPointBase = { ...emptyMix, cashTotalEur: 0 };

  const points: AssetMixHistoryPointRow[] = [];
  const qty = new Map<number, number>();
  const txState = { i: 0 };
  const virtualLeverageEur = { value: 0 };
  const fxMapByTradeDate = new Map<string, Map<string, number>>();
  let hodlCursorDay = startDate;
  let hodlInterestAccruedEur = 0;

  for (const d of candidateDates) {
    if (variant === "hodl") {
      while (hodlCursorDay <= d) {
        applyTransactionsUpToHodl(
          txRows,
          txState,
          qty,
          virtualLeverageEur,
          endOfUtcDay(hodlCursorDay),
          instrumentsById,
          fxInstRows,
          fxPricesByInstrument,
          fxMapByTradeDate,
          emergencyFundTargetEur,
        );
        const indexRate = closestObservationRateForDate(
          euriborObservations,
          hodlCursorDay,
        );
        const annualRate = indexRate + rateMargin;
        if (virtualLeverageEur.value < 0 && Number.isFinite(annualRate)) {
          hodlInterestAccruedEur +=
            -virtualLeverageEur.value * annualRate * ANNUAL_RATE_TO_DAILY;
        }
        hodlCursorDay = addDaysUtc(hodlCursorDay, 1);
      }
    } else {
      applyTransactionsUpToActual(txRows, txState, qty, endOfUtcDay(d));
    }

    const rows = positionRowsFromQty(qty, instrumentsById);
    const virtualEur = variant === "hodl" ? virtualLeverageEur.value : 0;
    const virtualInterestEur = variant === "hodl" ? -hodlInterestAccruedEur : 0;

    if (rows.length === 0) {
      points.push({
        date: d,
        ...emptyPointBase,
        equitySectorsEur: {},
        virtualLeverageEur: virtualEur,
        virtualLeverageInterestEur: virtualInterestEur,
      });
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
      cashTotalEur: cashEur,
      equitySectorsEur,
      virtualLeverageEur: virtualEur,
      virtualLeverageInterestEur: virtualInterestEur,
    });
  }

  return { points };
}
