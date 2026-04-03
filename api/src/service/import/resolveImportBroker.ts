import { brokers } from "@investments/db";
import { USER_ID } from "@investments/lib/appUser";
import type { BrokerType } from "@investments/lib/brokerTypes";
import { and, eq } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db } from "../../db.js";

type ImportBrokerRow = InferSelectModel<typeof brokers>;

type ResolveImportBrokerResult =
  | { ok: true; broker: ImportBrokerRow }
  | { ok: false; message: string; status: 400 | 404 | 500 };

const TYPE_LABEL: Record<BrokerType, string> = {
  exchange: "exchange",
  seligson: "Seligson",
  cash_account: "cash account",
};

function parseBrokerIdField(raw: unknown): number | null {
  if (raw == null) {
    return null;
  }
  const s = String(raw).trim();
  if (s === "") {
    return null;
  }
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Resolves the target broker for an import multipart body.
 * Optional field `brokerId` selects a row owned by the app user; it must match `expectedBrokerType`.
 * Without `brokerId`, falls back to a broker named `legacyName` (previous fixed-broker behavior).
 */
export async function resolveImportBrokerFromBody(
  body: Record<string, unknown>,
  expectedBrokerType: BrokerType,
  legacyName: string,
): Promise<ResolveImportBrokerResult> {
  const id = parseBrokerIdField(body.brokerId);
  if (id != null) {
    const [row] = await db
      .select()
      .from(brokers)
      .where(and(eq(brokers.id, id), eq(brokers.userId, USER_ID)))
      .limit(1);
    if (!row) {
      return { ok: false, message: "Broker not found", status: 404 };
    }
    if (row.brokerType !== expectedBrokerType) {
      return {
        ok: false,
        message: `Selected broker must be a ${TYPE_LABEL[expectedBrokerType]} broker for this import`,
        status: 400,
      };
    }
    return { ok: true, broker: row };
  }

  const [legacy] = await db
    .select()
    .from(brokers)
    .where(and(eq(brokers.name, legacyName), eq(brokers.userId, USER_ID)))
    .limit(1);
  if (!legacy) {
    return {
      ok: false,
      message: `Broker named "${legacyName}" is not configured`,
      status: 500,
    };
  }
  if (legacy.brokerType !== expectedBrokerType) {
    return {
      ok: false,
      message: `Broker "${legacyName}" must be a ${TYPE_LABEL[expectedBrokerType]} broker for this import`,
      status: 400,
    };
  }
  return { ok: true, broker: legacy };
}
