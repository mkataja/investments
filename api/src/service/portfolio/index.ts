import {
  instruments,
  portfolioBenchmarkWeights,
  portfolios,
  transactions,
} from "@investments/db";
import { USER_ID } from "@investments/lib/appUser";
import {
  type InferSelectModel,
  and,
  asc,
  count,
  eq,
  inArray,
} from "drizzle-orm";
import type { Context } from "hono";
import { z } from "zod";
import { db } from "../../db.js";
import { validJson } from "../../lib/honoValidJson.js";
import { loadPortfolioOwnedByUser } from "./portfolioAccess.js";

function mapPortfolioRow(row: InferSelectModel<typeof portfolios>) {
  return {
    ...row,
    emergencyFundEur: Number(row.emergencyFundEur),
    benchmarkTotalEur: Number(row.benchmarkTotalEur),
  };
}

export const portfolioCreateIn = z.object({
  name: z.string().trim().min(1),
  emergencyFundEur: z.number().finite().nonnegative().optional(),
  kind: z.enum(["live", "benchmark"]).optional(),
  benchmarkTotalEur: z.number().finite().positive().optional(),
});

export const portfolioPatchIn = z
  .object({
    name: z.string().trim().min(1).optional(),
    emergencyFundEur: z.number().finite().nonnegative().optional(),
    kind: z.enum(["live", "benchmark"]).optional(),
    benchmarkTotalEur: z.number().finite().positive().optional(),
  })
  .refine(
    (o) =>
      o.name != null ||
      o.emergencyFundEur != null ||
      o.kind != null ||
      o.benchmarkTotalEur != null,
    { message: "At least one field is required" },
  );

export const benchmarkWeightsPutIn = z.object({
  weights: z.array(
    z.object({
      instrumentId: z.number().int().positive(),
      weight: z.number().finite().positive(),
    }),
  ),
});

export async function listPortfolios(c: Context) {
  const rows = await db
    .select()
    .from(portfolios)
    .where(eq(portfolios.userId, USER_ID))
    .orderBy(asc(portfolios.id));
  return c.json(rows.map(mapPortfolioRow));
}

export async function createPortfolio(c: Context) {
  const body = validJson(c, portfolioCreateIn);
  const name = body.name.trim();
  const [dup] = await db
    .select({ id: portfolios.id })
    .from(portfolios)
    .where(and(eq(portfolios.userId, USER_ID), eq(portfolios.name, name)))
    .limit(1);
  if (dup) {
    return c.json(
      { message: "A portfolio with this name already exists" },
      409,
    );
  }
  const kind = body.kind ?? "live";
  const [row] = await db
    .insert(portfolios)
    .values({
      userId: USER_ID,
      name,
      kind,
      emergencyFundEur: String(body.emergencyFundEur ?? 0),
      benchmarkTotalEur: String(body.benchmarkTotalEur ?? 10_000),
    })
    .returning();
  if (!row) {
    return c.json({ message: "Failed to create portfolio" }, 500);
  }
  return c.json(mapPortfolioRow(row), 201);
}

