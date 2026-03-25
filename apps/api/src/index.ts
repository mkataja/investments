import { serve } from "@hono/node-server";
import { zValidator } from "@hono/zod-validator";
import {
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
  fetchSeligsonHtml,
  parseSeligsonDistributions,
} from "./distributions/seligson.js";
import {
  fetchYahooQuoteSummaryRaw,
  normalizeYahooDistribution,
} from "./distributions/yahoo.js";
import { refreshStaleDistributionCaches } from "./lib/cacheRefresh.js";
import { getPortfolioDistributions } from "./lib/portfolio.js";
import { loadOpenPositions } from "./lib/positions.js";
import { seedBrokers } from "./seed.js";

const app = new Hono();

app.use(
  "/*",
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    exposeHeaders: ["Content-Range"],
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

const instrumentIn = z.object({
  kind: z.enum(["etf", "stock", "seligson_fund", "cash_account"]),
  displayName: z.string().min(1),
  yahooSymbol: z.string().optional(),
  isin: z.string().optional(),
  seligsonFundId: z.number().int().positive().optional().nullable(),
  cashGeoKey: z.string().optional(),
  cashInterestType: z.string().optional(),
  markPriceEur: z.string().or(z.number()).optional().nullable(),
});

app.get("/instruments", async (c) => {
  const rows = await db.select().from(instruments).orderBy(asc(instruments.id));
  return c.json(rows);
});

app.post("/instruments", zValidator("json", instrumentIn), async (c) => {
  const body = c.req.valid("json");
  const [row] = await db
    .insert(instruments)
    .values({
      kind: body.kind,
      displayName: body.displayName,
      yahooSymbol: body.yahooSymbol ?? undefined,
      isin: body.isin ?? undefined,
      seligsonFundId: body.seligsonFundId ?? undefined,
      cashGeoKey: body.cashGeoKey ?? undefined,
      cashInterestType: body.cashInterestType ?? undefined,
      markPriceEur:
        body.markPriceEur != null ? String(body.markPriceEur) : undefined,
    })
    .returning();
  return c.json(row, 201);
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

/** React Admin: seligson-funds */
app.get("/seligson-funds", async (c) => {
  const sort = JSON.parse(c.req.query("sort") ?? '["id","ASC"]') as [
    string,
    string,
  ];
  const range = JSON.parse(c.req.query("range") ?? "[0,24]") as [
    number,
    number,
  ];
  const [start, end] = range;
  const limit = end - start + 1;
  const col = sort[0] === "id" ? seligsonFunds.id : seligsonFunds.id;
  const orderFn = sort[1] === "DESC" ? desc : asc;
  const rows = await db
    .select()
    .from(seligsonFunds)
    .orderBy(orderFn(col))
    .limit(limit)
    .offset(start);
  const countRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(seligsonFunds);
  const count = countRows[0]?.count ?? 0;
  c.header("Content-Range", `seligson-funds ${start}-${end}/${count}`);
  return c.json(rows);
});

app.get("/seligson-funds/:id", async (c) => {
  const id = Number.parseInt(c.req.param("id"), 10);
  const [row] = await db
    .select()
    .from(seligsonFunds)
    .where(eq(seligsonFunds.id, id));
  if (!row) {
    return c.json({ message: "Not found" }, 404);
  }
  return c.json(row);
});

const seligsonIn = z.object({
  fid: z.number().int().positive(),
  name: z.string().min(1),
  notes: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

app.post("/seligson-funds", zValidator("json", seligsonIn), async (c) => {
  const body = c.req.valid("json");
  const [row] = await db
    .insert(seligsonFunds)
    .values({
      fid: body.fid,
      name: body.name,
      notes: body.notes ?? undefined,
      isActive: body.isActive ?? true,
    })
    .returning();
  return c.json(row, 201);
});

app.put(
  "/seligson-funds/:id",
  zValidator("json", seligsonIn.partial()),
  async (c) => {
    const id = Number.parseInt(c.req.param("id"), 10);
    const body = c.req.valid("json");
    const [row] = await db
      .update(seligsonFunds)
      .set({
        ...body,
        updatedAt: new Date(),
      })
      .where(eq(seligsonFunds.id, id))
      .returning();
    if (!row) {
      return c.json({ message: "Not found" }, 404);
    }
    return c.json(row);
  },
);

app.delete("/seligson-funds/:id", async (c) => {
  const id = Number.parseInt(c.req.param("id"), 10);
  const [row] = await db
    .delete(seligsonFunds)
    .where(eq(seligsonFunds.id, id))
    .returning();
  if (!row) {
    return c.json({ message: "Not found" }, 404);
  }
  return c.json(row);
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
      const html = await fetchSeligsonHtml(fid);
      const parsed = parseSeligsonDistributions(html);
      return c.json({ htmlLength: html.length, ...parsed });
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
