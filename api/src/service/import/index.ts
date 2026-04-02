import {
  brokers,
  instruments,
  seligsonFunds,
  transactions,
} from "@investments/db";
import { USER_ID } from "@investments/lib/appUser";
import { normalizeYahooSymbolForStorage } from "@investments/lib/yahooSymbol";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Context } from "hono";
import { z } from "zod";
import { db } from "../../db.js";
import { buildDegiroInstrumentProposals } from "../../import/degiroInstrumentProposals.js";
import { resolveDegiroInstrumentIds } from "../../import/degiroResolveInstruments.js";
import {
  DEGIRO_CSV_EXTERNAL_SOURCE,
  parseDegiroTransactionsCsv,
} from "../../import/degiroTransactions.js";
import { resolveIbkrInstrumentRows } from "../../import/ibkrResolveInstruments.js";
import {
  IBKR_CSV_EXTERNAL_SOURCE,
  parseIbkrTransactionsCsv,
} from "../../import/ibkrTransactions.js";
import {
  SELIGSON_TSV_EXTERNAL_SOURCE,
  normalizeSeligsonFundNameForMatch,
  parseSeligsonTransactionsTsv,
} from "../../import/seligsonTransactions.js";
import { seedIntradayPriceForInstrumentIfMissing } from "../instrument/transactionPriceSeed.js";
import { resolvePortfolioIdFromImportBody } from "../portfolio/portfolioAccess.js";
import { insertEtfStockFromYahoo } from "../yahoo/createYahooInstrument.js";
import { formatYahooUpstreamError } from "../yahoo/yahooUpstream.js";

const createDegiroInstrumentsSchema = z.array(
  z.object({
    isin: z.string().length(12),
    yahooSymbol: z.string().min(1).transform(normalizeYahooSymbolForStorage),
    kind: z.enum(["etf", "stock"]),
  }),
);
export async function postImportDegiro(c: Context) {
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
}

export async function postImportIbkr(c: Context) {
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
    .where(inArray(instruments.kind, ["etf", "stock", "custom", "commodity"]));

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
}

export async function postImportSeligson(c: Context) {
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
}
