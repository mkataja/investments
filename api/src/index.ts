import { serve } from "@hono/node-server";
import { zValidator } from "@hono/zod-validator";
import {
  SUPPORTED_CASH_CURRENCY_CODES,
  brokers,
  distributionCache,
  instruments,
  seligsonFunds,
  transactions,
} from "@investments/db";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
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
import {
  refreshDistributionCacheForInstrumentId,
  refreshStaleDistributionCaches,
  writeSeligsonDistributionCache,
  writeYahooDistributionCache,
} from "./lib/cacheRefresh.js";
import { getPortfolioDistributions } from "./lib/portfolio.js";
import { loadOpenPositions } from "./lib/positions.js";
import { seedBrokers } from "./seed.js";

const app = new Hono();

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

const cashCurrencySchema = z.enum(
  SUPPORTED_CASH_CURRENCY_CODES as unknown as [string, ...string[]],
);

const instrumentIn = z.discriminatedUnion("kind", [
  z.object({
    kind: z.enum(["etf", "stock"]),
    yahooSymbol: z.string().min(1),
  }),
  z.object({
    kind: z.literal("seligson_fund"),
    seligsonFid: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal("cash_account"),
    displayName: z.string().min(1),
    currency: cashCurrencySchema,
    cashGeoKey: z.string().optional(),
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
  const joined = await db
    .select({
      instrument: instruments,
      cache: distributionCache,
      seligsonFund: seligsonFunds,
    })
    .from(instruments)
    .leftJoin(
      distributionCache,
      eq(instruments.id, distributionCache.instrumentId),
    )
    .leftJoin(seligsonFunds, eq(instruments.seligsonFundId, seligsonFunds.id))
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

  const payload = joined.map(({ instrument, cache, seligsonFund: fund }) => ({
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
    seligsonFund: fund ? { id: fund.id, fid: fund.fid, name: fund.name } : null,
  }));

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
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ message }, 502);
  }
});

app.post("/instruments", zValidator("json", instrumentIn), async (c) => {
  const body = c.req.valid("json");

  if (body.kind === "etf" || body.kind === "stock") {
    let raw: Awaited<ReturnType<typeof fetchYahooQuoteSummaryRaw>>;
    try {
      raw = await fetchYahooQuoteSummaryRaw(body.yahooSymbol);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return c.json({ message }, 502);
    }
    const lookup = buildYahooInstrumentLookup(raw, body.yahooSymbol);
    const displayName = displayNameFromYahooLookup(lookup, body.yahooSymbol);
    const [row] = await db
      .insert(instruments)
      .values({
        kind: body.kind,
        displayName,
        yahooSymbol: body.yahooSymbol,
        isin: lookup.isin ?? undefined,
      })
      .returning();
    if (!row) {
      return c.json({ message: "Failed to insert instrument" }, 500);
    }
    try {
      await writeYahooDistributionCache(row.id, raw, body.yahooSymbol);
    } catch (e) {
      await db.delete(instruments).where(eq(instruments.id, row.id));
      const message = e instanceof Error ? e.message : String(e);
      return c.json({ message }, 502);
    }
    return c.json(row, 201);
  }

  if (body.kind === "seligson_fund") {
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
        kind: "seligson_fund",
        displayName: fund.name,
        seligsonFundId: fund.id,
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
    const [row] = await db
      .insert(instruments)
      .values({
        kind: "cash_account",
        displayName: body.displayName,
        cashCurrency: body.currency,
        cashGeoKey: body.cashGeoKey ?? undefined,
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
    return c.json({ message: result.error }, 502);
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
      const message = e instanceof Error ? e.message : String(e);
      return c.json({ error: message }, 500);
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
