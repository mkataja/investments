import { serve } from "@hono/node-server";
import { zValidator } from "@hono/zod-validator";
import {
  brokers,
  type distributions,
  instrumentCompositeConstituents,
  instruments,
  portfolioBenchmarkWeights,
  portfolios,
  providerHoldingsCache,
  seligsonDistributionCache,
  seligsonFunds,
  transactions,
  yahooFinanceCache,
} from "@investments/db";
import {
  type BrokerType,
  COMPOSITE_PSEUDO_KEYS,
  SUPPORTED_CASH_CURRENCY_CODES,
  USER_ID,
  isInstrumentKindAllowedForBrokerType,
  normalizeCashAccountIsoCountryCode,
  normalizeYahooSymbolForStorage,
  validateHoldingsDistributionUrl,
  validateProviderBreakdownDataUrl,
} from "@investments/lib";
import {
  type InferSelectModel,
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  lt,
  min,
  ne,
  notInArray,
  sql,
} from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { db } from "./db.js";
import { fetchSeligsonFundName } from "./distributions/seligson.js";
import { upsertSeligsonFundValuesFromPage } from "./distributions/seligsonFundValues.js";
import {
  fetchSeligsonPublicPageHtml,
  parseSeligsonPharosAllocationTable,
  parseSeligsonPublicPageFundName,
} from "./distributions/seligsonPharosAllocationTable.js";
import {
  buildYahooInstrumentLookup,
  displayNameFromYahooLookup,
  fetchYahooQuoteSummaryRaw,
} from "./distributions/yahoo.js";
import { buildDegiroInstrumentProposals } from "./import/degiroInstrumentProposals.js";
import { resolveDegiroInstrumentIds } from "./import/degiroResolveInstruments.js";
import {
  DEGIRO_CSV_EXTERNAL_SOURCE,
  parseDegiroTransactionsCsv,
} from "./import/degiroTransactions.js";
import { resolveIbkrInstrumentRows } from "./import/ibkrResolveInstruments.js";
import {
  IBKR_CSV_EXTERNAL_SOURCE,
  parseIbkrTransactionsCsv,
} from "./import/ibkrTransactions.js";
import {
  SELIGSON_TSV_EXTERNAL_SOURCE,
  normalizeSeligsonFundNameForMatch,
  parseSeligsonTransactionsTsv,
} from "./import/seligsonTransactions.js";
import {
  refreshDistributionCacheForInstrumentId,
  refreshStaleDistributionCaches,
  writeCompositeDistributionCache,
  writeSeligsonDistributionCache,
} from "./lib/cacheRefresh.js";
import {
  type InstrumentMatchCandidate,
  suggestBestInstrumentId,
  suggestPseudoKeyForLabel,
} from "./lib/compositeInstrumentMatch.js";
import {
  insertCommodityFromYahoo,
  insertEtfStockFromYahoo,
} from "./lib/createYahooInstrument.js";
import { processFxBackfillQueue } from "./lib/fxEurPriceBackfill.js";
import { loadLatestDistributionRowsByInstrumentIds } from "./lib/latestPriceDistribution.js";
import { normalizeTradeDateInputToDate } from "./lib/normalizeTradeDate.js";
import { getPortfolioDistributions } from "./lib/portfolio.js";
import {
  loadPortfolioOwnedByUser,
  resolvePortfolioIdFromImportBody,
} from "./lib/portfolioAccess.js";
import { getPortfolioAssetMixHistory } from "./lib/portfolioAssetMixHistory.js";
import { loadOpenPositionsForPortfolio } from "./lib/positions.js";
import { seedIntradayPriceForInstrumentIfMissing } from "./lib/transactionPriceSeed.js";
import { formatYahooUpstreamError } from "./lib/yahooUpstream.js";
import { runDevMigrations } from "./runDevMigrations.js";

const app = new Hono();

const createDegiroInstrumentsSchema = z.array(
  z.object({
    isin: z.string().length(12),
    yahooSymbol: z.string().min(1).transform(normalizeYahooSymbolForStorage),
    kind: z.enum(["etf", "stock"]),
  }),
);

app.use(
  "/*",
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
  }),
);

app.get("/health", (c) => c.json({ ok: true }));

function mapPortfolioRow(row: InferSelectModel<typeof portfolios>) {
  return {
    ...row,
    emergencyFundEur: Number(row.emergencyFundEur),
    benchmarkTotalEur: Number(row.benchmarkTotalEur),
  };
}

const portfolioCreateIn = z.object({
  name: z.string().trim().min(1),
  emergencyFundEur: z.number().finite().nonnegative().optional(),
  kind: z.enum(["live", "benchmark"]).optional(),
  benchmarkTotalEur: z.number().finite().positive().optional(),
});

const portfolioPatchIn = z
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

const benchmarkWeightsPutIn = z.object({
  weights: z.array(
    z.object({
      instrumentId: z.number().int().positive(),
      weight: z.number().finite().positive(),
    }),
  ),
});

app.get("/portfolios", async (c) => {
  const rows = await db
    .select()
    .from(portfolios)
    .where(eq(portfolios.userId, USER_ID))
    .orderBy(asc(portfolios.id));
  return c.json(rows.map(mapPortfolioRow));
});

app.post("/portfolios", zValidator("json", portfolioCreateIn), async (c) => {
  const body = c.req.valid("json");
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
});

app.patch(
  "/portfolios/:id",
  zValidator("json", portfolioPatchIn),
  async (c) => {
    const id = Number.parseInt(c.req.param("id"), 10);
    if (!Number.isFinite(id) || id < 1) {
      return c.json({ message: "Invalid id" }, 400);
    }
    const body = c.req.valid("json");
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
        .where(
          and(eq(portfolios.userId, USER_ID), eq(portfolios.name, nextName)),
        )
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
  },
);

app.get("/portfolios/:id/benchmark-weights", async (c) => {
  const id = Number.parseInt(c.req.param("id"), 10);
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
});

app.put(
  "/portfolios/:id/benchmark-weights",
  zValidator("json", benchmarkWeightsPutIn),
  async (c) => {
    const id = Number.parseInt(c.req.param("id"), 10);
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
    const body = c.req.valid("json");
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
  },
);

app.get("/brokers", async (c) => {
  const rows = await db.select().from(brokers).orderBy(asc(brokers.id));
  return c.json(rows);
});

const brokerCreateIn = z.object({
  name: z.string().trim().min(1),
  brokerType: z.enum(["exchange", "seligson", "cash_account"]),
});

const brokerPatchIn = z
  .object({
    name: z.string().trim().min(1).optional(),
    brokerType: z.enum(["exchange", "seligson", "cash_account"]).optional(),
  })
  .refine((o) => o.name != null || o.brokerType != null, {
    message: "At least one field is required",
  });

app.post("/brokers", zValidator("json", brokerCreateIn), async (c) => {
  const body = c.req.valid("json");
  const name = body.name.trim();
  const [dup] = await db
    .select({ id: brokers.id })
    .from(brokers)
    .where(and(eq(brokers.userId, USER_ID), eq(brokers.name, name)))
    .limit(1);
  if (dup) {
    return c.json({ message: "A broker with this name already exists" }, 409);
  }
  const [row] = await db
    .insert(brokers)
    .values({
      userId: USER_ID,
      name,
      brokerType: body.brokerType,
    })
    .returning();
  if (!row) {
    return c.json({ message: "Failed to create broker" }, 500);
  }
  return c.json(row, 201);
});

app.patch("/brokers/:id", zValidator("json", brokerPatchIn), async (c) => {
  const id = Number.parseInt(c.req.param("id"), 10);
  if (!Number.isFinite(id) || id < 1) {
    return c.json({ message: "Invalid id" }, 400);
  }
  const body = c.req.valid("json");
  const [existing] = await db.select().from(brokers).where(eq(brokers.id, id));
  if (!existing) {
    return c.json({ message: "Not found" }, 404);
  }
  const nextName = body.name?.trim() ?? existing.name;
  if (nextName !== existing.name) {
    const [nameDup] = await db
      .select({ id: brokers.id })
      .from(brokers)
      .where(
        and(eq(brokers.userId, existing.userId), eq(brokers.name, nextName)),
      )
      .limit(1);
    if (nameDup && nameDup.id !== id) {
      return c.json({ message: "A broker with this name already exists" }, 409);
    }
  }
  const [row] = await db
    .update(brokers)
    .set({
      name: nextName,
      brokerType: body.brokerType ?? existing.brokerType,
    })
    .where(eq(brokers.id, id))
    .returning();
  if (!row) {
    return c.json({ message: "Not found" }, 404);
  }
  return c.json(row);
});

