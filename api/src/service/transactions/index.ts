import {
  brokers,
  instruments,
  portfolios,
  transactions,
} from "@investments/db";
import { USER_ID } from "@investments/lib/appUser";
import { isInstrumentKindAllowedForBrokerType } from "@investments/lib/brokerInstrumentRules";
import type { BrokerType } from "@investments/lib/brokerTypes";
import { and, desc, eq } from "drizzle-orm";
import type { Context } from "hono";
import { z } from "zod";
import { db } from "../../db.js";
import { validJson } from "../../lib/honoValidJson.js";
import { normalizeTradeDateInputToDate } from "../../lib/normalizeTradeDate.js";
import { seedIntradayPriceForInstrumentIfMissing } from "../instrument/transactionPriceSeed.js";
import { loadBacktestVirtualTransactions } from "../portfolio/backtestPortfolio.js";
import { loadPortfolioOwnedByUser } from "../portfolio/portfolioAccess.js";

export const transactionIn = z.object({
  portfolioId: z.number().int().positive(),
  brokerId: z.number().int().positive(),
  tradeDate: z
    .string()
    .refine(
      (s) => {
        try {
          normalizeTradeDateInputToDate(s);
          return true;
        } catch {
          return false;
        }
      },
      { message: "Invalid tradeDate" },
    )
    .transform((s) => normalizeTradeDateInputToDate(s)),
  side: z.enum(["buy", "sell"]),
  instrumentId: z.number().int().positive(),
  quantity: z.string().or(z.number()),
  unitPrice: z.string().or(z.number()),
  currency: z.string().min(3).max(3),
});

export async function getTransactions(c: Context) {
  const raw = c.req.query("portfolioId")?.trim();
  if (!raw) {
    return c.json({ message: "portfolioId query required" }, 400);
  }
  const portfolioId = Number.parseInt(raw, 10);
  if (!Number.isFinite(portfolioId) || portfolioId < 1) {
    return c.json({ message: "Invalid portfolioId" }, 400);
  }
  const pf = await loadPortfolioOwnedByUser(portfolioId);
  if (!pf) {
    return c.json({ message: "Portfolio not found" }, 404);
  }
  if (pf.kind === "backtest") {
    const virtualRows = await loadBacktestVirtualTransactions(portfolioId);
    virtualRows.sort(
      (a, b) =>
        new Date(b.tradeDate).getTime() - new Date(a.tradeDate).getTime() ||
        b.id - a.id,
    );
    return c.json(virtualRows);
  }
  if (pf.kind === "static") {
    return c.json([]);
  }
  const rows = await db
    .select()
    .from(transactions)
    .where(eq(transactions.portfolioId, portfolioId))
    .orderBy(desc(transactions.tradeDate));
  return c.json(rows);
}

export async function postTransaction(c: Context) {
  const body = validJson(c, transactionIn);
  const [brk] = await db
    .select()
    .from(brokers)
    .where(eq(brokers.id, body.brokerId));
  if (!brk) {
    return c.json({ message: "Broker not found" }, 404);
  }
  const [inst] = await db
    .select()
    .from(instruments)
    .where(eq(instruments.id, body.instrumentId));
  if (!inst) {
    return c.json({ message: "Instrument not found" }, 404);
  }
  if (
    !isInstrumentKindAllowedForBrokerType(
      brk.brokerType as BrokerType,
      inst.kind,
    )
  ) {
    return c.json(
      { message: "This instrument is not allowed for this broker" },
      400,
    );
  }
  if (inst.kind === "custom" || inst.kind === "cash_account") {
    if (inst.brokerId !== body.brokerId) {
      return c.json(
        { message: "Instrument is not linked to this broker" },
        400,
      );
    }
  }
  const [pf] = await db
    .select()
    .from(portfolios)
    .where(
      and(eq(portfolios.id, body.portfolioId), eq(portfolios.userId, USER_ID)),
    )
    .limit(1);
  if (!pf) {
    return c.json({ message: "Portfolio not found" }, 404);
  }
  if (pf.kind === "static" || pf.kind === "backtest") {
    return c.json(
      { message: "Cannot add transactions to a static/backtest portfolio" },
      400,
    );
  }
  if (pf.userId !== brk.userId) {
    return c.json(
      { message: "Portfolio and broker must belong to the same user" },
      400,
    );
  }
  const [row] = await db
    .insert(transactions)
    .values({
      userId: brk.userId,
      portfolioId: body.portfolioId,
      brokerId: body.brokerId,
      tradeDate: body.tradeDate,
      side: body.side,
      instrumentId: body.instrumentId,
      quantity: String(body.quantity),
      unitPrice: String(body.unitPrice),
      currency: body.currency.toUpperCase(),
    })
    .returning();
  if (row) {
    await seedIntradayPriceForInstrumentIfMissing(db, row.instrumentId, {
      instrumentId: row.instrumentId,
      tradeDate: row.tradeDate,
      unitPrice: row.unitPrice,
      currency: row.currency,
    });
  }
  return c.json(row, 201);
}

