import { USER_ID, portfolios } from "@investments/db";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db.js";

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

export async function defaultPortfolioIdForUser(): Promise<number | null> {
  const [row] = await db
    .select({ id: portfolios.id })
    .from(portfolios)
    .where(eq(portfolios.userId, USER_ID))
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
    const id = await defaultPortfolioIdForUser();
    if (id == null) {
      return {
        ok: false,
        message: "No portfolio exists for user",
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
  return { ok: true, portfolioId: n };
}
