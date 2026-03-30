import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "@investments/db";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
config({ path: resolve(repoRoot, ".env") });

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });
export type DbClient = typeof db;
export { pool };
