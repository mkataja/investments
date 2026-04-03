/**
 * Load ECB SDW CSV export (Euribor 3-month) into `interest_rates`. Run from repo root:
 * `pnpm --filter @investments/api exec tsx scripts/backfillInterestRatesFromEcbCsv.ts <path-to.csv>`
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { interestRates } from "@investments/db";
import { sql } from "drizzle-orm";
import { db, pool } from "../src/db.js";
import { parseEcbEuribor3mCsv } from "../src/lib/ecbEuribor3mCsv.js";

type InterestRateInsert = typeof interestRates.$inferInsert;

const CHUNK = 250;

function chunkRows<T>(rows: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(rows.length / size) }, (_, j) =>
    rows.slice(j * size, (j + 1) * size),
  );
}

async function main() {
  const pathArg = process.argv[2];
  if (!pathArg) {
    console.error(
      "Usage: pnpm --filter @investments/api exec tsx scripts/backfillInterestRatesFromEcbCsv.ts <path-to-ecb-csv>",
    );
    process.exit(1);
  }

  const absPath = resolve(pathArg);
  const content = readFileSync(absPath, "utf8");
  const parsed = parseEcbEuribor3mCsv(content);
  console.log(`Parsed ${parsed.length} rows from ${absPath}`);

  const chunks = chunkRows(parsed, CHUNK);
  await chunks.reduce<Promise<void>>(
    (prev, chunk) =>
      prev.then(async () => {
        await db
          .insert(interestRates)
          .values(
            chunk.map(
              (r): InterestRateInsert => ({
                indexName: "euribor_3m",
                observationDate: r.observationDate,
                rate: r.rateFraction,
              }),
            ),
          )
          .onConflictDoUpdate({
            target: [interestRates.indexName, interestRates.observationDate],
            set: { rate: sql`excluded.rate` },
          });
      }),
    Promise.resolve(),
  );

  console.log("Upsert complete.");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
