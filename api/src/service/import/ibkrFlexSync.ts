import { ibkrFlexSyncs } from "@investments/db";
import { USER_ID } from "@investments/lib/appUser";
import type {
  IbkrFlexSyncError,
  IbkrFlexSyncStatus,
} from "@investments/lib/ibkrFlexSync";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { z } from "zod";
import { db } from "../../db.js";
import { fetchIbkrFlexReport } from "../../import/ibkrFlexClient.js";
import { validJson } from "../../lib/honoValidJson.js";
import { resolvePortfolioIdFromImportBody } from "../portfolio/portfolioAccess.js";
import {
  EMPTY_IMPORT_COUNTS,
  type IbkrImportCounts,
  importIbkrCsvText,
} from "./ibkrImport.js";
import { resolveImportBrokerFromBody } from "./resolveImportBroker.js";

const SYNC_INTERVAL_MS = 60 * 60 * 1000;

type IbkrFlexSyncRow = typeof ibkrFlexSyncs.$inferSelect;

type SyncResult =
  | { ok: true; counts: IbkrImportCounts }
  | { ok: false; error: IbkrFlexSyncError };

const runningUserIds = new Set<number>();

function sumCounts(a: IbkrImportCounts, b: IbkrImportCounts): IbkrImportCounts {
  return {
    processed: a.processed + b.processed,
    changed: a.changed + b.changed,
    unchanged: a.unchanged + b.unchanged,
    added: a.added + b.added,
    updated: a.updated + b.updated,
  };
}

async function syncQuery(
  row: IbkrFlexSyncRow,
  queryId: string,
): Promise<SyncResult> {
  let csvText: string;
  try {
    csvText = await fetchIbkrFlexReport(row.token, queryId);
  } catch (e) {
    return {
      ok: false,
      error: { message: e instanceof Error ? e.message : String(e), queryId },
    };
  }
  if (csvText.trim() === "") {
    return { ok: true, counts: EMPTY_IMPORT_COUNTS };
  }
  const outcome = await importIbkrCsvText(
    csvText,
    { brokerId: String(row.brokerId), portfolioId: String(row.portfolioId) },
    { allowEmpty: true },
  );
  if (outcome.status !== 200) {
    return { ok: false, error: { ...outcome.body, queryId } };
  }
  const { processed, changed, unchanged, added, updated } = outcome.body;
  return {
    ok: true,
    counts: { processed, changed, unchanged, added, updated },
  };
}

/** Runs the queries in order and stops at the first failure; earlier queries stay imported. */
async function syncRow(row: IbkrFlexSyncRow): Promise<SyncResult> {
  const result = await row.queryIds.reduce<Promise<SyncResult>>(
    async (prevPromise, queryId) => {
      const prev = await prevPromise;
      if (!prev.ok) {
        return prev;
      }
      const next = await syncQuery(row, queryId);
      return next.ok
        ? { ok: true, counts: sumCounts(prev.counts, next.counts) }
        : next;
    },
    Promise.resolve({ ok: true, counts: EMPTY_IMPORT_COUNTS }),
  );
  const now = new Date();
  await db
    .update(ibkrFlexSyncs)
    .set({
      lastRunAt: now,
      ...(result.ok ? { lastSuccessAt: now } : {}),
      lastError: result.ok ? null : result.error,
      updatedAt: now,
    })
    .where(eq(ibkrFlexSyncs.id, row.id));
  return result;
}

/** Returns null when a sync for the same user is already running. */
async function syncRowExclusive(
  row: IbkrFlexSyncRow,
): Promise<SyncResult | null> {
  if (runningUserIds.has(row.userId)) {
    return null;
  }
  runningUserIds.add(row.userId);
  try {
    return await syncRow(row);
  } finally {
    runningUserIds.delete(row.userId);
  }
}

