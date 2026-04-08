import {
  instruments,
  portfolioBenchmarkWeights,
  portfolios,
  prices,
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
  ne,
  sql,
} from "drizzle-orm";
import type { Context } from "hono";
import { z } from "zod";
import { db } from "../../db.js";
import { validJson } from "../../lib/honoValidJson.js";
import {
  loadPriceRowsByInstrumentIdsUpToDate,
  pickLatestPriceRowAsOf,
} from "../instrument/latestPriceDistribution.js";
import { loadPortfolioOwnedByUser } from "./portfolioAccess.js";

type WeightInput = {
  instrumentId: number;
  weight: number;
};

type ValidationResult = {
  status: 400;
  message: string;
} | null;

async function validateBacktestWeightsAndDate(
  weights: WeightInput[],
  simulationStartDate: string,
): Promise<ValidationResult> {
  if (weights.length === 0) {
    return {
      status: 400,
      message: "Backtest portfolio requires at least one weight",
    };
  }
  const seen = new Set<number>();
  for (const w of weights) {
    if (seen.has(w.instrumentId)) {
      return { status: 400, message: "Duplicate instrumentId in weights" };
    }
    seen.add(w.instrumentId);
  }
  const instIds = [...seen];
  const weightedInstRows = await db
    .select({
      id: instruments.id,
      displayName: instruments.displayName,
      kind: instruments.kind,
      yahooSymbol: instruments.yahooSymbol,
      isin: instruments.isin,
    })
    .from(instruments)
    .where(inArray(instruments.id, instIds));
  if (weightedInstRows.length !== instIds.length) {
    return { status: 400, message: "One or more instruments not found" };
  }
  if (weightedInstRows.some((r) => r.kind === "fx")) {
    return {
      status: 400,
      message: "Backtest does not support FX instruments in weights.",
    };
  }
  const pricedRows = weightedInstRows.filter((r) => r.kind !== "cash_account");
  if (pricedRows.length === 0) {
    return null;
  }
  const pricesByInstrument = await loadPriceRowsByInstrumentIdsUpToDate(
    db,
    pricedRows.map((r) => r.id),
    simulationStartDate,
  );
  const missingNames = pricedRows.filter(
    (r) =>
      pickLatestPriceRowAsOf(
        pricesByInstrument.get(r.id) ?? [],
        simulationStartDate,
      ) == null,
  );
  if (missingNames.length > 0) {
    const missingIds = missingNames.map((r) => r.id);
    const oldestRows = await db
      .select({
        instrumentId: prices.instrumentId,
        oldestPriceDate: sql<string>`min(${prices.priceDate})`,
      })
      .from(prices)
      .where(inArray(prices.instrumentId, missingIds))
      .groupBy(prices.instrumentId);
    const oldestByInstrumentId = new Map(
      oldestRows.map((r) => [r.instrumentId, String(r.oldestPriceDate)]),
    );
    const details = missingNames.map((r) => {
      const ticker = r.yahooSymbol ?? r.isin ?? "-";
      const oldestPriceDate = oldestByInstrumentId.get(r.id) ?? "none";
      return `${r.displayName}, ticker: ${ticker}, oldest known price: ${oldestPriceDate}`;
    });
    return {
      status: 400,
      message: `Missing price history on ${simulationStartDate}: ${details.join("; ")}`,
    };
  }
  return null;
}

async function loadPortfolioWeightInputs(portfolioId: number) {
  const rows = await db
    .select({
      instrumentId: portfolioBenchmarkWeights.instrumentId,
      weight: portfolioBenchmarkWeights.weight,
    })
    .from(portfolioBenchmarkWeights)
    .where(eq(portfolioBenchmarkWeights.portfolioId, portfolioId));
  return rows.map((r) => ({
    instrumentId: r.instrumentId,
    weight: Number.parseFloat(String(r.weight)),
  }));
}

