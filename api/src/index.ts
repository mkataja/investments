import { serve } from "@hono/node-server";
import { zValidator } from "@hono/zod-validator";
import {
  type BrokerType,
  SUPPORTED_CASH_CURRENCY_CODES,
  USER_ID,
  brokers,
  distributions,
  instruments,
  isInstrumentKindAllowedForBrokerType,
  normalizeCashAccountIsoCountryCode,
  normalizeYahooSymbolForStorage,
  portfolios,
  providerHoldingsCache,
  seligsonDistributionCache,
  seligsonFunds,
  transactions,
  validateHoldingsDistributionUrl,
  yahooFinanceCache,
} from "@investments/db";
import {
  type InferSelectModel,
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  ne,
  sql,
} from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { db } from "./db.js";
import {
  fetchSeligsonFundName,
  fetchSeligsonHtml,
  parseSeligsonDistributions,
} from "./distributions/seligson.js";
import {
  buildYahooInstrumentLookup,
  displayNameFromYahooLookup,
  fetchYahooQuoteSummaryRaw,
  normalizeYahooDistribution,
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
  writeSeligsonDistributionCache,
} from "./lib/cacheRefresh.js";
import { insertEtfStockFromYahoo } from "./lib/createYahooInstrument.js";
import { normalizeTradeDateInputToDate } from "./lib/normalizeTradeDate.js";
import { getPortfolioDistributions } from "./lib/portfolio.js";
import {
  loadPortfolioOwnedByUser,
  resolvePortfolioIdFromImportBody,
} from "./lib/portfolioAccess.js";
import { loadOpenPositionsForPortfolio } from "./lib/positions.js";
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

const devToolsAllowed = () =>
  process.env.NODE_ENV === "development" || process.env.DEV_TOOLS === "true";

app.get("/health", (c) => c.json({ ok: true }));

function mapPortfolioRow(row: InferSelectModel<typeof portfolios>) {
  return {
    ...row,
    emergencyFundEur: Number(row.emergencyFundEur),
  };
}

const portfolioCreateIn = z.object({
  name: z.string().trim().min(1),
  emergencyFundEur: z.number().finite().nonnegative().optional(),
});