async function syncAllConfigured(): Promise<void> {
  const rows = await db.select().from(ibkrFlexSyncs);
  for (const row of rows) {
    try {
      const result = await syncRowExclusive(row);
      if (result != null && !result.ok) {
        console.error(
          `IBKR Flex sync failed for user ${row.userId}`,
          result.error,
        );
      }
    } catch (e) {
      console.error(`IBKR Flex sync crashed for user ${row.userId}`, e);
    }
  }
}

/** Syncs every configured user right away and then hourly while the API runs. */
export function startIbkrFlexSyncSchedule(): void {
  setImmediate(() => {
    void syncAllConfigured();
  });
  setInterval(() => {
    void syncAllConfigured();
  }, SYNC_INTERVAL_MS);
}

async function loadRowForUser(): Promise<IbkrFlexSyncRow | null> {
  const [row] = await db
    .select()
    .from(ibkrFlexSyncs)
    .where(eq(ibkrFlexSyncs.userId, USER_ID))
    .limit(1);
  return row ?? null;
}

function toStatus(row: IbkrFlexSyncRow | null): IbkrFlexSyncStatus {
  return {
    configured: row != null,
    queryIds: row?.queryIds ?? [],
    brokerId: row?.brokerId ?? null,
    portfolioId: row?.portfolioId ?? null,
    running: runningUserIds.has(USER_ID),
    lastRunAt: row?.lastRunAt?.toISOString() ?? null,
    lastSuccessAt: row?.lastSuccessAt?.toISOString() ?? null,
    lastError: row?.lastError ?? null,
  };
}

export async function getIbkrFlexSync(c: Context) {
  return c.json(toStatus(await loadRowForUser()));
}

export const ibkrFlexSyncPutIn = z.object({
  /** Omit or leave empty to keep the stored token. */
  token: z.string().trim().optional(),
  queryIds: z.array(z.string().trim().regex(/^\d+$/)).min(1),
  brokerId: z.number().int().positive(),
  portfolioId: z.number().int().positive(),
});

export async function putIbkrFlexSync(c: Context) {
  const body = validJson(c, ibkrFlexSyncPutIn);
  const broker = await resolveImportBrokerFromBody(
    { brokerId: String(body.brokerId) },
    "exchange",
    "IBKR",
  );
  if (!broker.ok) {
    return c.json({ message: broker.message }, broker.status);
  }
  const portfolio = await resolvePortfolioIdFromImportBody({
    portfolioId: String(body.portfolioId),
  });
  if (!portfolio.ok) {
    const status = portfolio.status;
    return c.json(
      { message: portfolio.message },
      status === 400 || status === 404 ? status : 500,
    );
  }
  const existing = await loadRowForUser();
  const token =
    body.token != null && body.token !== "" ? body.token : existing?.token;
  if (token == null) {
    return c.json({ message: "Token is required" }, 400);
  }
  const values = {
    userId: USER_ID,
    brokerId: broker.broker.id,
    portfolioId: portfolio.portfolioId,
    token,
    queryIds: body.queryIds,
  };
  const [row] = await db
    .insert(ibkrFlexSyncs)
    .values(values)
    .onConflictDoUpdate({
      target: ibkrFlexSyncs.userId,
      set: { ...values, updatedAt: new Date() },
    })
    .returning();
  return c.json(toStatus(row ?? null));
}

export async function deleteIbkrFlexSync(c: Context) {
  await db.delete(ibkrFlexSyncs).where(eq(ibkrFlexSyncs.userId, USER_ID));
  return c.json(toStatus(null));
}

/** Runs the sync now. Returns 409 while another sync is running; failures are in `status.lastError`. */
export async function postIbkrFlexSyncRun(c: Context) {
  const row = await loadRowForUser();
  if (row == null) {
    return c.json({ message: "IBKR Flex sync is not configured" }, 404);
  }
  const result = await syncRowExclusive(row);
  if (result == null) {
    return c.json({ message: "IBKR Flex sync is already running" }, 409);
  }
  return c.json({
    status: toStatus(await loadRowForUser()),
    counts: result.ok ? result.counts : null,
  });
}
