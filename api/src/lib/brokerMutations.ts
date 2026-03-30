import { brokerCodeFromDefaultName, brokers } from "@investments/db";
import { and, eq, ne } from "drizzle-orm";
import { db } from "../db.js";

export function normalizeBrokerCodeInput(code: string): string {
  return code
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_")
    .replace(/^_+|_+$/g, "");
}

export async function allocateUniqueBrokerCode(base: string): Promise<string> {
  let candidate = base;
  let suffix = 0;
  for (;;) {
    const [row] = await db
      .select({ id: brokers.id })
      .from(brokers)
      .where(eq(brokers.code, candidate))
      .limit(1);
    if (!row) {
      return candidate;
    }
    suffix += 1;
    candidate = `${base}_${suffix}`;
  }
}

export type ResolveBrokerCodeCreateResult =
  | { ok: true; code: string }
  | { ok: false; error: "code_taken"; code: string };

export async function resolveBrokerCodeForCreate(
  name: string,
  codeOverride: string | null | undefined,
): Promise<ResolveBrokerCodeCreateResult> {
  const trimmed = codeOverride?.trim() ?? "";
  if (trimmed.length > 0) {
    const code = normalizeBrokerCodeInput(trimmed);
    if (code.length === 0) {
      return {
        ok: true,
        code: await allocateUniqueBrokerCode(brokerCodeFromDefaultName(name)),
      };
    }
    const [existing] = await db
      .select({ id: brokers.id })
      .from(brokers)
      .where(eq(brokers.code, code))
      .limit(1);
    if (existing) {
      return { ok: false, error: "code_taken", code };
    }
    return { ok: true, code };
  }
  return {
    ok: true,
    code: await allocateUniqueBrokerCode(brokerCodeFromDefaultName(name)),
  };
}

export async function assertBrokerCodeAvailableForUpdate(
  brokerId: number,
  newCode: string,
): Promise<true | { error: "code_taken"; code: string }> {
  const [existing] = await db
    .select({ id: brokers.id })
    .from(brokers)
    .where(and(eq(brokers.code, newCode), ne(brokers.id, brokerId)))
    .limit(1);
  if (existing) {
    return { error: "code_taken", code: newCode };
  }
  return true;
}