export async function patchTransaction(c: Context) {
  const rawId = c.req.param("id");
  const id = Number.parseInt(rawId ?? "", 10);
  if (!Number.isFinite(id) || id < 1) {
    return c.json({ message: "Invalid transaction id" }, 400);
  }
  const [existing] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, USER_ID)))
    .limit(1);
  if (!existing) {
    return c.json({ message: "Transaction not found" }, 404);
  }
  const body = validJson(c, transactionIn);
  const [brk] = await db
    .select()
    .from(brokers)
    .where(eq(brokers.id, body.brokerId));
  if (!brk) {
    return c.json({ message: "Broker not found" }, 404);
  }
  const [inst] = await db
    .select()
    .from(instruments)
    .where(eq(instruments.id, body.instrumentId));
  if (!inst) {
    return c.json({ message: "Instrument not found" }, 404);
  }
  if (
    !isInstrumentKindAllowedForBrokerType(
      brk.brokerType as BrokerType,
      inst.kind,
    )
  ) {
    return c.json(
      { message: "This instrument is not allowed for this broker" },
      400,
    );
  }
  if (inst.kind === "custom" || inst.kind === "cash_account") {
    if (inst.brokerId !== body.brokerId) {
      return c.json(
        { message: "Instrument is not linked to this broker" },
        400,
      );
    }
  }
  const [pf] = await db
    .select()
    .from(portfolios)
    .where(
      and(eq(portfolios.id, body.portfolioId), eq(portfolios.userId, USER_ID)),
    )
    .limit(1);
  if (!pf) {
    return c.json({ message: "Portfolio not found" }, 404);
  }
  if (pf.kind === "static" || pf.kind === "backtest") {
    return c.json(
      { message: "Cannot add transactions to a static/backtest portfolio" },
      400,
    );
  }
  if (pf.userId !== brk.userId) {
    return c.json(
      { message: "Portfolio and broker must belong to the same user" },
      400,
    );
  }
  const [row] = await db
    .update(transactions)
    .set({
      portfolioId: body.portfolioId,
      brokerId: body.brokerId,
      tradeDate: body.tradeDate,
      side: body.side,
      instrumentId: body.instrumentId,
      quantity: String(body.quantity),
      unitPrice: String(body.unitPrice),
      currency: body.currency.toUpperCase(),
    })
    .where(eq(transactions.id, id))
    .returning();
  if (row) {
    await seedIntradayPriceForInstrumentIfMissing(db, row.instrumentId, {
      instrumentId: row.instrumentId,
      tradeDate: row.tradeDate,
      unitPrice: row.unitPrice,
      currency: row.currency,
    });
  }
  return c.json(row);
}

export async function deleteTransaction(c: Context) {
  const rawId = c.req.param("id");
  const id = Number.parseInt(rawId ?? "", 10);
  if (!Number.isFinite(id) || id < 1) {
    return c.json({ message: "Invalid transaction id" }, 400);
  }
  const deleted = await db
    .delete(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, USER_ID)))
    .returning({ id: transactions.id });
  if (deleted.length === 0) {
    return c.json({ message: "Transaction not found" }, 404);
  }
  return c.body(null, 204);
}
