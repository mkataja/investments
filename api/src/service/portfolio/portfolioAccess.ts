import { portfolios } from "@investments/db";
import { USER_ID } from "@investments/lib/appUser";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../../db.js";

export async function loadPortfolioOwnedByUser(
  portfolioId: number,
): Promise<typeof portfolios.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(portfolios)
    .where(and(eq(portfolios.id, portfolioId), eq(portfolios.userId, USER_ID)))
    .limit(1);
  return row ?? null;
}

/** Lowest-id **live** portfolio (imports and transactions require a live portfolio). */
async function defaultLivePortfolioIdForUser(): Promise<number | null> {
  const [row] = await db
    .select({ id: portfolios.id })
    .from(portfolios)
    .where(and(eq(portfolios.userId, USER_ID), eq(portfolios.kind, "live")))
    .orderBy(asc(portfolios.id))
    .limit(1);
  return row?.id ?? null;
}

export async function resolvePortfolioIdFromImportBody(
  body: Record<string, unknown>,
): Promise<
  | { ok: true; portfolioId: number }
  | { ok: false; message: string; status: number }
> {
  const raw = body.portfolioId;
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    const id = await defaultLivePortfolioIdForUser();
    if (id == null) {
      return {
        ok: false,
        message: "No live portfolio exists for user",
        status: 500,
      };
    }
    return { ok: true, portfolioId: id };
  }
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 1) {
    return { ok: false, message: "Invalid portfolioId", status: 400 };
  }
  const row = await loadPortfolioOwnedByUser(n);
  if (!row) {
    return { ok: false, message: "Portfolio not found", status: 404 };
  }
  if (row.kind === "static" || row.kind === "backtest") {
    return {
      ok: false,
      message: "Cannot import into a static/backtest portfolio",
      status: 400,
    };
  }
  return { ok: true, portfolioId: n };
}