const portfolioPatchIn = z
  .object({
    name: z.string().trim().min(1).optional(),
    emergencyFundEur: z.number().finite().nonnegative().optional(),
  })
  .refine((o) => o.name != null || o.emergencyFundEur != null, {
    message: "At least one field is required",
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
  const [row] = await db
    .insert(portfolios)
    .values({
      userId: USER_ID,
      name,
      emergencyFundEur: String(body.emergencyFundEur ?? 0),
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
    const [row] = await db
      .update(portfolios)
      .set({
        name: nextName,
        ...(body.emergencyFundEur != null
          ? { emergencyFundEur: String(body.emergencyFundEur) }
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
  unitPriceEur: z.string().or(z.number()).optional(),
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
      unitPriceEur:
        body.unitPriceEur != null ? String(body.unitPriceEur) : undefined,
    })
    .returning();
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
  if (pf.userId !== brk.userId) {
    return c.json(
      { message: "Portfolio and broker must belong to the same user" },
      400,
    );
  }
  const unitPriceEurValue =
    body.unitPriceEur != null && String(body.unitPriceEur).trim() !== ""
      ? String(body.unitPriceEur)
      : null;
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
      unitPriceEur: unitPriceEurValue,
    })
    .where(eq(transactions.id, id))
    .returning();
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
      unitPriceEur: r.unitPriceEur,
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
        unitPriceEur: sql`excluded.unit_price_eur`,
      },
      setWhere: sql`(
        ${transactions.tradeDate} IS DISTINCT FROM ${sql.raw("excluded.trade_date")}
        OR ${transactions.side} IS DISTINCT FROM ${sql.raw("excluded.side")}
        OR ${transactions.instrumentId} IS DISTINCT FROM ${sql.raw("excluded.instrument_id")}
        OR ${transactions.quantity} IS DISTINCT FROM ${sql.raw("excluded.quantity")}
        OR ${transactions.unitPrice} IS DISTINCT FROM ${sql.raw("excluded.unit_price")}
        OR ${transactions.currency} IS DISTINCT FROM ${sql.raw("excluded.currency")}
        OR ${transactions.unitPriceEur} IS DISTINCT FROM ${sql.raw("excluded.unit_price_eur")}
        OR ${transactions.portfolioId} IS DISTINCT FROM ${sql.raw("excluded.portfolio_id")}
      )`,
    })
    .returning({ id: transactions.id });

  const processed = values.length;
  const changed = written.length;
  const unchanged = processed - changed;

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
      unitPriceEur: r.unitPriceEur,
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
        unitPriceEur: sql`excluded.unit_price_eur`,
      },
      setWhere: sql`(
        ${transactions.tradeDate} IS DISTINCT FROM ${sql.raw("excluded.trade_date")}
        OR ${transactions.side} IS DISTINCT FROM ${sql.raw("excluded.side")}
        OR ${transactions.instrumentId} IS DISTINCT FROM ${sql.raw("excluded.instrument_id")}
        OR ${transactions.quantity} IS DISTINCT FROM ${sql.raw("excluded.quantity")}
        OR ${transactions.unitPrice} IS DISTINCT FROM ${sql.raw("excluded.unit_price")}
        OR ${transactions.currency} IS DISTINCT FROM ${sql.raw("excluded.currency")}
        OR ${transactions.unitPriceEur} IS DISTINCT FROM ${sql.raw("excluded.unit_price_eur")}
        OR ${transactions.portfolioId} IS DISTINCT FROM ${sql.raw("excluded.portfolio_id")}
      )`,
    })
    .returning({ id: transactions.id });

  const processed = values.length;
  const changed = written.length;
  const unchanged = processed - changed;

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
  const tsvText = await (file as File).text();

  const parsed = parseSeligsonTransactionsTsv(tsvText);
  if (!parsed.ok) {
    return c.json(
      { message: "TSV validation failed", errors: parsed.errors },
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

  if (missingFundNames.length > 0) {
    return c.json(
      {
        message:
          "No instrument matches the following fund names. Add Seligson custom instruments first.",
        missingFundNames,
      },
      400,
    );
  }

  const values = parsed.rows.map((r) => {
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
      unitPriceEur: r.unitPriceEur,
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
        unitPriceEur: sql`excluded.unit_price_eur`,
      },
      setWhere: sql`(
        ${transactions.tradeDate} IS DISTINCT FROM ${sql.raw("excluded.trade_date")}
        OR ${transactions.side} IS DISTINCT FROM ${sql.raw("excluded.side")}
        OR ${transactions.instrumentId} IS DISTINCT FROM ${sql.raw("excluded.instrument_id")}
        OR ${transactions.quantity} IS DISTINCT FROM ${sql.raw("excluded.quantity")}
        OR ${transactions.unitPrice} IS DISTINCT FROM ${sql.raw("excluded.unit_price")}
        OR ${transactions.currency} IS DISTINCT FROM ${sql.raw("excluded.currency")}
        OR ${transactions.unitPriceEur} IS DISTINCT FROM ${sql.raw("excluded.unit_price_eur")}
        OR ${transactions.portfolioId} IS DISTINCT FROM ${sql.raw("excluded.portfolio_id")}
      )`,
    })
    .returning({ id: transactions.id });

  const processed = values.length;
  const changed = written.length;
  const unchanged = processed - changed;

  return c.json({ ok: true, processed, changed, unchanged });
});

const cashCurrencySchema = z.enum(
  SUPPORTED_CASH_CURRENCY_CODES as unknown as [string, ...string[]],
);

const instrumentIn = z.discriminatedUnion("kind", [
  z.object({
    kind: z.enum(["etf", "stock"]),
    yahooSymbol: z.string().min(1).transform(normalizeYahooSymbolForStorage),
    holdingsDistributionUrl: z.string().optional(),
  }),
  z.object({
    kind: z.literal("custom"),
    brokerId: z.number().int().positive(),
    seligsonFid: z.number().int().positive(),
  }),
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
  })
  .refine((o) => o.holdingsDistributionUrl !== undefined, {
    message: "At least one field is required",
  });

/** Cash accounts and ETF/stock accept PATCH. */
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
                countryHtml: seligsonRow.countryHtml,
                otherDistributionHtml: seligsonRow.otherDistributionHtml,
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
      distribution: distributions,
      yahooFinanceCache: yahooFinanceCache,
      seligsonDistributionCache: seligsonDistributionCache,
      providerHoldingsCache: providerHoldingsCache,
      seligsonFund: seligsonFunds,
      broker: brokers,
    })
    .from(instruments)
    .leftJoin(distributions, eq(instruments.id, distributions.instrumentId))
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
  return mapJoinedRowToInstrumentPayload(row, netQuantity);
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
      distribution: distributions,
      yahooFinanceCache: yahooFinanceCache,
      seligsonDistributionCache: seligsonDistributionCache,
      providerHoldingsCache: providerHoldingsCache,
      seligsonFund: seligsonFunds,
      broker: brokers,
    })
    .from(instruments)
    .leftJoin(distributions, eq(instruments.id, distributions.instrumentId))
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
      row,
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

