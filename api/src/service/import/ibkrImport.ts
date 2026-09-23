import { instruments } from "@investments/db";
import { assignTradeOrderKeysInEncounterOrder } from "@investments/lib/transactionSort";
import { inArray } from "drizzle-orm";
import { db } from "../../db.js";
import { resolveIbkrInstrumentRows } from "../../import/ibkrResolveInstruments.js";
import {
  IBKR_CSV_EXTERNAL_SOURCE,
  parseIbkrTransactionsCsv,
} from "../../import/ibkrTransactions.js";
import { seedIntradayPriceForInstrumentIfMissing } from "../instrument/transactionPriceSeed.js";
import { resolvePortfolioIdFromImportBody } from "../portfolio/portfolioAccess.js";
import {
  deleteTransactionsForBrokerImport,
  parseMultipartBooleanField,
} from "./deleteBeforeImport.js";
import { resolveImportBrokerFromBody } from "./resolveImportBroker.js";
import { upsertImportTransactionsWithCounts } from "./upsertImportTransactions.js";

export type IbkrImportCounts = Awaited<
  ReturnType<typeof upsertImportTransactionsWithCounts>
>;

export const EMPTY_IMPORT_COUNTS: IbkrImportCounts = {
  processed: 0,
  changed: 0,
  unchanged: 0,
  added: 0,
  updated: 0,
};

type IbkrImportOutcome =
  | {
      status: 200;
      body: IbkrImportCounts & { ok: true; deletedOld?: number };
    }
  | {
      status: 400 | 404 | 500;
      body: {
        message: string;
        errors?: string[];
        missingSymbols?: string[];
        ambiguousSymbols?: string[];
        ambiguousIsins?: string[];
        missingIsins?: string[];
      };
    };

/**
 * `body` holds the optional `brokerId`, `portfolioId` and `deleteAllOld` import fields. With
 * `allowEmpty`, a report without trades succeeds with zero counts.
 */
export async function importIbkrCsvText(
  csvText: string,
  body: Record<string, unknown>,
  options: { allowEmpty?: boolean } = {},
): Promise<IbkrImportOutcome> {
  const parsed = parseIbkrTransactionsCsv(csvText);
  if (!parsed.ok) {
    return {
      status: 400,
      body: { message: "CSV validation failed", errors: parsed.errors },
    };
  }
  if (parsed.rows.length === 0) {
    if (options.allowEmpty === true) {
      return { status: 200, body: { ok: true, ...EMPTY_IMPORT_COUNTS } };
    }
    return { status: 400, body: { message: "No transaction rows to import" } };
  }

  const resolvedBroker = await resolveImportBrokerFromBody(
    body,
    "exchange",
    "IBKR",
  );
  if (!resolvedBroker.ok) {
    return {
      status: resolvedBroker.status,
      body: { message: resolvedBroker.message },
    };
  }
  const broker = resolvedBroker.broker;

  const resolvedPortfolio = await resolvePortfolioIdFromImportBody(body);
  if (!resolvedPortfolio.ok) {
    const status = resolvedPortfolio.status;
    return {
      status: status === 400 || status === 404 ? status : 500,
      body: { message: resolvedPortfolio.message },
    };
  }
  const portfolioId = resolvedPortfolio.portfolioId;

  const instRows = await db
    .select()
    .from(instruments)
    .where(inArray(instruments.kind, ["etf", "stock", "custom", "commodity"]));

  const resolved = resolveIbkrInstrumentRows(
    parsed.rows.map((r) => ({ symbolRaw: r.symbolRaw, isin: r.isin })),
    instRows,
  );
  if (!resolved.ok) {
    return {
      status: 400,
      body: {
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
    };
  }

  const { instrumentIds } = resolved;

  assignTradeOrderKeysInEncounterOrder(parsed.rows);

  const values = parsed.rows.map((r, i) => {
    const instrumentId = instrumentIds[i];
    if (instrumentId === undefined) {
      throw new Error(`Missing instrument for row ${i}`);
    }
    return {
      userId: broker.userId,
      portfolioId,
      brokerId: broker.id,
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

  const deleteAllOld = parseMultipartBooleanField(body, "deleteAllOld");
  let deletedOld: number | undefined;
  let counts: IbkrImportCounts;
  if (deleteAllOld) {
    const out = await db.transaction(async (tx) => {
      const n = await deleteTransactionsForBrokerImport(
        tx,
        broker.id,
        broker.userId,
      );
      const c = await upsertImportTransactionsWithCounts(tx, values);
      return { n, c };
    });
    deletedOld = out.n;
    counts = out.c;
  } else {
    counts = await upsertImportTransactionsWithCounts(db, values);
  }

  for (const v of values) {
    await seedIntradayPriceForInstrumentIfMissing(db, v.instrumentId, {
      instrumentId: v.instrumentId,
      tradeDate: v.tradeDate,
      unitPrice: v.unitPrice,
      currency: v.currency,
    });
  }

  return {
    status: 200,
    body: {
      ok: true,
      ...counts,
      ...(deletedOld !== undefined ? { deletedOld } : {}),
    },
  };
}
