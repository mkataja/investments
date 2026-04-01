CREATE TYPE "price_type" AS ENUM ('intraday', 'close');
--> statement-breakpoint
ALTER TABLE "prices" ADD COLUMN "price_date" date;
--> statement-breakpoint
ALTER TABLE "prices" ADD COLUMN "price_type" "price_type";
--> statement-breakpoint
UPDATE "prices" SET
  "price_date" = ("fetched_at" AT TIME ZONE 'UTC')::date,
  "price_type" = 'close'
WHERE "price_date" IS NULL;
--> statement-breakpoint
ALTER TABLE "prices" ALTER COLUMN "price_date" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "prices" ALTER COLUMN "price_type" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "prices" DROP CONSTRAINT "prices_pkey";
--> statement-breakpoint
ALTER TABLE "prices" ADD PRIMARY KEY ("instrument_id", "price_date");
--> statement-breakpoint
CREATE INDEX "prices_instrument_id_price_date_desc_idx" ON "prices" ("instrument_id", "price_date" DESC);
--> statement-breakpoint
ALTER TABLE "distributions" ADD COLUMN "snapshot_date" date;
--> statement-breakpoint
UPDATE "distributions" SET
  "snapshot_date" = ("fetched_at" AT TIME ZONE 'UTC')::date
WHERE "snapshot_date" IS NULL;
--> statement-breakpoint
ALTER TABLE "distributions" ALTER COLUMN "snapshot_date" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "distributions" DROP CONSTRAINT "distributions_pkey";
--> statement-breakpoint
ALTER TABLE "distributions" ADD PRIMARY KEY ("instrument_id", "snapshot_date");
--> statement-breakpoint
CREATE INDEX "distributions_instrument_id_snapshot_date_desc_idx" ON "distributions" ("instrument_id", "snapshot_date" DESC);
--> statement-breakpoint
INSERT INTO "prices" (
  "instrument_id",
  "price_date",
  "quoted_price",
  "currency",
  "fetched_at",
  "source",
  "price_type",
  "created_at",
  "updated_at"
)
SELECT
  sq."instrument_id",
  sq."price_date",
  sq."unit_price",
  sq."currency",
  sq."trade_ts",
  'transaction_seed',
  'intraday'::"price_type",
  NOW(),
  NOW()
FROM (
  SELECT DISTINCT ON (t."instrument_id", (t."trade_date" AT TIME ZONE 'UTC')::date)
    t."instrument_id",
    (t."trade_date" AT TIME ZONE 'UTC')::date AS "price_date",
    t."unit_price",
    t."currency",
    t."trade_date" AS "trade_ts"
  FROM "transactions" t
  INNER JOIN "instruments" i ON i."id" = t."instrument_id"
  WHERE i."kind" <> 'cash_account'
  ORDER BY t."instrument_id", (t."trade_date" AT TIME ZONE 'UTC')::date, t."trade_date" DESC
) sq
ON CONFLICT ("instrument_id", "price_date") DO NOTHING;
