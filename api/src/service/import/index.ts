import { instruments, seligsonFunds, transactions } from "@investments/db";
import { assignTradeOrderKeysInEncounterOrder } from "@investments/lib/transactionSort";
import { normalizeYahooSymbolForStorage } from "@investments/lib/yahooSymbol";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Context } from "hono";
import { z } from "zod";
import { type DbOrTx, db } from "../../db.js";
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
import {
  SVEA_PASTE_EXTERNAL_SOURCE,
  parseSveaBankPaste,
} from "../../import/sveaTransactions.js";
import { seedIntradayPriceForInstrumentIfMissing } from "../instrument/transactionPriceSeed.js";
import { resolvePortfolioIdFromImportBody } from "../portfolio/portfolioAccess.js";
import { insertEtfStockFromYahoo } from "../yahoo/createYahooInstrument.js";
import { formatYahooUpstreamError } from "../yahoo/yahooUpstream.js";
import {
  deleteTransactionsForBrokerImport,
  deleteTransactionsForSveaCashAccountImport,
  parseMultipartBooleanField,
} from "./deleteBeforeImport.js";
import { resolveImportBrokerFromBody } from "./resolveImportBroker.js";

const createDegiroInstrumentsSchema = z.array(
  z.object({
    isin: z.string().length(12),
    yahooSymbol: z.string().min(1).transform(normalizeYahooSymbolForStorage),
    kind: z.enum(["etf", "stock"]),
  }),
);

type TransactionInsertRow = typeof transactions.$inferInsert;

async function insertImportTransactions(
  client: DbOrTx,
  values: TransactionInsertRow[],
) {
  return client
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
        tradeOrderKey: sql`excluded.trade_order_key`,
      },
      setWhere: sql`(
        ${transactions.tradeDate} IS DISTINCT FROM ${sql.raw("excluded.trade_date")}
        OR ${transactions.side} IS DISTINCT FROM ${sql.raw("excluded.side")}
        OR ${transactions.instrumentId} IS DISTINCT FROM ${sql.raw("excluded.instrument_id")}
        OR ${transactions.quantity} IS DISTINCT FROM ${sql.raw("excluded.quantity")}
        OR ${transactions.unitPrice} IS DISTINCT FROM ${sql.raw("excluded.unit_price")}
        OR ${transactions.currency} IS DISTINCT FROM ${sql.raw("excluded.currency")}
        OR ${transactions.portfolioId} IS DISTINCT FROM ${sql.raw("excluded.portfolio_id")}
        OR ${transactions.tradeOrderKey} IS DISTINCT FROM ${sql.raw("excluded.trade_order_key")}
      )`,
    })
    .returning({ id: transactions.id, externalId: transactions.externalId });
}

async function upsertImportTransactionsWithCounts(
  client: DbOrTx,
  values: TransactionInsertRow[],
): Promise<{
  processed: number;
  changed: number;
  unchanged: number;
  added: number;
  updated: number;
}> {
  const first = values[0];
  if (first === undefined) {
    throw new Error("upsertImportTransactionsWithCounts: empty values");
  }
  const brokerId = first.brokerId;
  const externalSource = first.externalSource;
  if (brokerId == null || externalSource == null) {
    throw new Error(
      "upsertImportTransactionsWithCounts: missing brokerId or externalSource",
    );
  }
  const uniqueIds = [
    ...new Set(
      values.map((v) => v.externalId).filter((id): id is string => id != null),
    ),
  ];
  const existingRows =
    uniqueIds.length === 0
      ? []
      : await client
          .select({ externalId: transactions.externalId })
          .from(transactions)
          .where(
            and(
              eq(transactions.brokerId, brokerId),
              eq(transactions.externalSource, externalSource),
              inArray(transactions.externalId, uniqueIds),
            ),
          );
  const existingBefore = new Set(
    existingRows
      .map((r) => r.externalId)
      .filter((id): id is string => id != null),
  );
  const written = await insertImportTransactions(client, values);
  const returned = new Set(
    written.map((w) => w.externalId).filter((id): id is string => id != null),
  );
  let added = 0;
  let updated = 0;
  for (const v of values) {
    const ext = v.externalId;
    if (ext == null) {
      continue;
    }
    if (returned.has(ext)) {
      if (existingBefore.has(ext)) {
        updated++;
      } else {
        added++;
      }
    }
  }
  const processed = values.length;
  const changed = written.length;
  return {
    processed,
    changed,
    unchanged: processed - changed,
    added,
    updated,
  };
}

