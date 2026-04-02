import type { Context } from "hono";
import type { z } from "zod";

/** For handlers registered after `zValidator("json", schema)`. */
export function validJson<S extends z.ZodTypeAny>(
  c: Context,
  _schema: S,
): z.infer<S> {
  return (
    c as unknown as { req: { valid: (t: "json") => z.infer<S> } }
  ).req.valid("json");
}
