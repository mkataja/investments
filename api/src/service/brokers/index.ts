import { brokers, instruments, transactions } from "@investments/db";
import { USER_ID } from "@investments/lib/appUser";
import { and, asc, count, eq } from "drizzle-orm";
import type { Context } from "hono";
import { z } from "zod";
import { db } from "../../db.js";
import { validJson } from "../../lib/honoValidJson.js";

export const brokerCreateIn = z.object({
  name: z.string().trim().min(1),
  brokerType: z.enum(["exchange", "seligson", "cash_account"]),
});

export const brokerPatchIn = z
  .object({
    name: z.string().trim().min(1).optional(),
    brokerType: z.enum(["exchange", "seligson", "cash_account"]).optional(),
  })
  .refine((o) => o.name != null || o.brokerType != null, {
    message: "At least one field is required",
  });

export async function listBrokers(c: Context) {
  const rows = await db.select().from(brokers).orderBy(asc(brokers.id));
  return c.json(rows);
}

export async function createBroker(c: Context) {
  const body = validJson(c, brokerCreateIn);
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
}

export async function patchBroker(c: Context) {
  const id = Number.parseInt(c.req.param("id") ?? "", 10);
  if (!Number.isFinite(id) || id < 1) {
    return c.json({ message: "Invalid id" }, 400);
  }
  const body = validJson(c, brokerPatchIn);
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
}

export async function deleteBroker(c: Context) {
  const id = Number.parseInt(c.req.param("id") ?? "", 10);
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
}