/** Multipart: `file`, optional `deleteAllOld` (remove all transactions for the import broker before upsert). */
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

  const resolvedDegiroBroker = await resolveImportBrokerFromBody(
    body,
    "exchange",
    "Degiro",
  );
  if (!resolvedDegiroBroker.ok) {
    return c.json(
      { message: resolvedDegiroBroker.message },
      resolvedDegiroBroker.status,
    );
  }
  const degiroBroker = resolvedDegiroBroker.broker;

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

  assignTradeOrderKeysInEncounterOrder(parsed.rows);

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
      tradeOrderKey: r.tradeOrderKey,
    };
  });

  const deleteAllOld = parseMultipartBooleanField(body, "deleteAllOld");
  let deletedOld: number | undefined;
  let counts: Awaited<ReturnType<typeof upsertImportTransactionsWithCounts>>;
  if (deleteAllOld) {
    const out = await db.transaction(async (tx) => {
      const n = await deleteTransactionsForBrokerImport(
        tx,
        degiroBroker.id,
        degiroBroker.userId,
      );
      const c = await upsertImportTransactionsWithCounts(tx, values);
      return { n, c };
    });
    deletedOld = out.n;
    counts = out.c;
  } else {
    counts = await upsertImportTransactionsWithCounts(db, values);
  }

  const { processed, changed, unchanged, added, updated } = counts;

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
    added,
    updated,
    ...(deletedOld !== undefined ? { deletedOld } : {}),
  });
}

/** Multipart: `file`, optional `deleteAllOld` (remove all transactions for the import broker before upsert). */
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

  const resolvedIbkrBroker = await resolveImportBrokerFromBody(
    body,
    "exchange",
    "IBKR",
  );
  if (!resolvedIbkrBroker.ok) {
    return c.json(
      { message: resolvedIbkrBroker.message },
      resolvedIbkrBroker.status,
    );
  }
  const ibkrBroker = resolvedIbkrBroker.broker;

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

  assignTradeOrderKeysInEncounterOrder(parsed.rows);

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
      tradeOrderKey: r.tradeOrderKey,
    };
  });

  const deleteAllOldIbkr = parseMultipartBooleanField(body, "deleteAllOld");
  let deletedOldIbkr: number | undefined;
  let countsIbkr: Awaited<
    ReturnType<typeof upsertImportTransactionsWithCounts>
  >;
  if (deleteAllOldIbkr) {
    const outIbkr = await db.transaction(async (tx) => {
      const n = await deleteTransactionsForBrokerImport(
        tx,
        ibkrBroker.id,
        ibkrBroker.userId,
      );
      const c = await upsertImportTransactionsWithCounts(tx, values);
      return { n, c };
    });
    deletedOldIbkr = outIbkr.n;
    countsIbkr = outIbkr.c;
  } else {
    countsIbkr = await upsertImportTransactionsWithCounts(db, values);
  }

  const { processed, changed, unchanged, added, updated } = countsIbkr;

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
    added,
    updated,
    ...(deletedOldIbkr !== undefined ? { deletedOld: deletedOldIbkr } : {}),
  });
}

/** Multipart: `file`, optional `deleteAllOld` (remove all transactions for the import broker before upsert). */
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

  const resolvedSeligsonBroker = await resolveImportBrokerFromBody(
    body,
    "seligson",
    "Seligson",
  );
  if (!resolvedSeligsonBroker.ok) {
    return c.json(
      { message: resolvedSeligsonBroker.message },
      resolvedSeligsonBroker.status,
    );
  }
  const seligsonBroker = resolvedSeligsonBroker.broker;

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

  assignTradeOrderKeysInEncounterOrder(rowsForImport);

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
      tradeOrderKey: r.tradeOrderKey,
    };
  });

  const deleteAllOldSg = parseMultipartBooleanField(body, "deleteAllOld");
  let deletedOldSg: number | undefined;
  let countsSg: Awaited<ReturnType<typeof upsertImportTransactionsWithCounts>>;
  if (deleteAllOldSg) {
    const outSg = await db.transaction(async (tx) => {
      const n = await deleteTransactionsForBrokerImport(
        tx,
        seligsonBroker.id,
        seligsonBroker.userId,
      );
      const c = await upsertImportTransactionsWithCounts(tx, values);
      return { n, c };
    });
    deletedOldSg = outSg.n;
    countsSg = outSg.c;
  } else {
    countsSg = await upsertImportTransactionsWithCounts(db, values);
  }

  const { processed, changed, unchanged, added, updated } = countsSg;

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
    added,
    updated,
    ...(skippedRows > 0 ? { skippedRows } : {}),
    ...(deletedOldSg !== undefined ? { deletedOld: deletedOldSg } : {}),
  });
}

/**
 * Multipart: `file` (UTF-8 text of the account paste), optional `portfolioId`, optional `brokerId`
 * (`cash_account` broker), optional `instrumentId` (cash account row for that broker),
 * optional `deleteAllOld` (clears existing transactions for that cash account before import).
 * Without `brokerId`, falls back to a broker named `Svea Bank`.
 * With multiple cash accounts for the broker, `instrumentId` is required; with exactly one, it may be omitted.
 * Amounts are EUR; the chosen instrument must use EUR as cash currency.
 */
