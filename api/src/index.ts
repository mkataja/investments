import { serve } from "@hono/node-server";
import { zValidator } from "@hono/zod-validator";
import {
  type BrokerType,
  SUPPORTED_CASH_CURRENCY_CODES,
  brokers,
  distributionCache,
  instruments,
  isInstrumentKindAllowedForBrokerType,
  normalizeCashAccountIsoCountryCode,
  normalizeYahooSymbolForStorage,
  seligsonFunds,
  transactions,
} from "@investments/db";
import { asc, count, desc, eq, inArray, sql } from "drizzle-orm";
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
import {
  refreshDistributionCacheForInstrumentId,
  refreshStaleDistributionCaches,
  writeSeligsonDistributionCache,
} from "./lib/cacheRefresh.js";
import { insertEtfStockFromYahoo } from "./lib/createYahooInstrument.js";
import { getPortfolioDistributions } from "./lib/portfolio.js";
import { loadOpenPositions } from "./lib/positions.js";
import { formatYahooUpstreamError } from "./lib/yahooUpstream.js";
import { seedBrokers } from "./seed.js";

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
    .where(eq(brokers.name, name))
    .limit(1);
  if (dup) {
    return c.json({ message: "A broker with this name already exists" }, 409);
  }
  const [row] = await db
    .insert(brokers)
    .values({ name, brokerType: body.brokerType })
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
      .where(eq(brokers.name, nextName))
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
  brokerId: z.number().int().positive(),
  tradeDate: z.string(),
  side: z.enum(["buy", "sell"]),
  instrumentId: z.number().int().positive(),
  quantity: z.string().or(z.number()),
  unitPrice: z.string().or(z.number()),
  currency: z.string().min(3).max(3),
  unitPriceEur: z.string().or(z.number()).optional(),
});

app.get("/transactions", async (c) => {
  const rows = await db
    .select()
    .from(transactions)
    .orderBy(desc(transactions.tradeDate));
  return c.json(rows);
});

app.post("/transactions", zValidator("json", transactionIn), async (c) => {
  const body = c.req.valid("json");
  const [row] = await db
    .insert(transactions)
    .values({
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
    .where(eq(brokers.name, "Degiro"))
    .limit(1);
  if (!degiroBroker) {
    return c.json({ message: 'Broker named "Degiro" is not configured' }, 500);
  }

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
      brokerId: degiroBroker.id,
      tradeDate: r.tradeDate,
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
  }),
  z.object({
    kind: z.literal("custom"),
    brokerId: z.number().int().positive(),
    seligsonFid: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal("cash_account"),
    brokerId: z.number().int().positive(),
    displayName: z.string().min(1),
    currency: cashCurrencySchema,
    cashGeoKey: z
      .string()
      .trim()
      .min(1)
      .transform((s) => normalizeCashAccountIsoCountryCode(s))
      .refine((s): s is string => s !== null, {
        message:
          "cashGeoKey must be a valid ISO 3166-1 alpha-2 country code (e.g. FI, US)",
      }),
  }),
]);

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
  const brokerIdRaw = c.req.query("brokerId")?.trim();
  let brokerTypeForFilter: string | null = null;
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
  }

  const joined = await db
    .select({
      instrument: instruments,
      cache: distributionCache,
      seligsonFund: seligsonFunds,
      broker: brokers,
    })
    .from(instruments)
    .leftJoin(
      distributionCache,
      eq(instruments.id, distributionCache.instrumentId),
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
    .groupBy(transactions.instrumentId);

  const netQtyByInstrument = new Map<number, number>();
  for (const r of qtyRows) {
    const q = Number.parseFloat(r.qty);
    if (Number.isFinite(q)) {
      netQtyByInstrument.set(r.instrumentId, q);
    }
  }

  let payload = joined.map(
    ({ instrument, cache, seligsonFund: fund, broker: br }) => ({
      ...instrument,
      netQuantity: netQtyByInstrument.get(instrument.id) ?? 0,
      distribution: cache
        ? {
            fetchedAt: cache.fetchedAt,
            source: cache.source,
            payload: cache.payload,
            rawPayload: cache.rawPayload ?? null,
          }
        : null,
      seligsonFund: fund
        ? { id: fund.id, fid: fund.fid, name: fund.name }
        : null,
      broker: br
        ? {
            id: br.id,
            name: br.name,
            brokerType: br.brokerType,
          }
        : null,
    }),
  );

  if (brokerTypeForFilter != null) {
    payload = payload.filter((row) =>
      isInstrumentKindAllowedForBrokerType(
        brokerTypeForFilter as BrokerType,
        row.kind,
      ),
    );
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

app.post("/instruments", zValidator("json", instrumentIn), async (c) => {
  const body = c.req.valid("json");

  if (body.kind === "etf" || body.kind === "stock") {
    try {
      const row = await insertEtfStockFromYahoo(body.kind, body.yahooSymbol);
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
    const [row] = await db
      .insert(instruments)
      .values({
        kind: "cash_account",
        displayName: body.displayName,
        cashCurrency: body.currency,
        cashGeoKey: body.cashGeoKey,
        brokerId: body.brokerId,
      })
      .returning();
    return c.json(row, 201);
  }

  return c.json({ message: "Unsupported instrument kind" }, 400);
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
  return c.json({ ok: true }, 200);
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
    await tx
      .delete(distributionCache)
      .where(eq(distributionCache.instrumentId, id));
    await tx.delete(instruments).where(eq(instruments.id, id));
  });
  return c.body(null, 204);
});

app.get("/positions", async (c) => {
  const pos = await loadOpenPositions();
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
  const data = await getPortfolioDistributions();
  return c.json(data);
});

app.get("/distribution-cache/:instrumentId", async (c) => {
  const instrumentId = Number.parseInt(c.req.param("instrumentId"), 10);
  const [row] = await db
    .select()
    .from(distributionCache)
    .where(eq(distributionCache.instrumentId, instrumentId));
  if (!row) {
    return c.json(null);
  }
  return c.json(row);
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

seedBrokers()
  .then(() => {
    setImmediate(() => {
      void refreshStaleDistributionCaches();
    });
  })
  .catch(console.error);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`);
});
