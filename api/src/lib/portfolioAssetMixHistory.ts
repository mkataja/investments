import { instruments, transactions } from "@investments/db";
import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { db } from "../db.js";
import { calendarDateUtcFromInstant } from "./calendarDateUtc.js";
import { loadPortfolioOwnedByUser } from "./portfolioAccess.js";
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

/**
 * POC: weekly points from first portfolio trade through today; **equities** = all non–cash-account
 * holdings; **cash** = `cash_account` instruments. Stops when any non-cash position lacks a price on or before the date.
 */
export async function getPortfolioAssetMixHistory(
  portfolioId: number,
): Promise<{
  points: Array<{ date: string; equitiesPct: number; cashPct: number }>;
}> {
  const pf = await loadPortfolioOwnedByUser(portfolioId);
  if (!pf) {
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
  const points: Array<{ date: string; equitiesPct: number; cashPct: number }> =
    [];

  for (let d = startDate; d <= today; d = addDaysUtc(d, STEP_DAYS)) {
    const rows = await loadPositionRowsAtDate(portfolioId, d);
    if (rows.length === 0) {
      points.push({ date: d, equitiesPct: 0, cashPct: 0 });
      if (d >= today) {
        break;
      }
      continue;
    }

    const valued = await valuePortfolioRowsEurAsOf(rows, d);
    let cashEur = 0;
    let equitiesEur = 0;
    let stop = false;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const v = valued[i];
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
      equitiesEur += v.valueEur;
    }
    if (stop) {
      break;
    }
    const total = cashEur + equitiesEur;
    if (total <= 0) {
      points.push({ date: d, equitiesPct: 0, cashPct: 0 });
    } else {
      points.push({
        date: d,
        equitiesPct: equitiesEur / total,
        cashPct: cashEur / total,
      });
    }
    if (d >= today) {
      break;
    }
  }

  return { points };
}
