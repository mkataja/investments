import {
  holdingCustomBuckets,
  portfolioHoldingBucketAssignments,
} from "@investments/db";
import { USER_ID } from "@investments/lib/appUser";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { Context } from "hono";
import { z } from "zod";
import { type DbOrTx, db } from "../../db.js";
import { validJson } from "../../lib/honoValidJson.js";
import { loadPortfolioOwnedByUser } from "../portfolio/portfolioAccess.js";

/**
 * `PUT /portfolio/holding-bucket` — assign an instrument in a portfolio to a custom bucket, or clear to default (Other).
 * Send neither `bucketId` nor a non-empty `bucketName` to remove the assignment.
 * Do not send both `bucketId` and `bucketName`.
 * Response includes `removedBuckets` when unused custom bucket rows were deleted from the DB.
 */
export const portfolioHoldingBucketPutIn = z
  .object({
    portfolioId: z.number().int().positive(),
    instrumentId: z.number().int().positive(),
    bucketId: z.number().int().positive().optional(),
    bucketName: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const nameTrimmed = data.bucketName?.trim() ?? "";
    const hasName = nameTrimmed.length > 0;
    const hasId = data.bucketId != null;
    if (hasId && hasName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Specify either bucketId or bucketName, not both",
      });
    }
  });

async function getOrCreateBucketIdByName(
  tx: DbOrTx,
  nameTrimmed: string,
): Promise<number> {
  const [existing] = await tx
    .select({ id: holdingCustomBuckets.id })
    .from(holdingCustomBuckets)
    .where(
      and(
        eq(holdingCustomBuckets.userId, USER_ID),
        eq(holdingCustomBuckets.name, nameTrimmed),
      ),
    )
    .limit(1);
  if (existing) {
    return existing.id;
  }
  const [inserted] = await tx
    .insert(holdingCustomBuckets)
    .values({
      userId: USER_ID,
      name: nameTrimmed,
    })
    .returning({ id: holdingCustomBuckets.id });
  if (!inserted) {
    throw new Error("Failed to create bucket");
  }
  return inserted.id;
}

/**
 * Deletes custom buckets for the app user that have no portfolio assignments.
 * Returns rows that were removed (id + name) for the client runtime hint list.
 */
async function deleteUnusedHoldingBucketsReturning(
  tx: DbOrTx,
): Promise<{ id: number; name: string }[]> {
  const rows = await tx
    .select({
      id: holdingCustomBuckets.id,
      name: holdingCustomBuckets.name,
    })
    .from(holdingCustomBuckets)
    .leftJoin(
      portfolioHoldingBucketAssignments,
      eq(portfolioHoldingBucketAssignments.bucketId, holdingCustomBuckets.id),
    )
    .where(
      and(
        eq(holdingCustomBuckets.userId, USER_ID),
        isNull(portfolioHoldingBucketAssignments.portfolioId),
      ),
    );

  const byId = new Map<number, string>();
  for (const r of rows) {
    byId.set(r.id, r.name);
  }
  if (byId.size === 0) {
    return [];
  }
  const ids = [...byId.keys()];
  await tx
    .delete(holdingCustomBuckets)
    .where(
      and(
        eq(holdingCustomBuckets.userId, USER_ID),
        inArray(holdingCustomBuckets.id, ids),
      ),
    );
  return ids.map((id) => ({ id, name: byId.get(id) ?? "" }));
}

/** `GET /holding-buckets` — all named buckets for the app user (sorted by name). */
export async function listHoldingBuckets(c: Context) {
  await deleteUnusedHoldingBucketsReturning(db);
  const rows = await db
    .select({
      id: holdingCustomBuckets.id,
      name: holdingCustomBuckets.name,
    })
    .from(holdingCustomBuckets)
    .where(eq(holdingCustomBuckets.userId, USER_ID))
    .orderBy(asc(holdingCustomBuckets.name));
  return c.json({ buckets: rows });
}

/** `PUT /portfolio/holding-bucket` — body validated by {@link portfolioHoldingBucketPutIn}. */
export async function putPortfolioHoldingBucket(c: Context) {
  const body = validJson(c, portfolioHoldingBucketPutIn);
  const pf = await loadPortfolioOwnedByUser(body.portfolioId);
  if (!pf) {
    return c.json({ message: "Portfolio not found" }, 404);
  }

  const nameTrimmed = body.bucketName?.trim() ?? "";
  const hasName = nameTrimmed.length > 0;
  const hasId = body.bucketId != null;

  if (!hasId && !hasName) {
    await db
      .delete(portfolioHoldingBucketAssignments)
      .where(
        and(
          eq(portfolioHoldingBucketAssignments.portfolioId, body.portfolioId),
          eq(portfolioHoldingBucketAssignments.instrumentId, body.instrumentId),
        ),
      );
    const removedBuckets = await deleteUnusedHoldingBucketsReturning(db);
    return c.json({ ok: true, removedBuckets });
  }

  let resolvedBucketId: number | undefined;
  if (hasId) {
    const bid = body.bucketId;
    if (bid == null) {
      return c.json({ message: "Invalid request" }, 400);
    }
    const [b] = await db
      .select({ id: holdingCustomBuckets.id })
      .from(holdingCustomBuckets)
      .where(
        and(
          eq(holdingCustomBuckets.id, bid),
          eq(holdingCustomBuckets.userId, USER_ID),
        ),
      )
      .limit(1);
    if (!b) {
      return c.json({ message: "Bucket not found" }, 404);
    }
    resolvedBucketId = b.id;
  }

  const removedBuckets = await db.transaction(async (tx) => {
    let bucketId: number;
    if (hasId) {
      if (resolvedBucketId == null) {
        throw new Error("Bucket id missing after validation");
      }
      bucketId = resolvedBucketId;
    } else {
      bucketId = await getOrCreateBucketIdByName(tx, nameTrimmed);
    }

    await tx
      .insert(portfolioHoldingBucketAssignments)
      .values({
        portfolioId: body.portfolioId,
        instrumentId: body.instrumentId,
        bucketId,
      })
      .onConflictDoUpdate({
        target: [
          portfolioHoldingBucketAssignments.portfolioId,
          portfolioHoldingBucketAssignments.instrumentId,
        ],
        set: {
          bucketId,
          updatedAt: new Date(),
        },
      });

    return deleteUnusedHoldingBucketsReturning(tx);
  });

  return c.json({ ok: true, removedBuckets });
}
