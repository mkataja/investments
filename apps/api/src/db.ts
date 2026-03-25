import * as schema from "@investments/db";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ??
    "postgresql://investments:investments@localhost:5433/investments",
});

export const db = drizzle(pool, { schema });
export { pool };