export async function patchPortfolio(c: Context) {
  const id = Number.parseInt(c.req.param("id") ?? "", 10);
  if (!Number.isFinite(id) || id < 1) {
    return c.json({ message: "Invalid id" }, 400);
  }
  const body = validJson(c, portfolioPatchIn);
  const [existing] = await db
    .select()
    .from(portfolios)
    .where(and(eq(portfolios.id, id), eq(portfolios.userId, USER_ID)))
    .limit(1);
  if (!existing) {
    return c.json({ message: "Not found" }, 404);
  }
  const nextName = body.name?.trim() ?? existing.name;
  if (nextName !== existing.name) {
    const [nameDup] = await db
      .select({ id: portfolios.id })
      .from(portfolios)
      .where(and(eq(portfolios.userId, USER_ID), eq(portfolios.name, nextName)))
      .limit(1);
    if (nameDup && nameDup.id !== id) {
      return c.json(
        { message: "A portfolio with this name already exists" },
        409,
      );
    }
  }
  if (body.kind != null && body.kind !== existing.kind) {
    if (body.kind === "benchmark" && existing.kind === "live") {
      const [cntRow] = await db
        .select({ n: count() })
        .from(transactions)
        .where(eq(transactions.portfolioId, id));
      if (Number(cntRow?.n ?? 0) > 0) {
        return c.json(
          {
            message:
              "Cannot convert a portfolio with transactions to a benchmark",
          },
          400,
        );
      }
    }
    if (body.kind === "live" && existing.kind === "benchmark") {
      await db
        .delete(portfolioBenchmarkWeights)
        .where(eq(portfolioBenchmarkWeights.portfolioId, id));
    }
  }
  const [row] = await db
    .update(portfolios)
    .set({
      name: nextName,
      ...(body.emergencyFundEur != null
        ? { emergencyFundEur: String(body.emergencyFundEur) }
        : {}),
      ...(body.kind != null ? { kind: body.kind } : {}),
      ...(body.benchmarkTotalEur != null
        ? { benchmarkTotalEur: String(body.benchmarkTotalEur) }
        : {}),
    })
    .where(eq(portfolios.id, id))
    .returning();
  if (!row) {
    return c.json({ message: "Not found" }, 404);
  }
  return c.json(mapPortfolioRow(row));
}

export async function getBenchmarkWeights(c: Context) {
  const id = Number.parseInt(c.req.param("id") ?? "", 10);
  if (!Number.isFinite(id) || id < 1) {
    return c.json({ message: "Invalid id" }, 400);
  }
  const pf = await loadPortfolioOwnedByUser(id);
  if (!pf) {
    return c.json({ message: "Not found" }, 404);
  }
  if (pf.kind !== "benchmark") {
    return c.json({ message: "Portfolio is not a benchmark" }, 400);
  }
  const rows = await db
    .select()
    .from(portfolioBenchmarkWeights)
    .where(eq(portfolioBenchmarkWeights.portfolioId, id))
    .orderBy(asc(portfolioBenchmarkWeights.sortOrder));
  return c.json({
    weights: rows.map((r) => ({
      instrumentId: r.instrumentId,
      weight: Number.parseFloat(String(r.weight)),
      sortOrder: r.sortOrder,
    })),
  });
}

export async function putBenchmarkWeights(c: Context) {
  const id = Number.parseInt(c.req.param("id") ?? "", 10);
  if (!Number.isFinite(id) || id < 1) {
    return c.json({ message: "Invalid id" }, 400);
  }
  const pf = await loadPortfolioOwnedByUser(id);
  if (!pf) {
    return c.json({ message: "Not found" }, 404);
  }
  if (pf.kind !== "benchmark") {
    return c.json({ message: "Portfolio is not a benchmark" }, 400);
  }
  const body = validJson(c, benchmarkWeightsPutIn);
  const seen = new Set<number>();
  for (const w of body.weights) {
    if (seen.has(w.instrumentId)) {
      return c.json({ message: "Duplicate instrumentId in weights" }, 400);
    }
    seen.add(w.instrumentId);
  }
  const instIds = [...seen];
  if (instIds.length > 0) {
    const instRows = await db
      .select({ id: instruments.id })
      .from(instruments)
      .where(inArray(instruments.id, instIds));
    if (instRows.length !== instIds.length) {
      return c.json({ message: "One or more instruments not found" }, 400);
    }
  }
  await db.transaction(async (tx) => {
    await tx
      .delete(portfolioBenchmarkWeights)
      .where(eq(portfolioBenchmarkWeights.portfolioId, id));
    if (body.weights.length > 0) {
      await tx.insert(portfolioBenchmarkWeights).values(
        body.weights.map((w, i) => ({
          portfolioId: id,
          instrumentId: w.instrumentId,
          weight: String(w.weight),
          sortOrder: i,
        })),
      );
    }
  });
  return c.body(null, 204);
}