app.post("/instruments", zValidator("json", instrumentIn), async (c) => {
  const body = c.req.valid("json");

  if (body.kind === "etf" || body.kind === "stock") {
    try {
      if (
        body.holdingsDistributionUrl != null &&
        body.holdingsDistributionUrl.trim().length > 0
      ) {
        const v = validateHoldingsDistributionUrl(body.holdingsDistributionUrl);
        if (!v.ok) {
          return c.json({ message: v.message }, 400);
        }
      }
      const row = await insertEtfStockFromYahoo(body.kind, body.yahooSymbol, {
        holdingsDistributionUrl:
          body.holdingsDistributionUrl != null &&
          body.holdingsDistributionUrl.trim().length > 0
            ? body.holdingsDistributionUrl
            : null,
      });
      return c.json(row, 201);
    } catch (e) {
      const { message, status } = formatYahooUpstreamError(e);
      return c.json({ message }, status);
    }
  }

  if (body.kind === "custom") {
    const [br] = await db
      .select()
      .from(brokers)
      .where(eq(brokers.id, body.brokerId));
    if (!br) {
      return c.json({ message: "Broker not found" }, 404);
    }
    if (br.brokerType !== "seligson") {
      return c.json(
        { message: "Custom instruments require a Seligson-type broker" },
        400,
      );
    }
    let fund: Awaited<ReturnType<typeof findOrCreateSeligsonFundByFid>>;
    try {
      fund = await findOrCreateSeligsonFundByFid(body.seligsonFid);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return c.json({ message }, 502);
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
    const v = validateHoldingsDistributionUrl(body.holdingsDistributionUrl);
    if (!v.ok) {
      return c.json({ message: v.message }, 400);
    }
    const prevValidated = validateHoldingsDistributionUrl(
      existing.holdingsDistributionUrl,
    );
    const prevNorm = prevValidated.ok ? prevValidated.normalized : null;
    const nextNorm = v.normalized;
    await db
      .update(instruments)
      .set({ holdingsDistributionUrl: v.normalized })
      .where(eq(instruments.id, id));
    if (prevNorm !== nextNorm) {
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

  return c.json(
    {
      message:
        "Unsupported instrument kind for PATCH (only cash accounts and ETF/stock)",
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

app.get("/distribution-cache/:instrumentId", async (c) => {
  const instrumentId = Number.parseInt(c.req.param("instrumentId"), 10);
  const [dist] = await db
    .select()
    .from(distributions)
    .where(eq(distributions.instrumentId, instrumentId));
  const [yfc] = await db
    .select()
    .from(yahooFinanceCache)
    .where(eq(yahooFinanceCache.instrumentId, instrumentId));
  const [sdc] = await db
    .select()
    .from(seligsonDistributionCache)
    .where(eq(seligsonDistributionCache.instrumentId, instrumentId));
  if (!dist && !yfc && !sdc) {
    return c.json(null);
  }
  return c.json({
    distributions: dist ?? null,
    yahooFinanceCache: yfc ?? null,
    seligsonDistributionCache: sdc ?? null,
  });
});

if (devToolsAllowed()) {
  app.get("/dev/yahoo", async (c) => {
    const symbol = c.req.query("symbol");
    if (!symbol) {
      return c.json({ error: "symbol required" }, 400);
    }
    try {
      const raw = await fetchYahooQuoteSummaryRaw(symbol);
      const normalized = normalizeYahooDistribution(raw, symbol);
      return c.json({
        raw,
        normalized: normalized.payload,
        notes: normalized.notes,
      });
    } catch (e) {
      const { message, status } = formatYahooUpstreamError(e);
      return c.json({ error: message }, status);
    }
  });

  app.get("/dev/seligson", async (c) => {
    const fidRaw = c.req.query("fid");
    if (!fidRaw) {
      return c.json({ error: "fid required" }, 400);
    }
    const fid = Number.parseInt(fidRaw, 10);
    try {
      const [html40, html20] = await Promise.all([
        fetchSeligsonHtml(fid, 40),
        fetchSeligsonHtml(fid, 20),
      ]);
      const parsed = parseSeligsonDistributions(html40, html20);
      return c.json({
        html40Length: html40.length,
        html20Length: html20.length,
        ...parsed,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return c.json({ error: message }, 500);
    }
  });
}

const port = Number.parseInt(process.env.PORT ?? "3001", 10);

async function start(): Promise<void> {
  await runDevMigrations();

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