export async function postImportSvea(c: Context) {
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
  const pasteText = await (file as File).text();

  const parsed = parseSveaBankPaste(pasteText);
  if (!parsed.ok) {
    return c.json(
      {
        message: parsed.errors.join("\n"),
        errors: parsed.errors,
      },
      400,
    );
  }
  if (parsed.rows.length === 0) {
    return c.json({ message: "No transaction rows to import" }, 400);
  }

  const resolvedSveaBroker = await resolveImportBrokerFromBody(
    body,
    "cash_account",
    "Svea Bank",
  );
  if (!resolvedSveaBroker.ok) {
    return c.json(
      { message: resolvedSveaBroker.message },
      resolvedSveaBroker.status,
    );
  }
  const sveaBroker = resolvedSveaBroker.broker;

  const resolvedPortfolioSv = await resolvePortfolioIdFromImportBody(body);
  if (!resolvedPortfolioSv.ok) {
    const m = resolvedPortfolioSv.message;
    if (resolvedPortfolioSv.status === 400) {
      return c.json({ message: m }, 400);
    }
    if (resolvedPortfolioSv.status === 404) {
      return c.json({ message: m }, 404);
    }
    return c.json({ message: m }, 500);
  }
  const importPortfolioIdSv = resolvedPortfolioSv.portfolioId;

  const instrumentIdRaw = body.instrumentId;
  let requestedCashInstrumentId: number | null = null;
  if (instrumentIdRaw != null && String(instrumentIdRaw).trim() !== "") {
    const n = Number.parseInt(String(instrumentIdRaw).trim(), 10);
    if (!Number.isFinite(n) || n < 1) {
      return c.json({ message: "Invalid instrumentId" }, 400);
    }
    requestedCashInstrumentId = n;
  }

  const cashInstRows = await db
    .select()
    .from(instruments)
    .where(
      and(
        eq(instruments.brokerId, sveaBroker.id),
        eq(instruments.kind, "cash_account"),
      ),
    );

  if (cashInstRows.length === 0) {
    return c.json(
      {
        message: `No cash account instrument. Add one EUR cash account under Instruments, linked to broker "${sveaBroker.name}".`,
      },
      400,
    );
  }

  let cashInst: (typeof cashInstRows)[number];
  if (requestedCashInstrumentId != null) {
    const row = cashInstRows.find((r) => r.id === requestedCashInstrumentId);
    if (row === undefined) {
      return c.json(
        {
          message:
            "instrumentId is not a cash account instrument for this broker",
        },
        400,
      );
    }
    cashInst = row;
  } else if (cashInstRows.length === 1) {
    const row = cashInstRows[0];
    if (row === undefined) {
      return c.json({ message: "No cash account instrument" }, 500);
    }
    cashInst = row;
  } else {
    return c.json(
      {
        message:
          "This broker has multiple cash accounts. Pass instrumentId to choose which one to import into.",
      },
      400,
    );
  }

  const cashCcy = cashInst.cashCurrency?.trim().toUpperCase() ?? "";
  if (cashCcy !== "EUR") {
    return c.json(
      {
        message:
          "Svea paste amounts are EUR. Use a EUR cash account instrument.",
      },
      400,
    );
  }

  const instrumentId = cashInst.id;

  assignTradeOrderKeysInEncounterOrder(parsed.rows);

  const values = parsed.rows.map((r) => ({
    userId: sveaBroker.userId,
    portfolioId: importPortfolioIdSv,
    brokerId: sveaBroker.id,
    tradeDate: new Date(r.tradeDate),
    side: r.side,
    instrumentId,
    quantity: r.quantity,
    unitPrice: r.unitPrice,
    currency: r.currency,
    externalSource: SVEA_PASTE_EXTERNAL_SOURCE,
    externalId: r.externalId,
    tradeOrderKey: r.tradeOrderKey,
  }));

  const deleteAllOldSv = parseMultipartBooleanField(body, "deleteAllOld");
  let deletedOldSv: number | undefined;
  let countsSv: Awaited<ReturnType<typeof upsertImportTransactionsWithCounts>>;
  if (deleteAllOldSv) {
    const outSv = await db.transaction(async (tx) => {
      const n = await deleteTransactionsForSveaCashAccountImport(
        tx,
        sveaBroker.id,
        sveaBroker.userId,
        instrumentId,
      );
      const c = await upsertImportTransactionsWithCounts(tx, values);
      return { n, c };
    });
    deletedOldSv = outSv.n;
    countsSv = outSv.c;
  } else {
    countsSv = await upsertImportTransactionsWithCounts(db, values);
  }

  const { processed, changed, unchanged, added, updated } = countsSv;

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
    added,
    updated,
    ...(deletedOldSv !== undefined ? { deletedOld: deletedOldSv } : {}),
  });
}
