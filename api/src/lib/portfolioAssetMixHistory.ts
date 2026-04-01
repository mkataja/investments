import { instruments, type portfolios, transactions } from "@investments/db";
import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { db } from "../db.js";
import { calendarDateUtcFromInstant } from "./calendarDateUtc.js";
import { loadLatestDistributionRowsByInstrumentIdsAsOf } from "./latestPriceDistribution.js";
import { loadPortfolioOwnedByUser } from "./portfolioAccess.js";
import {
  buildMergedSectorsForAssetMix,
  computeAssetMixEur,
} from "./portfolioAssetMix.js";
import { valuePortfolioRowsEurAsOf } from "./valuation.js";
import type { InstrumentRow } from "./valuation.js";

const STEP_DAYS = 7;

function endOfUtcDay(dateStr: string): Date {
  return new Date(`${dateStr}T23:59:59.999Z`);
}

function addDaysUtc(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function loadPositionRowsAtDate(
  portfolioId: number,
  asOfDate: string,
): Promise<Array<{ inst: InstrumentRow; qty: number }>> {
  const posRows = await db
    .select({
      instrumentId: transactions.instrumentId,
      qty: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.side} = 'buy' THEN ${transactions.quantity}::numeric ELSE -${transactions.quantity}::numeric END), 0)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.portfolioId, portfolioId),
        lte(transactions.tradeDate, endOfUtcDay(asOfDate)),
      ),
    )
    .groupBy(transactions.instrumentId);

  const instIds = posRows
    .map((r) => {
      const q = Number.parseFloat(r.qty);
      return Number.isFinite(q) && q !== 0 ? r.instrumentId : null;
    })
    .filter((id): id is number => id != null);

  if (instIds.length === 0) {
    return [];
  }

  const instRows = await db
    .select()
    .from(instruments)
    .where(inArray(instruments.id, instIds));

  const byId = new Map(instRows.map((i) => [i.id, i] as const));
  const out: Array<{ inst: InstrumentRow; qty: number }> = [];
  for (const p of posRows) {
    const q = Number.parseFloat(p.qty);
    if (!Number.isFinite(q) || q === 0) {
      continue;
    }
    const inst = byId.get(p.instrumentId);
    if (!inst) {
      continue;
    }
    out.push({ inst, qty: q });
  }
  return out;
}

type PortfolioRow = typeof portfolios.$inferSelect;

type MixPointResult =
  | { kind: "empty" }
  | { kind: "stop" }
  | { kind: "ok"; equitiesEur: number; cashEur: number };

async function assetMixPointForDate(
  portfolioId: number,
  asOfDate: string,
): Promise<MixPointResult> {
  const rows = await loadPositionRowsAtDate(portfolioId, asOfDate);
  if (rows.length === 0) {
    return { kind: "empty" };
  }
  const valuedResults = await valuePortfolioRowsEurAsOf(rows, asOfDate);
  let cashEur = 0;
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
      return { kind: "stop" };
    }
  }
  const valuedFull = rows.map((row, i) => ({
    inst: row.inst,
    valueEur: valuedResults[i]?.valueEur ?? 0,
  }));
  const nonCashIds = [
    ...new Set(
      rows.filter((r) => r.inst.kind !== "cash_account").map((r) => r.inst.id),
    ),
  ];
  const distMap = await loadLatestDistributionRowsByInstrumentIdsAsOf(
    db,
    nonCashIds,
    asOfDate,
  );
  const { mergedSectors, nonCashPrincipalEur, cashInFundsEur } =
    buildMergedSectorsForAssetMix(valuedFull, distMap);
  const mix = computeAssetMixEur({
    nonCashPrincipalEur,
    mergedSectors,
    cashInFundsEur,
    cashExcessEur: 0,
  });
  return { kind: "ok", equitiesEur: mix.equitiesEur, cashEur };
}

/**
 * POC: weekly samples from first portfolio trade, plus a trailing point for **today** (UTC calendar)
 * when the weekly grid does not land on today. **equitiesEur** matches the asset mix pie (bonds and
 * commodity sleeves excluded from principal). **cashEur** = `cash_account` instruments only. Stops when
 * any non-cash position lacks a price on or before the date. Uses distribution snapshots with
 * `snapshot_date <= asOf` (same idea as latest price as-of).
 */
export async function getPortfolioAssetMixHistory(
  portfolioId: number,
  options?: { portfolio: PortfolioRow },
): Promise<{
  points: Array<{ date: string; equitiesEur: number; cashEur: number }>;
}> {
  const pf =
    options?.portfolio ?? (await loadPortfolioOwnedByUser(portfolioId));
  if (!pf || pf.id !== portfolioId) {
    return { points: [] };
  }
  if (pf.kind === "benchmark") {
    return { points: [] };
  }

  const [firstTxn] = await db
    .select({ tradeDate: transactions.tradeDate })
    .from(transactions)
    .where(eq(transactions.portfolioId, portfolioId))
    .orderBy(asc(transactions.tradeDate))
    .limit(1);

  if (!firstTxn) {
    return { points: [] };
  }
  const startDate = calendarDateUtcFromInstant(new Date(firstTxn.tradeDate));

  const today = new Date().toISOString().slice(0, 10);
  const points: Array<{ date: string; equitiesEur: number; cashEur: number }> =
    [];

  let stoppedEarly = false;
  for (let d = startDate; d <= today; d = addDaysUtc(d, STEP_DAYS)) {
    const r = await assetMixPointForDate(portfolioId, d);
    if (r.kind === "stop") {
      stoppedEarly = true;
      break;
    }
    if (r.kind === "empty") {
      points.push({ date: d, equitiesEur: 0, cashEur: 0 });
    } else {
      points.push({
        date: d,
        equitiesEur: r.equitiesEur,
        cashEur: r.cashEur,
      });
    }
    if (d >= today) {
      break;
    }
  }

  if (
    !stoppedEarly &&
    !points.some((p) => p.date === today) &&
    startDate <= today
  ) {
    const r = await assetMixPointForDate(portfolioId, today);
    if (r.kind === "empty") {
      points.push({ date: today, equitiesEur: 0, cashEur: 0 });
    } else if (r.kind === "ok") {
      points.push({
        date: today,
        equitiesEur: r.equitiesEur,
        cashEur: r.cashEur,
      });
    }
  }

  return { points };
}