app.delete("/brokers/:id", async (c) => {
  const id = Number.parseInt(c.req.param("id"), 10);
  if (!Number.isFinite(id) || id < 1) {
    return c.json({ message: "Invalid id" }, 400);
  }
  const [existing] = await db
    .select({ id: brokers.id })
    .from(brokers)
    .where(eq(brokers.id, id));
  if (!existing) {
    return c.json({ message: "Not found" }, 404);
  }
  const [txnCountRow] = await db
    .select({ n: count() })
    .from(transactions)
    .where(eq(transactions.brokerId, id));
  const n = Number(txnCountRow?.n ?? 0);
  if (n > 0) {
    return c.json(
      {
        message:
          "Cannot delete a broker that has transactions; reassign or remove them first",
      },
      409,
    );
  }
  const [instCountRow] = await db
    .select({ n: count() })
    .from(instruments)
    .where(eq(instruments.brokerId, id));
  const instN = Number(instCountRow?.n ?? 0);
  if (instN > 0) {
    return c.json(
      {
        message:
          "Cannot delete a broker that has instruments linked to it; remove or reassign those instruments first",
      },
      409,
    );
  }
  await db.delete(brokers).where(eq(brokers.id, id));
  return c.body(null, 204);
});

const transactionIn = z.object({
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

app.get("/transactions", async (c) => {
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
  const rows = await db
    .select()
    .from(transactions)
    .where(eq(transactions.portfolioId, portfolioId))
    .orderBy(desc(transactions.tradeDate));
  return c.json(rows);
});

app.post("/transactions", zValidator("json", transactionIn), async (c) => {
  const body = c.req.valid("json");
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
  if (pf.kind === "benchmark") {
    return c.json(
      { message: "Cannot add transactions to a benchmark portfolio" },
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
});

app.patch("/transactions/:id", zValidator("json", transactionIn), async (c) => {
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
  const body = c.req.valid("json");
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
  if (pf.kind === "benchmark") {
    return c.json(
      { message: "Cannot add transactions to a benchmark portfolio" },
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
});

app.delete("/transactions/:id", async (c) => {
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
});

app.post("/import/degiro", async (c) => {
  let body: Record<string, unknown>;
  try {
    body = (await c.req.parseBody({ all: true })) as Record<string, unknown>;
  } catch {
    return c.json({ message: "Invalid multipart body" }, 400);
  }
  const file = body.file;
  if (file == null) {
    return c.json({ message: 'Expected multipart field "file"' }, 400);
  }
  if (typeof file === "string") {
    return c.json({ message: "Expected file upload, not string" }, 400);
  }
  const csvText = await (file as File).text();

  const createRaw = body.createInstruments;
  let createInstrumentsParsed:
    | z.infer<typeof createDegiroInstrumentsSchema>
    | undefined;
  if (createRaw != null && String(createRaw).trim() !== "") {
    if (typeof createRaw !== "string") {
      return c.json(
        {
          message:
            'Expected multipart field "createInstruments" as a JSON string (array)',
        },
        400,
      );
    }
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(createRaw);
    } catch {
      return c.json({ message: "Invalid createInstruments JSON" }, 400);
    }
    const checked = createDegiroInstrumentsSchema.safeParse(parsedJson);
    if (!checked.success) {
      return c.json({ message: "Invalid createInstruments payload" }, 400);
    }
    createInstrumentsParsed = checked.data;
  }

  const parsed = parseDegiroTransactionsCsv(csvText);
  if (!parsed.ok) {
    return c.json(
      { message: "CSV validation failed", errors: parsed.errors },
      400,
    );
  }
  if (parsed.rows.length === 0) {
    return c.json({ message: "No transaction rows to import" }, 400);
  }

  const [degiroBroker] = await db
    .select()
    .from(brokers)
    .where(and(eq(brokers.name, "Degiro"), eq(brokers.userId, USER_ID)))
    .limit(1);
  if (!degiroBroker) {
    return c.json({ message: 'Broker named "Degiro" is not configured' }, 500);
  }

  const resolvedPortfolio = await resolvePortfolioIdFromImportBody(body);
  if (!resolvedPortfolio.ok) {
    const m = resolvedPortfolio.message;
    if (resolvedPortfolio.status === 400) {
      return c.json({ message: m }, 400);
    }
    if (resolvedPortfolio.status === 404) {
      return c.json({ message: m }, 404);
    }
    return c.json({ message: m }, 500);
  }
  const importPortfolioId = resolvedPortfolio.portfolioId;

  if (createInstrumentsParsed && createInstrumentsParsed.length > 0) {
    for (const item of createInstrumentsParsed) {
      const [dup] = await db
        .select()
        .from(instruments)
        .where(eq(instruments.isin, item.isin))
        .limit(1);
      if (dup) {
        continue;
      }
      try {
        await insertEtfStockFromYahoo(item.kind, item.yahooSymbol, {
          isinOverride: item.isin,
        });
      } catch (e) {
        const { message, status } = formatYahooUpstreamError(e);
        return c.json(
          {
            message: `Failed to create instrument for ISIN ${item.isin}: ${message}`,
          },
          status,
        );
      }
    }
  }

  const uniqueIsins = [...new Set(parsed.rows.map((r) => r.isin))];
  const instRows = await db
    .select()
    .from(instruments)
    .where(inArray(instruments.kind, ["etf", "stock", "custom"]));

  const resolved = await resolveDegiroInstrumentIds(uniqueIsins, instRows);
  if (!resolved.ok) {
    if (resolved.message.includes("OpenFIGI request failed")) {
      return c.json(
        {
          message: resolved.message,
          missingIsins: resolved.missingIsins,
          ambiguousIsins: resolved.ambiguousIsins,
        },
        502,
      );
    }
    if (resolved.ambiguousIsins.length > 0) {
      return c.json(
        {
          message: resolved.message,
          missingIsins: resolved.missingIsins,
          ambiguousIsins: resolved.ambiguousIsins,
        },
        400,
      );
    }
    if (resolved.missingIsins.length > 0) {
      const proposals = await buildDegiroInstrumentProposals(
        resolved.missingIsins,
        parsed.rows,
        resolved.openFigiByIsin ?? new Map(),
      );
      return c.json(
        {
          ok: false,
          needsInstruments: true,
          proposals,
        },
        200,
      );
    }
    return c.json(
      {
        message: resolved.message,
        missingIsins: resolved.missingIsins,
        ambiguousIsins: resolved.ambiguousIsins,
      },
      400,
    );
  }

  const { instrumentIdByIsin } = resolved;

  const values = parsed.rows.map((r) => {
    const instrumentId = instrumentIdByIsin.get(r.isin);
    if (instrumentId === undefined) {
      throw new Error(`Missing instrument for ISIN ${r.isin}`);
    }
    return {
      userId: degiroBroker.userId,
      portfolioId: importPortfolioId,
      brokerId: degiroBroker.id,
      tradeDate: new Date(r.tradeDate),
      side: r.side,
      instrumentId,
      quantity: r.quantity,
      unitPrice: r.unitPrice,
      currency: r.currency,
      externalSource: DEGIRO_CSV_EXTERNAL_SOURCE,
      externalId: r.externalId,
    };
  });

  const written = await db
    .insert(transactions)
    .values(values)
    .onConflictDoUpdate({
      target: [
        transactions.brokerId,
        transactions.externalSource,
        transactions.externalId,
      ],
      set: {
        userId: sql`excluded.user_id`,
        portfolioId: sql`excluded.portfolio_id`,
        tradeDate: sql`excluded.trade_date`,
        side: sql`excluded.side`,
        instrumentId: sql`excluded.instrument_id`,
        quantity: sql`excluded.quantity`,
        unitPrice: sql`excluded.unit_price`,
        currency: sql`excluded.currency`,
      },
      setWhere: sql`(
        ${transactions.tradeDate} IS DISTINCT FROM ${sql.raw("excluded.trade_date")}
        OR ${transactions.side} IS DISTINCT FROM ${sql.raw("excluded.side")}
        OR ${transactions.instrumentId} IS DISTINCT FROM ${sql.raw("excluded.instrument_id")}
        OR ${transactions.quantity} IS DISTINCT FROM ${sql.raw("excluded.quantity")}
        OR ${transactions.unitPrice} IS DISTINCT FROM ${sql.raw("excluded.unit_price")}
        OR ${transactions.currency} IS DISTINCT FROM ${sql.raw("excluded.currency")}
        OR ${transactions.portfolioId} IS DISTINCT FROM ${sql.raw("excluded.portfolio_id")}
      )`,
    })
    .returning({ id: transactions.id });

  const processed = values.length;
  const changed = written.length;
  const unchanged = processed - changed;

  for (const v of values) {
    await seedIntradayPriceForInstrumentIfMissing(db, v.instrumentId, {
      instrumentId: v.instrumentId,
      tradeDate: v.tradeDate,
      unitPrice: v.unitPrice,
      currency: v.currency,
    });
  }

  return c.json({ ok: true, processed, changed, unchanged });
});

app.post("/import/ibkr", async (c) => {
  let body: Record<string, unknown>;
  try {
    body = (await c.req.parseBody({ all: true })) as Record<string, unknown>;
  } catch {
    return c.json({ message: "Invalid multipart body" }, 400);
  }
  const file = body.file;
  if (file == null) {
    return c.json({ message: 'Expected multipart field "file"' }, 400);
  }
  if (typeof file === "string") {
    return c.json({ message: "Expected file upload, not string" }, 400);
  }
  const csvText = await (file as File).text();

  const parsed = parseIbkrTransactionsCsv(csvText);
  if (!parsed.ok) {
    return c.json(
      { message: "CSV validation failed", errors: parsed.errors },
      400,
    );
  }
  if (parsed.rows.length === 0) {
    return c.json({ message: "No transaction rows to import" }, 400);
  }

  const [ibkrBroker] = await db
    .select()
    .from(brokers)
    .where(and(eq(brokers.name, "IBKR"), eq(brokers.userId, USER_ID)))
    .limit(1);
  if (!ibkrBroker) {
    return c.json({ message: 'Broker named "IBKR" is not configured' }, 500);
  }

  const resolvedPortfolioIbkr = await resolvePortfolioIdFromImportBody(body);
  if (!resolvedPortfolioIbkr.ok) {
    const m = resolvedPortfolioIbkr.message;
    if (resolvedPortfolioIbkr.status === 400) {
      return c.json({ message: m }, 400);
    }
    if (resolvedPortfolioIbkr.status === 404) {
      return c.json({ message: m }, 404);
    }
    return c.json({ message: m }, 500);
  }
  const importPortfolioIdIbkr = resolvedPortfolioIbkr.portfolioId;

  const instRows = await db
    .select()
    .from(instruments)
    .where(inArray(instruments.kind, ["etf", "stock", "custom"]));

  const resolved = resolveIbkrInstrumentRows(
    parsed.rows.map((r) => ({ symbolRaw: r.symbolRaw, isin: r.isin })),
    instRows,
  );
  if (!resolved.ok) {
    return c.json(
      {
        message: resolved.message,
        missingSymbols: resolved.missingSymbols,
        ambiguousSymbols: resolved.ambiguousSymbols,
        ...(resolved.ambiguousIsins != null &&
        resolved.ambiguousIsins.length > 0
          ? { ambiguousIsins: resolved.ambiguousIsins }
          : {}),
        ...(resolved.missingIsins != null && resolved.missingIsins.length > 0
          ? { missingIsins: resolved.missingIsins }
          : {}),
      },
      400,
    );
  }

  const { instrumentIds } = resolved;

  const values = parsed.rows.map((r, i) => {
    const instrumentId = instrumentIds[i];
    if (instrumentId === undefined) {
      throw new Error(`Missing instrument for row ${i}`);
    }
    return {
      userId: ibkrBroker.userId,
      portfolioId: importPortfolioIdIbkr,
      brokerId: ibkrBroker.id,
      tradeDate: new Date(r.tradeDate),
      side: r.side,
      instrumentId,
      quantity: r.quantity,
      unitPrice: r.unitPrice,
      currency: r.currency,
      externalSource: IBKR_CSV_EXTERNAL_SOURCE,
      externalId: r.externalId,
    };
  });

  const written = await db
    .insert(transactions)
    .values(values)
    .onConflictDoUpdate({
      target: [
        transactions.brokerId,
        transactions.externalSource,
        transactions.externalId,
      ],
      set: {
        userId: sql`excluded.user_id`,
        portfolioId: sql`excluded.portfolio_id`,
        tradeDate: sql`excluded.trade_date`,
        side: sql`excluded.side`,
        instrumentId: sql`excluded.instrument_id`,
        quantity: sql`excluded.quantity`,
        unitPrice: sql`excluded.unit_price`,
        currency: sql`excluded.currency`,
      },
      setWhere: sql`(
        ${transactions.tradeDate} IS DISTINCT FROM ${sql.raw("excluded.trade_date")}
        OR ${transactions.side} IS DISTINCT FROM ${sql.raw("excluded.side")}
        OR ${transactions.instrumentId} IS DISTINCT FROM ${sql.raw("excluded.instrument_id")}
        OR ${transactions.quantity} IS DISTINCT FROM ${sql.raw("excluded.quantity")}
        OR ${transactions.unitPrice} IS DISTINCT FROM ${sql.raw("excluded.unit_price")}
        OR ${transactions.currency} IS DISTINCT FROM ${sql.raw("excluded.currency")}
        OR ${transactions.portfolioId} IS DISTINCT FROM ${sql.raw("excluded.portfolio_id")}
      )`,
    })
    .returning({ id: transactions.id });

  const processed = values.length;
  const changed = written.length;
  const unchanged = processed - changed;

  for (const v of values) {
    await seedIntradayPriceForInstrumentIfMissing(db, v.instrumentId, {
      instrumentId: v.instrumentId,
      tradeDate: v.tradeDate,
      unitPrice: v.unitPrice,
      currency: v.currency,
    });
  }

  return c.json({ ok: true, processed, changed, unchanged });
});

app.post("/import/seligson", async (c) => {
  let body: Record<string, unknown>;
  try {
    body = (await c.req.parseBody({ all: true })) as Record<string, unknown>;
  } catch {
    return c.json({ message: "Invalid multipart body" }, 400);
  }
  const file = body.file;
  if (file == null) {
    return c.json({ message: 'Expected multipart field "file"' }, 400);
  }
  if (typeof file === "string") {
    return c.json({ message: "Expected file upload, not string" }, 400);
  }
  const skipMissingRaw = body.skipMissingInstruments;
  const skipMissingInstruments =
    skipMissingRaw === true ||
    skipMissingRaw === "true" ||
    skipMissingRaw === "1";
  const tsvText = await (file as File).text();

  const parsed = parseSeligsonTransactionsTsv(tsvText);
  if (!parsed.ok) {
    return c.json(
      {
        message: "Transactions table data validation failed",
        errors: parsed.errors,
      },
      400,
    );
  }
  if (parsed.rows.length === 0) {
    return c.json({ message: "No transaction rows to import" }, 400);
  }

  const [seligsonBroker] = await db
    .select()
    .from(brokers)
    .where(and(eq(brokers.name, "Seligson"), eq(brokers.userId, USER_ID)))
    .limit(1);
  if (!seligsonBroker) {
    return c.json(
      { message: 'Broker named "Seligson" is not configured' },
      500,
    );
  }

  const resolvedPortfolioSg = await resolvePortfolioIdFromImportBody(body);
  if (!resolvedPortfolioSg.ok) {
    const m = resolvedPortfolioSg.message;
    if (resolvedPortfolioSg.status === 400) {
      return c.json({ message: m }, 400);
    }
    if (resolvedPortfolioSg.status === 404) {
      return c.json({ message: m }, 404);
    }
    return c.json({ message: m }, 500);
  }
  const importPortfolioIdSg = resolvedPortfolioSg.portfolioId;

  const joined = await db
    .select({
      instrumentId: instruments.id,
      fundName: seligsonFunds.name,
    })
    .from(instruments)
    .innerJoin(seligsonFunds, eq(instruments.seligsonFundId, seligsonFunds.id))
    .where(
      and(
        eq(instruments.kind, "custom"),
        eq(instruments.brokerId, seligsonBroker.id),
      ),
    );

  const idsByFundName = new Map<string, number[]>();
  for (const row of joined) {
    const key = normalizeSeligsonFundNameForMatch(row.fundName);
    const list = idsByFundName.get(key) ?? [];
    list.push(row.instrumentId);
    idsByFundName.set(key, list);
  }

  const ambiguousFundNames: string[] = [];
  const instrumentIdByFundName = new Map<string, number>();
  for (const [name, ids] of idsByFundName) {
    const unique = [...new Set(ids)];
    if (unique.length > 1) {
      ambiguousFundNames.push(name);
    } else {
      const id = unique[0];
      if (id !== undefined) {
        instrumentIdByFundName.set(name, id);
      }
    }
  }

  if (ambiguousFundNames.length > 0) {
    ambiguousFundNames.sort((a, b) => a.localeCompare(b));
    return c.json(
      {
        message:
          "Multiple instruments share the same Seligson fund name in the database.",
        ambiguousFundNames,
      },
      400,
    );
  }

  const uniqueNames = [...new Set(parsed.rows.map((r) => r.fundName))];
  const missingFundNames = uniqueNames.filter(
    (n) => !instrumentIdByFundName.has(normalizeSeligsonFundNameForMatch(n)),
  );
  missingFundNames.sort((a, b) => a.localeCompare(b));

  let rowsForImport = parsed.rows;
  let skippedRows = 0;
  if (missingFundNames.length > 0) {
    if (!skipMissingInstruments) {
      return c.json(
        {
          message:
            "No instrument matches the following fund names. Add Seligson instruments first.",
          missingFundNames,
        },
        400,
      );
    }
    rowsForImport = parsed.rows.filter((r) =>
      instrumentIdByFundName.has(normalizeSeligsonFundNameForMatch(r.fundName)),
    );
    skippedRows = parsed.rows.length - rowsForImport.length;
    if (rowsForImport.length === 0) {
      return c.json(
        {
          message:
            "No transactions left to import: every row references an unmatched fund name.",
          missingFundNames,
        },
        400,
      );
    }
  }

  const values = rowsForImport.map((r) => {
    const instrumentId = instrumentIdByFundName.get(
      normalizeSeligsonFundNameForMatch(r.fundName),
    );
    if (instrumentId === undefined) {
      throw new Error(`Missing instrument for fund "${r.fundName}"`);
    }
    return {
      userId: seligsonBroker.userId,
      portfolioId: importPortfolioIdSg,
      brokerId: seligsonBroker.id,
      tradeDate: new Date(r.tradeDate),
      side: r.side,
      instrumentId,
      quantity: r.quantity,
      unitPrice: r.unitPrice,
      currency: r.currency,
      externalSource: SELIGSON_TSV_EXTERNAL_SOURCE,
      externalId: r.externalId,
    };
  });

  const written = await db
    .insert(transactions)
    .values(values)
    .onConflictDoUpdate({
      target: [
        transactions.brokerId,
        transactions.externalSource,
        transactions.externalId,
      ],
      set: {
        userId: sql`excluded.user_id`,
        portfolioId: sql`excluded.portfolio_id`,
        tradeDate: sql`excluded.trade_date`,
        side: sql`excluded.side`,
        instrumentId: sql`excluded.instrument_id`,
        quantity: sql`excluded.quantity`,
        unitPrice: sql`excluded.unit_price`,
        currency: sql`excluded.currency`,
      },
      setWhere: sql`(
        ${transactions.tradeDate} IS DISTINCT FROM ${sql.raw("excluded.trade_date")}
        OR ${transactions.side} IS DISTINCT FROM ${sql.raw("excluded.side")}
        OR ${transactions.instrumentId} IS DISTINCT FROM ${sql.raw("excluded.instrument_id")}
        OR ${transactions.quantity} IS DISTINCT FROM ${sql.raw("excluded.quantity")}
        OR ${transactions.unitPrice} IS DISTINCT FROM ${sql.raw("excluded.unit_price")}
        OR ${transactions.currency} IS DISTINCT FROM ${sql.raw("excluded.currency")}
        OR ${transactions.portfolioId} IS DISTINCT FROM ${sql.raw("excluded.portfolio_id")}
      )`,
    })
    .returning({ id: transactions.id });

  const processed = values.length;
  const changed = written.length;
  const unchanged = processed - changed;

  for (const v of values) {
    await seedIntradayPriceForInstrumentIfMissing(db, v.instrumentId, {
      instrumentId: v.instrumentId,
      tradeDate: v.tradeDate,
      unitPrice: v.unitPrice,
      currency: v.currency,
    });
  }

  return c.json({
    ok: true,
    processed,
    changed,
    unchanged,
    ...(skippedRows > 0 ? { skippedRows } : {}),
  });
});

const cashCurrencySchema = z.enum(
  SUPPORTED_CASH_CURRENCY_CODES as unknown as [string, ...string[]],
);

function assertEtfStockBreakdownUrls(
  holdingsRaw: string | null | undefined,
  breakdownRaw: string | null | undefined,
): { ok: true } | { ok: false; message: string } {
  const hv = validateHoldingsDistributionUrl(holdingsRaw);
  if (!hv.ok) {
    return { ok: false, message: hv.message };
  }
  const bv = validateProviderBreakdownDataUrl(breakdownRaw);
  if (!bv.ok) {
    return { ok: false, message: bv.message };
  }
  if (bv.normalized && (!hv.normalized || hv.provider !== "jpm_xlsx")) {
    return {
      ok: false,
      message:
        "Provider breakdown data URL is only supported with a J.P. Morgan daily ETF holdings XLSX URL in Provider holdings URL.",
    };
  }
  return { ok: true };
}

const compositePseudoKeyIn = z.enum(
  COMPOSITE_PSEUDO_KEYS as unknown as [string, ...string[]],
);

const compositeConstituentIn = z
  .object({
    rawLabel: z.string(),
    weightOfFund: z.number().positive(),
    targetInstrumentId: z.number().int().positive().optional(),
    pseudoKey: compositePseudoKeyIn.optional(),
  })
  .refine(
    (d) =>
      (d.targetInstrumentId != null && d.pseudoKey == null) ||
      (d.targetInstrumentId == null && d.pseudoKey != null),
    {
      message: "Exactly one of targetInstrumentId or pseudoKey per constituent",
    },
  );

const customInstrumentIn = z.object({
  kind: z.literal("custom"),
  brokerId: z.number().int().positive(),
  seligsonFid: z.number().int().positive().optional(),
  /** When `constituents` is set and `seligsonFid` is omitted: name for `seligson_funds` (NAV match vs FundValues). */
  displayName: z.string().trim().min(1).optional(),
  constituents: z.array(compositeConstituentIn).optional(),
});

const commodityInstrumentIn = z.object({
  kind: z.literal("commodity"),
  yahooSymbol: z.string().min(1).transform(normalizeYahooSymbolForStorage),
  commoditySector: z.enum(["gold", "silver", "other"]),
  commodityCountryIso: z.string().optional(),
});

const instrumentIn = z.discriminatedUnion("kind", [
  z.object({
    kind: z.enum(["etf", "stock"]),
    yahooSymbol: z.string().min(1).transform(normalizeYahooSymbolForStorage),
    holdingsDistributionUrl: z.string().optional(),
    providerBreakdownDataUrl: z.string().optional(),
  }),
  commodityInstrumentIn,
  customInstrumentIn,
  z.object({
    kind: z.literal("cash_account"),
    brokerId: z.number().int().positive(),
    displayName: z.string().trim().min(1),
    currency: cashCurrencySchema,
    cashGeoKey: z
      .string()
      .trim()
      .min(1)
      .transform((s) => normalizeCashAccountIsoCountryCode(s))
      .refine((s): s is string => s !== null, {
        message:
          "Country code must be a valid ISO 3166-1 alpha-2 value (e.g. FI, US)",
      }),
  }),
]);

const etfStockInstrumentPatchIn = z
  .object({
    holdingsDistributionUrl: z.union([z.string(), z.null()]).optional(),
    providerBreakdownDataUrl: z.union([z.string(), z.null()]).optional(),
  })
  .refine(
    (o) =>
      o.holdingsDistributionUrl !== undefined ||
      o.providerBreakdownDataUrl !== undefined,
    { message: "At least one field is required" },
  );

const commodityInstrumentPatchIn = z
  .object({
    commoditySector: z.enum(["gold", "silver", "other"]).optional(),
    commodityCountryIso: z.union([z.string(), z.null()]).optional(),
  })
  .refine(
    (o) =>
      o.commoditySector !== undefined || o.commodityCountryIso !== undefined,
    { message: "At least one field is required" },
  );

/** Cash accounts, ETF/stock, and commodity accept PATCH. */
const cashInstrumentPatchIn = z
  .object({
    displayName: z.string().trim().min(1).optional(),
    brokerId: z.number().int().positive().optional(),
    cashCurrency: cashCurrencySchema.optional(),
    cashGeoKey: z
      .string()
      .trim()
      .min(1)
      .transform((s) => normalizeCashAccountIsoCountryCode(s))
      .refine((s): s is string => s !== null, {
        message:
          "Country code must be a valid ISO 3166-1 alpha-2 value (e.g. FI, US)",
      })
      .optional(),
  })
  .refine(
    (o) =>
      o.displayName != null ||
      o.brokerId != null ||
      o.cashCurrency != null ||
      o.cashGeoKey != null,
    { message: "At least one field is required" },
  );

type JoinedInstrumentRow = {
  instrument: InferSelectModel<typeof instruments>;
  distribution: InferSelectModel<typeof distributions> | null;
  yahooFinanceCache: InferSelectModel<typeof yahooFinanceCache> | null;
  seligsonDistributionCache: InferSelectModel<
    typeof seligsonDistributionCache
  > | null;
  providerHoldingsCache: InferSelectModel<typeof providerHoldingsCache> | null;
  seligsonFund: InferSelectModel<typeof seligsonFunds> | null;
  broker: InferSelectModel<typeof brokers> | null;
};

function mapJoinedRowToInstrumentPayload(
  row: JoinedInstrumentRow,
  netQuantity: number,
) {
  const {
    instrument,
    distribution,
    yahooFinanceCache: yahooRow,
    seligsonDistributionCache: seligsonRow,
    providerHoldingsCache: providerHoldingsRow,
    seligsonFund: fund,
    broker: br,
  } = row;
  return {
    ...instrument,
    netQuantity,
    providerHoldings: providerHoldingsRow
      ? {
          source: providerHoldingsRow.source,
          fetchedAt: providerHoldingsRow.fetchedAt,
          raw: providerHoldingsRow.raw,
        }
      : null,
    distribution: distribution
      ? {
          fetchedAt: distribution.fetchedAt,
          source: distribution.source,
          payload: distribution.payload,
          yahooFinance: yahooRow ? { raw: yahooRow.raw } : null,
          seligsonDistribution: seligsonRow
            ? {
                holdingsHtml: seligsonRow.holdingsHtml,
                allocationHtml: seligsonRow.allocationHtml,
                countryHtml: seligsonRow.countryHtml,
              }
            : null,
        }
      : null,
    seligsonFund: fund ? { id: fund.id, fid: fund.fid, name: fund.name } : null,
    broker: br
      ? {
          id: br.id,
          name: br.name,
          brokerType: br.brokerType,
        }
      : null,
  };
}

type NetQtyScope = { kind: "portfolio"; portfolioId: number } | { kind: "all" };

async function loadInstrumentPayloadById(
  id: number,
  netQtyScope: NetQtyScope = { kind: "all" },
): Promise<ReturnType<typeof mapJoinedRowToInstrumentPayload> | null> {
  const joined = await db
    .select({
      instrument: instruments,
      yahooFinanceCache: yahooFinanceCache,
      seligsonDistributionCache: seligsonDistributionCache,
      providerHoldingsCache: providerHoldingsCache,
      seligsonFund: seligsonFunds,
      broker: brokers,
    })
    .from(instruments)
    .leftJoin(
      yahooFinanceCache,
      eq(instruments.id, yahooFinanceCache.instrumentId),
    )
    .leftJoin(
      seligsonDistributionCache,
      eq(instruments.id, seligsonDistributionCache.instrumentId),
    )
    .leftJoin(
      providerHoldingsCache,
      eq(instruments.id, providerHoldingsCache.instrumentId),
    )
    .leftJoin(seligsonFunds, eq(instruments.seligsonFundId, seligsonFunds.id))
    .leftJoin(brokers, eq(instruments.brokerId, brokers.id))
    .where(eq(instruments.id, id))
    .limit(1);
  if (joined.length === 0) {
    return null;
  }
  const [row] = joined;
  if (!row) {
    return null;
  }
  const distMap = await loadLatestDistributionRowsByInstrumentIds(db, [id]);
  const rowWithDist = {
    ...row,
    distribution: distMap.get(id) ?? null,
  };
  const netWhere =
    netQtyScope.kind === "portfolio"
      ? and(
          eq(transactions.instrumentId, id),
          eq(transactions.portfolioId, netQtyScope.portfolioId),
        )
      : and(
          eq(transactions.instrumentId, id),
          eq(transactions.userId, USER_ID),
        );
  const [qtyRow] = await db
    .select({
      qty: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.side} = 'buy' THEN ${transactions.quantity}::numeric ELSE -${transactions.quantity}::numeric END), 0)`,
    })
    .from(transactions)
    .where(netWhere);
  const q =
    qtyRow?.qty != null && qtyRow.qty !== ""
      ? Number.parseFloat(qtyRow.qty)
      : 0;
  const netQuantity = Number.isFinite(q) ? q : 0;
  return mapJoinedRowToInstrumentPayload(rowWithDist, netQuantity);
}

async function loadInstrumentMatchCandidates(): Promise<
  InstrumentMatchCandidate[]
> {
  const joined = await db
    .select({
      id: instruments.id,
      displayName: instruments.displayName,
      yahooSymbol: instruments.yahooSymbol,
      sfName: seligsonFunds.name,
    })
    .from(instruments)
    .leftJoin(seligsonFunds, eq(instruments.seligsonFundId, seligsonFunds.id))
    .where(notInArray(instruments.kind, ["cash_account", "fx"]));

  return joined.map((r) => ({
    id: r.id,
    labels: [r.displayName, r.yahooSymbol, r.sfName].filter(
      (x): x is string => x != null && String(x).trim().length > 0,
    ),
  }));
}

async function findOrCreateSeligsonFundByFid(fid: number) {
  const [existing] = await db
    .select()
    .from(seligsonFunds)
    .where(eq(seligsonFunds.fid, fid));
  if (existing) {
    return existing;
  }
  let name: string;
  try {
    name = await fetchSeligsonFundName(fid);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(message);
  }
  const [inserted] = await db
    .insert(seligsonFunds)
    .values({
      fid,
      name,
      isActive: true,
    })
    .returning();
  if (!inserted) {
    throw new Error("Failed to insert seligson fund");
  }
  return inserted;
}

/** Composite funds without FundViewer `fid`: unique negative `fid`, name from `displayName` (FundValues NAV match). */
async function insertSyntheticSeligsonFund(name: string) {
  const [agg] = await db
    .select({ m: min(seligsonFunds.fid) })
    .from(seligsonFunds)
    .where(lt(seligsonFunds.fid, 0));
  const nextFid = (agg?.m ?? 0) - 1;
  const [inserted] = await db
    .insert(seligsonFunds)
    .values({
      fid: nextFid,
      name,
      isActive: true,
    })
    .returning();
  if (!inserted) {
    throw new Error("Failed to insert seligson fund");
  }
  return inserted;
}

app.get("/instruments", async (c) => {
  const portfolioIdRaw = c.req.query("portfolioId")?.trim();
  let portfolioIdForNet: number | null = null;
  if (portfolioIdRaw != null && portfolioIdRaw !== "") {
    const pid = Number.parseInt(portfolioIdRaw, 10);
    if (!Number.isFinite(pid) || pid < 1) {
      return c.json({ message: "Invalid portfolioId" }, 400);
    }
    const p = await loadPortfolioOwnedByUser(pid);
    if (!p) {
      return c.json({ message: "Portfolio not found" }, 404);
    }
    portfolioIdForNet = pid;
  }

  const brokerIdRaw = c.req.query("brokerId")?.trim();
  let brokerTypeForFilter: string | null = null;
  let filterBrokerId: number | null = null;
  if (brokerIdRaw != null && brokerIdRaw !== "") {
    const brokerId = Number.parseInt(brokerIdRaw, 10);
    if (!Number.isFinite(brokerId) || brokerId < 1) {
      return c.json({ message: "Invalid brokerId" }, 400);
    }
    const [b] = await db
      .select({ brokerType: brokers.brokerType })
      .from(brokers)
      .where(eq(brokers.id, brokerId));
    if (!b) {
      return c.json({ message: "Broker not found" }, 404);
    }
    brokerTypeForFilter = b.brokerType;
    filterBrokerId = brokerId;
  }

  const joined = await db
    .select({
      instrument: instruments,
      yahooFinanceCache: yahooFinanceCache,
      seligsonDistributionCache: seligsonDistributionCache,
      providerHoldingsCache: providerHoldingsCache,
      seligsonFund: seligsonFunds,
      broker: brokers,
    })
    .from(instruments)
    .leftJoin(
      yahooFinanceCache,
      eq(instruments.id, yahooFinanceCache.instrumentId),
    )
    .leftJoin(
      seligsonDistributionCache,
      eq(instruments.id, seligsonDistributionCache.instrumentId),
    )
    .leftJoin(
      providerHoldingsCache,
      eq(instruments.id, providerHoldingsCache.instrumentId),
    )
    .leftJoin(seligsonFunds, eq(instruments.seligsonFundId, seligsonFunds.id))
    .leftJoin(brokers, eq(instruments.brokerId, brokers.id))
    .orderBy(asc(instruments.id));

  const distMap = await loadLatestDistributionRowsByInstrumentIds(
    db,
    joined.map((j) => j.instrument.id),
  );

  const qtyRows = await db
    .select({
      instrumentId: transactions.instrumentId,
      qty: sql<string>`SUM(CASE WHEN ${transactions.side} = 'buy' THEN ${transactions.quantity}::numeric ELSE -${transactions.quantity}::numeric END)`,
    })
    .from(transactions)
    .where(
      portfolioIdForNet != null
        ? eq(transactions.portfolioId, portfolioIdForNet)
        : eq(transactions.userId, USER_ID),
    )
    .groupBy(transactions.instrumentId);

  const netQtyByInstrument = new Map<number, number>();
  for (const r of qtyRows) {
    const q = Number.parseFloat(r.qty);
    if (Number.isFinite(q)) {
      netQtyByInstrument.set(r.instrumentId, q);
    }
  }

  let payload = joined.map((row) =>
    mapJoinedRowToInstrumentPayload(
      {
        ...row,
        distribution: distMap.get(row.instrument.id) ?? null,
      },
      netQtyByInstrument.get(row.instrument.id) ?? 0,
    ),
  );

  if (brokerTypeForFilter != null && filterBrokerId != null) {
    payload = payload.filter((row) => {
      if (
        !isInstrumentKindAllowedForBrokerType(
          brokerTypeForFilter as BrokerType,
          row.kind,
        )
      ) {
        return false;
      }
      if (row.kind === "cash_account" || row.kind === "custom") {
        return row.brokerId === filterBrokerId;
      }
      return true;
    });
  }

  return c.json(payload);
});

app.get("/instruments/lookup-yahoo", async (c) => {
  const symbol = c.req.query("symbol")?.trim();
  if (!symbol) {
    return c.json({ message: "symbol query required" }, 400);
  }
  try {
    const raw = await fetchYahooQuoteSummaryRaw(symbol);
    const lookup = buildYahooInstrumentLookup(raw, symbol);
    return c.json({
      lookup,
      displayName: displayNameFromYahooLookup(lookup, symbol),
    });
  } catch (e) {
    const { message, status } = formatYahooUpstreamError(e);
    return c.json({ message }, status);
  }
});

app.get("/instruments/:id", async (c) => {
  const id = Number.parseInt(c.req.param("id"), 10);
  if (!Number.isFinite(id) || id < 1) {
    return c.json({ message: "Invalid id" }, 400);
  }
  const portfolioIdRaw = c.req.query("portfolioId")?.trim();
  let netQtyScope: NetQtyScope = { kind: "all" };
  if (portfolioIdRaw != null && portfolioIdRaw !== "") {
    const pid = Number.parseInt(portfolioIdRaw, 10);
    if (!Number.isFinite(pid) || pid < 1) {
      return c.json({ message: "Invalid portfolioId" }, 400);
    }
    const p = await loadPortfolioOwnedByUser(pid);
    if (!p) {
      return c.json({ message: "Portfolio not found" }, 404);
    }
    netQtyScope = { kind: "portfolio", portfolioId: pid };
  }
  const payload = await loadInstrumentPayloadById(id, netQtyScope);
  if (!payload) {
    return c.json({ message: "Not found" }, 404);
  }
  return c.json(payload);
});

const compositePreviewIn = z.object({
  source: z.literal("seligson_pharos_table"),
  url: z.string().url(),
});

app.post(
  "/instruments/composite-preview",
  zValidator("json", compositePreviewIn),
  async (c) => {
    const { url } = c.req.valid("json");
    try {
      const html = await fetchSeligsonPublicPageHtml(url);
      const { rows, asOfDate, notes } =
        parseSeligsonPharosAllocationTable(html);
      const fundName = parseSeligsonPublicPageFundName(html);
      const candidates = await loadInstrumentMatchCandidates();
      const preview = rows.map((r) => {
        const pseudo = suggestPseudoKeyForLabel(r.rawLabel);
        const suggestedInstrumentId = pseudo
          ? null
          : suggestBestInstrumentId(r.rawLabel, candidates);
        return {
          rawLabel: r.rawLabel,
          pctOfFund: r.pctOfFund,
          suggestedInstrumentId,
          suggestedPseudoKey: pseudo,
        };
      });
      return c.json({ asOfDate, rows: preview, notes, fundName });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return c.json({ message }, 502);
    }
  },
);

app.post("/instruments", zValidator("json", instrumentIn), async (c) => {
  const body = c.req.valid("json");

  if (body.kind === "etf" || body.kind === "stock") {
    try {
      const holdingsRaw =
        body.holdingsDistributionUrl != null &&
        body.holdingsDistributionUrl.trim().length > 0
          ? body.holdingsDistributionUrl
          : null;
      const breakdownRaw =
        body.providerBreakdownDataUrl != null &&
        body.providerBreakdownDataUrl.trim().length > 0
          ? body.providerBreakdownDataUrl
          : null;
      const combo = assertEtfStockBreakdownUrls(holdingsRaw, breakdownRaw);
      if (!combo.ok) {
        return c.json({ message: combo.message }, 400);
      }
      const row = await insertEtfStockFromYahoo(body.kind, body.yahooSymbol, {
        holdingsDistributionUrl: holdingsRaw,
        providerBreakdownDataUrl: breakdownRaw,
      });
      return c.json(row, 201);
    } catch (e) {
      const { message, status } = formatYahooUpstreamError(e);
      return c.json({ message }, status);
    }
  }

  if (body.kind === "commodity") {
    const countryRaw = body.commodityCountryIso?.trim() ?? "";
    const countryIso =
      countryRaw.length === 0
        ? null
        : normalizeCashAccountIsoCountryCode(countryRaw);
    if (countryIso === null && countryRaw.length > 0) {
      return c.json({ message: "Invalid ISO country code" }, 400);
    }
    try {
      const row = await insertCommodityFromYahoo(
        body.yahooSymbol,
        body.commoditySector,
        countryIso,
      );
      return c.json(row, 201);
    } catch (e) {
      const { message, status } = formatYahooUpstreamError(e);
      return c.json({ message }, status);
    }
  }

  if (body.kind === "custom") {
    const hasComposite =
      body.constituents != null && body.constituents.length > 0;
    if (hasComposite) {
      if (
        body.seligsonFid == null &&
        (body.displayName == null || body.displayName.length === 0)
      ) {
        return c.json(
          {
            message:
              "Provide seligsonFid or displayName for composite instruments",
          },
          400,
        );
      }
    } else if (body.seligsonFid == null) {
      return c.json({ message: "seligsonFid is required" }, 400);
    } else if (body.displayName != null) {
      return c.json(
        { message: "displayName is only used for composite instruments" },
        400,
      );
    }
    const [br] = await db
      .select()
      .from(brokers)
      .where(eq(brokers.id, body.brokerId));
    if (!br) {
      return c.json({ message: "Broker not found" }, 404);
    }
    if (br.brokerType !== "seligson") {
      return c.json(
        { message: "Seligson instruments require a Seligson-type broker" },
        400,
      );
    }
    const constituents = body.constituents;
    let fund: Awaited<ReturnType<typeof findOrCreateSeligsonFundByFid>>;
    try {
      if (constituents != null && constituents.length > 0) {
        if (body.seligsonFid != null) {
          fund = await findOrCreateSeligsonFundByFid(body.seligsonFid);
        } else {
          const name = body.displayName?.trim();
          if (!name) {
            return c.json({ message: "displayName is required" }, 400);
          }
          fund = await insertSyntheticSeligsonFund(name);
        }
      } else {
        const fid = body.seligsonFid;
        if (fid == null) {
          return c.json({ message: "seligsonFid is required" }, 400);
        }
        fund = await findOrCreateSeligsonFundByFid(fid);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return c.json({ message }, 502);
    }

    if (constituents != null && constituents.length > 0) {
      const sumRaw = constituents.reduce((s, c) => s + c.weightOfFund, 0);
      if (!Number.isFinite(sumRaw) || sumRaw < 0.85 || sumRaw > 1.15) {
        return c.json(
          {
            message:
              "Constituent weightOfFund values must sum to about 1 (85–115%).",
          },
          400,
        );
      }
      const norm = constituents.map((c) => ({
        ...c,
        weightOfFund: c.weightOfFund / sumRaw,
      }));

      const targetIds = norm
        .map((c) => c.targetInstrumentId)
        .filter((id): id is number => id != null);
      const uniqueTargets = [...new Set(targetIds)];
      if (uniqueTargets.length > 0) {
        const found = await db
          .select({ id: instruments.id })
          .from(instruments)
          .where(inArray(instruments.id, uniqueTargets));
        if (found.length !== uniqueTargets.length) {
          return c.json(
            { message: "One or more target instruments do not exist" },
            400,
          );
        }
      }

      const [row] = await db
        .insert(instruments)
        .values({
          kind: "custom",
          displayName: fund.name,
          seligsonFundId: fund.id,
          brokerId: body.brokerId,
        })
        .returning();
      if (!row) {
        return c.json({ message: "Failed to insert instrument" }, 500);
      }

      try {
        await db.insert(instrumentCompositeConstituents).values(
          norm.map((c, i) => ({
            parentInstrumentId: row.id,
            sortOrder: i,
            rawLabel: c.rawLabel,
            weight: String(c.weightOfFund),
            targetInstrumentId: c.targetInstrumentId ?? null,
            pseudoKey: c.pseudoKey ?? null,
          })),
        );
        await writeCompositeDistributionCache(row.id);
        await upsertSeligsonFundValuesFromPage(db, new Date());
      } catch (e) {
        await db.delete(instruments).where(eq(instruments.id, row.id));
        const message = e instanceof Error ? e.message : String(e);
        return c.json({ message }, 502);
      }
      return c.json(row, 201);
    }

    const [row] = await db
      .insert(instruments)
      .values({
        kind: "custom",
        displayName: fund.name,
        seligsonFundId: fund.id,
        brokerId: body.brokerId,
      })
      .returning();
    if (!row) {
      return c.json({ message: "Failed to insert instrument" }, 500);
    }
    try {
      await writeSeligsonDistributionCache(row.id, fund.fid);
    } catch (e) {
      await db.delete(instruments).where(eq(instruments.id, row.id));
      const message = e instanceof Error ? e.message : String(e);
      return c.json({ message }, 502);
    }
    return c.json(row, 201);
  }

  if (body.kind === "cash_account") {
    const [br] = await db
      .select()
      .from(brokers)
      .where(eq(brokers.id, body.brokerId));
    if (!br) {
      return c.json({ message: "Broker not found" }, 404);
    }
    if (br.brokerType !== "cash_account") {
      return c.json(
        { message: "Cash instruments require a cash-account-type broker" },
        400,
      );
    }
    const displayName = body.displayName;
    const [nameDup] = await db
      .select({ id: instruments.id })
      .from(instruments)
      .where(
        and(
          eq(instruments.kind, "cash_account"),
          sql`lower(trim(${instruments.displayName})) = ${displayName.toLowerCase()}`,
        ),
      )
      .limit(1);
    if (nameDup) {
      return c.json(
        { message: "A cash account with this name already exists" },
        409,
      );
    }
    try {
      const [row] = await db
        .insert(instruments)
        .values({
          kind: "cash_account",
          displayName,
          cashCurrency: body.currency,
          cashGeoKey: body.cashGeoKey,
          brokerId: body.brokerId,
        })
        .returning();
      if (!row) {
        return c.json({ message: "Failed to insert instrument" }, 500);
      }
      return c.json(row, 201);
    } catch (e) {
      if (
        typeof e === "object" &&
        e !== null &&
        "code" in e &&
        (e as { code?: string }).code === "23505"
      ) {
        return c.json(
          { message: "A cash account with this name already exists" },
          409,
        );
      }
      throw e;
    }
  }

  return c.json({ message: "Unsupported instrument kind" }, 400);
});

app.patch("/instruments/:id", async (c) => {
  const id = Number.parseInt(c.req.param("id"), 10);
  if (!Number.isFinite(id) || id < 1) {
    return c.json({ message: "Invalid id" }, 400);
  }
  const [existing] = await db
    .select()
    .from(instruments)
    .where(eq(instruments.id, id));
  if (!existing) {
    return c.json({ message: "Not found" }, 404);
  }

  const rawBody: unknown = await c.req.json();

  if (existing.kind === "cash_account") {
    const parsed = cashInstrumentPatchIn.safeParse(rawBody);
    if (!parsed.success) {
      return c.json({ message: parsed.error.flatten() }, 400);
    }
    const body = parsed.data;

    const updates: {
      displayName?: string;
      brokerId?: number;
      cashCurrency?: string;
      cashGeoKey?: string;
    } = {};
    if (body.displayName != null) {
      const name = body.displayName.trim();
      const [dup] = await db
        .select({ id: instruments.id })
        .from(instruments)
        .where(
          and(
            eq(instruments.kind, "cash_account"),
            sql`lower(trim(${instruments.displayName})) = ${name.toLowerCase()}`,
            ne(instruments.id, id),
          ),
        )
        .limit(1);
      if (dup) {
        return c.json(
          { message: "A cash account with this name already exists" },
          409,
        );
      }
      updates.displayName = name;
    }
    if (body.brokerId != null) {
      const [br] = await db
        .select()
        .from(brokers)
        .where(eq(brokers.id, body.brokerId));
      if (!br) {
        return c.json({ message: "Broker not found" }, 404);
      }
      if (br.brokerType !== "cash_account") {
        return c.json(
          { message: "Cash instruments require a cash-account-type broker" },
          400,
        );
      }
      updates.brokerId = body.brokerId;
    }
    if (body.cashCurrency != null) updates.cashCurrency = body.cashCurrency;
    if (body.cashGeoKey != null) updates.cashGeoKey = body.cashGeoKey;
    if (Object.keys(updates).length === 0) {
      const payload = await loadInstrumentPayloadById(id);
      if (!payload) {
        return c.json({ message: "Not found" }, 404);
      }
      return c.json(payload);
    }
    try {
      await db.update(instruments).set(updates).where(eq(instruments.id, id));
    } catch (e) {
      if (
        typeof e === "object" &&
        e !== null &&
        "code" in e &&
        (e as { code?: string }).code === "23505"
      ) {
        return c.json(
          { message: "A cash account with this name already exists" },
          409,
        );
      }
      throw e;
    }
    const payload = await loadInstrumentPayloadById(id);
    if (!payload) {
      return c.json({ message: "Not found" }, 404);
    }
    return c.json(payload);
  }

  if (existing.kind === "etf" || existing.kind === "stock") {
    const parsed = etfStockInstrumentPatchIn.safeParse(rawBody);
    if (!parsed.success) {
      return c.json({ message: parsed.error.flatten() }, 400);
    }
    const body = parsed.data;
    const rawHoldings =
      body.holdingsDistributionUrl !== undefined
        ? body.holdingsDistributionUrl
        : existing.holdingsDistributionUrl;
    const rawBreakdown =
      body.providerBreakdownDataUrl !== undefined
        ? body.providerBreakdownDataUrl
        : existing.providerBreakdownDataUrl;
    const combo = assertEtfStockBreakdownUrls(rawHoldings, rawBreakdown);
    if (!combo.ok) {
      return c.json({ message: combo.message }, 400);
    }
    const hv = validateHoldingsDistributionUrl(rawHoldings);
    if (!hv.ok) {
      return c.json({ message: hv.message }, 400);
    }
    const bv = validateProviderBreakdownDataUrl(rawBreakdown);
    if (!bv.ok) {
      return c.json({ message: bv.message }, 400);
    }
    const prevH = validateHoldingsDistributionUrl(
      existing.holdingsDistributionUrl,
    );
    const prevB = validateProviderBreakdownDataUrl(
      existing.providerBreakdownDataUrl,
    );
    const prevHN = prevH.ok ? prevH.normalized : null;
    const prevBN = prevB.ok ? prevB.normalized : null;
    const nextHN = hv.normalized;
    const nextBN = bv.normalized;
    await db
      .update(instruments)
      .set({
        holdingsDistributionUrl: hv.normalized,
        providerBreakdownDataUrl: bv.normalized,
      })
      .where(eq(instruments.id, id));
    if (prevHN !== nextHN || prevBN !== nextBN) {
      const refresh = await refreshDistributionCacheForInstrumentId(id);
      if ("skipped" in refresh) {
        if (refresh.reason === "not_found") {
          return c.json({ message: "Not found" }, 404);
        }
      } else if ("error" in refresh) {
        return c.json({ message: refresh.error }, refresh.status);
      }
    }
    const payload = await loadInstrumentPayloadById(id);
    if (!payload) {
      return c.json({ message: "Not found" }, 404);
    }
    return c.json(payload);
  }

  if (existing.kind === "commodity") {
    const parsed = commodityInstrumentPatchIn.safeParse(rawBody);
    if (!parsed.success) {
      return c.json({ message: parsed.error.flatten() }, 400);
    }
    const body = parsed.data;
    const updates: {
      commoditySector?: string;
      commodityCountryIso?: string | null;
    } = {};
    if (body.commoditySector !== undefined) {
      updates.commoditySector = body.commoditySector;
    }
    if (body.commodityCountryIso !== undefined) {
      const v = body.commodityCountryIso;
      if (v === null) {
        updates.commodityCountryIso = null;
      } else {
        const t = v.trim();
        if (t.length === 0) {
          updates.commodityCountryIso = null;
        } else {
          const iso = normalizeCashAccountIsoCountryCode(t);
          if (iso === null) {
            return c.json({ message: "Invalid ISO country code" }, 400);
          }
          updates.commodityCountryIso = iso;
        }
      }
    }
    await db.update(instruments).set(updates).where(eq(instruments.id, id));
    const refresh = await refreshDistributionCacheForInstrumentId(id);
    if ("skipped" in refresh) {
      if (refresh.reason === "not_found") {
        return c.json({ message: "Not found" }, 404);
      }
    } else if ("error" in refresh) {
      return c.json({ message: refresh.error }, refresh.status);
    }
    const payload = await loadInstrumentPayloadById(id);
    if (!payload) {
      return c.json({ message: "Not found" }, 404);
    }
    return c.json(payload);
  }

  return c.json(
    {
      message:
        "Unsupported instrument kind for PATCH (only cash accounts, ETF/stock, and commodity)",
    },
    400,
  );
});

app.post("/instruments/:id/refresh-distribution", async (c) => {
  const id = Number.parseInt(c.req.param("id"), 10);
  if (!Number.isFinite(id) || id < 1) {
    return c.json({ message: "Invalid id" }, 400);
  }
  const result = await refreshDistributionCacheForInstrumentId(id);
  if ("skipped" in result) {
    if (result.reason === "not_found") {
      return c.json({ message: "Not found" }, 404);
    }
    return c.json({ skipped: true, reason: result.reason }, 200);
  }
  if ("error" in result) {
    return c.json({ message: result.error }, result.status);
  }
  const payload = await loadInstrumentPayloadById(id);
  if (!payload) {
    return c.json({ message: "Not found" }, 404);
  }
  return c.json({ ok: true, instrument: payload }, 200);
});

app.delete("/instruments/:id", async (c) => {
  const id = Number.parseInt(c.req.param("id"), 10);
  if (!Number.isFinite(id) || id < 1) {
    return c.json({ message: "Invalid id" }, 400);
  }
  const [existing] = await db
    .select({ id: instruments.id })
    .from(instruments)
    .where(eq(instruments.id, id));
  if (!existing) {
    return c.json({ message: "Not found" }, 404);
  }
  await db.transaction(async (tx) => {
    await tx.delete(transactions).where(eq(transactions.instrumentId, id));
    await tx.delete(instruments).where(eq(instruments.id, id));
  });
  return c.body(null, 204);
});

app.get("/positions", async (c) => {
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
  if (pf.kind === "benchmark") {
    return c.json([]);
  }
  const pos = await loadOpenPositionsForPortfolio(portfolioId);
  const instRows =
    pos.length === 0
      ? []
      : await db
          .select()
          .from(instruments)
          .where(
            inArray(
              instruments.id,
              pos.map((p) => p.instrumentId),
            ),
          );
  const merged = pos.map((p) => ({
    ...p,
    instrument: instRows.find((i) => i.id === p.instrumentId) ?? null,
  }));
  return c.json(merged);
});

app.get("/portfolio/distributions", async (c) => {
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
  const data = await getPortfolioDistributions(portfolioId);
  return c.json(data);
});

app.get("/portfolio/asset-mix-history", async (c) => {
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
  const data = await getPortfolioAssetMixHistory(portfolioId, {
    portfolio: pf,
  });
  return c.json(data);
});

const port = Number.parseInt(process.env.PORT ?? "3001", 10);

async function start(): Promise<void> {
  await runDevMigrations();

  void processFxBackfillQueue().catch((e) => {
    console.error("fx_backfill_queue drain on startup", e);
  });

  setImmediate(() => {
    void refreshStaleDistributionCaches();
  });

  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`API listening on http://localhost:${info.port}`);
  });
}

void start().catch((err) => {
  console.error(err);
  process.exit(1);
});
