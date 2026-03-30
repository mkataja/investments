import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "./db.js";

/**
 * Applies pending Drizzle migrations before serving. Skips when NODE_ENV is production
 * (deploy pipelines should run `pnpm db:migrate` explicitly).
 */
export async function runDevMigrations(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    return;
  }
  const migrationsFolder = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../db/migrations",
  );
  await migrate(db, { migrationsFolder });
}