function mapPortfolioRow(row: InferSelectModel<typeof portfolios>) {
  return {
    ...row,
    emergencyFundEur: Number(row.emergencyFundEur),
    benchmarkTotalEur: Number(row.benchmarkTotalEur),
    simulationStartDate:
      row.simulationStartDate != null
        ? String(row.simulationStartDate).slice(0, 10)
        : null,
  };
}

export const portfolioCreateIn = z.object({
  name: z.string().trim().min(1),
  emergencyFundEur: z.number().finite().nonnegative().optional(),
  kind: z.enum(["live", "static", "backtest"]).optional(),
  benchmarkTotalEur: z.number().finite().positive().optional(),
  simulationStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const portfolioPatchIn = z
  .object({
    name: z.string().trim().min(1).optional(),
    emergencyFundEur: z.number().finite().nonnegative().optional(),
    kind: z.enum(["live", "static", "backtest"]).optional(),
    benchmarkTotalEur: z.number().finite().positive().optional(),
    simulationStartDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
  })
  .refine(
    (o) =>
      o.name != null ||
      o.emergencyFundEur != null ||
      o.kind != null ||
      o.benchmarkTotalEur != null ||
      o.simulationStartDate !== undefined,
    { message: "At least one field is required" },
  );

export const portfolioBacktestCreateIn = z.object({
  name: z.string().trim().min(1),
  emergencyFundEur: z.number().finite().nonnegative().optional(),
  benchmarkTotalEur: z.number().finite().positive(),
  simulationStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weights: z.array(
    z.object({
      instrumentId: z.number().int().positive(),
      weight: z.number().finite().positive(),
    }),
  ),
});

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
  const kind = body.kind ?? "live";
  const [dup] = await db
    .select({ id: portfolios.id })
    .from(portfolios)
    .where(
      and(
        eq(portfolios.userId, USER_ID),
        eq(portfolios.name, name),
        eq(portfolios.kind, kind),
      ),
    )
    .limit(1);
  if (dup) {
    return c.json(
      { message: "A portfolio with this name already exists" },
      409,
    );
  }
  if (kind === "backtest" && body.simulationStartDate == null) {
    return c.json(
      { message: "Backtest portfolio requires simulationStartDate" },
      400,
    );
  }
  const [row] = await db
    .insert(portfolios)
    .values({
      userId: USER_ID,
      name,
      kind,
      emergencyFundEur: String(body.emergencyFundEur ?? 0),
      benchmarkTotalEur: String(body.benchmarkTotalEur ?? 10_000),
      simulationStartDate:
        kind === "backtest" ? body.simulationStartDate : null,
    })
    .returning();
  if (!row) {
    return c.json({ message: "Failed to create portfolio" }, 500);
  }
  return c.json(mapPortfolioRow(row), 201);
}

export async function createBacktestPortfolio(c: Context) {
  const body = validJson(c, portfolioBacktestCreateIn);
  const name = body.name.trim();
  const [dup] = await db
    .select({ id: portfolios.id })
    .from(portfolios)
    .where(
      and(
        eq(portfolios.userId, USER_ID),
        eq(portfolios.name, name),
        eq(portfolios.kind, "backtest"),
      ),
    )
    .limit(1);
  if (dup) {
    return c.json(
      { message: "A portfolio with this name already exists" },
      409,
    );
  }
  const validation = await validateBacktestWeightsAndDate(
    body.weights,
    body.simulationStartDate,
  );
  if (validation) {
    return c.json({ message: validation.message }, validation.status);
  }
  let created: InferSelectModel<typeof portfolios> | null = null;
  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(portfolios)
      .values({
        userId: USER_ID,
        name,
        kind: "backtest",
        emergencyFundEur: String(body.emergencyFundEur ?? 0),
        benchmarkTotalEur: String(body.benchmarkTotalEur),
        simulationStartDate: body.simulationStartDate,
      })
      .returning();
    if (!row) {
      throw new Error("Failed to create portfolio");
    }
    created = row;
    if (body.weights.length > 0) {
      await tx.insert(portfolioBenchmarkWeights).values(
        body.weights.map((w, i) => ({
          portfolioId: row.id,
          instrumentId: w.instrumentId,
          weight: String(w.weight),
          sortOrder: i,
        })),
      );
    }
  });
  if (!created) {
    return c.json({ message: "Failed to create portfolio" }, 500);
  }
  return c.json(mapPortfolioRow(created), 201);
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
  const nextKind = body.kind ?? existing.kind;
  const [nameKindDup] = await db
    .select({ id: portfolios.id })
    .from(portfolios)
    .where(
      and(
        eq(portfolios.userId, USER_ID),
        eq(portfolios.name, nextName),
        eq(portfolios.kind, nextKind),
        ne(portfolios.id, id),
      ),
    )
    .limit(1);
  if (nameKindDup) {
    return c.json(
      { message: "A portfolio with this name already exists" },
      409,
    );
  }
  if (body.kind != null && body.kind !== existing.kind) {
    if (
      (existing.kind === "backtest" && body.kind === "static") ||
      (existing.kind === "static" && body.kind === "backtest")
    ) {
      return c.json(
        { message: "Cannot convert between static and backtest portfolios" },
        400,
      );
    }
    if (
      (body.kind === "static" || body.kind === "backtest") &&
      existing.kind === "live"
    ) {
      const [cntRow] = await db
        .select({ n: count() })
        .from(transactions)
        .where(eq(transactions.portfolioId, id));
      if (Number(cntRow?.n ?? 0) > 0) {
        return c.json(
          {
            message:
              "Cannot convert a portfolio with transactions to static/backtest",
          },
          400,
        );
      }
    }
    if (
      body.kind === "live" &&
      (existing.kind === "static" || existing.kind === "backtest")
    ) {
      await db
        .delete(portfolioBenchmarkWeights)
        .where(eq(portfolioBenchmarkWeights.portfolioId, id));
    }
  }
  const nextSimulationStartDate =
    body.simulationStartDate !== undefined
      ? body.simulationStartDate
      : nextKind === "backtest"
        ? existing.simulationStartDate
        : null;
  if (nextKind === "backtest") {
    if (nextSimulationStartDate == null) {
      return c.json(
        { message: "Backtest portfolio requires simulationStartDate" },
        400,
      );
    }
    if (body.simulationStartDate !== undefined || body.kind === "backtest") {
      const existingWeights = await loadPortfolioWeightInputs(id);
      const validation = await validateBacktestWeightsAndDate(
        existingWeights,
        nextSimulationStartDate,
      );
      if (validation) {
        return c.json({ message: validation.message }, validation.status);
      }
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
      simulationStartDate: nextSimulationStartDate,
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
  if (pf.kind !== "static" && pf.kind !== "backtest") {
    return c.json({ message: "Portfolio is not static/backtest" }, 400);
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
  if (pf.kind !== "static" && pf.kind !== "backtest") {
    return c.json({ message: "Portfolio is not static/backtest" }, 400);
  }
  const body = validJson(c, benchmarkWeightsPutIn);
  if (pf.kind === "backtest") {
    if (pf.simulationStartDate == null) {
      return c.json(
        { message: "Backtest portfolio requires simulationStartDate" },
        400,
      );
    }
    const validation = await validateBacktestWeightsAndDate(
      body.weights,
      String(pf.simulationStartDate).slice(0, 10),
    );
    if (validation) {
      return c.json({ message: validation.message }, validation.status);
    }
  } else {
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

export async function deletePortfolio(c: Context) {
  const id = Number.parseInt(c.req.param("id") ?? "", 10);
  if (!Number.isFinite(id) || id < 1) {
    return c.json({ message: "Invalid id" }, 400);
  }
  const [deleted] = await db
    .delete(portfolios)
    .where(and(eq(portfolios.id, id), eq(portfolios.userId, USER_ID)))
    .returning({ id: portfolios.id });
  if (!deleted) {
    return c.json({ message: "Not found" }, 404);
  }
  return c.body(null, 204);
}
