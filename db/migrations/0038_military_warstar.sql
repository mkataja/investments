CREATE TABLE "fx_backfill_queue" (
	"foreign_currency" text NOT NULL,
	"price_date" date NOT NULL,
	"price_type" "price_type" NOT NULL,
	"trigger_fetched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fx_backfill_queue_foreign_currency_price_date_pk" PRIMARY KEY("foreign_currency","price_date")
);
--> statement-breakpoint
ALTER TABLE "instruments" DROP CONSTRAINT "instruments_broker_id_kind_ck";--> statement-breakpoint
ALTER TABLE "instruments" ADD COLUMN "fx_foreign_currency" text;--> statement-breakpoint
CREATE UNIQUE INDEX "instruments_fx_foreign_currency_uidx" ON "instruments" USING btree (upper(trim("fx_foreign_currency"))) WHERE "instruments"."kind" = 'fx';--> statement-breakpoint
ALTER TABLE "instruments" ADD CONSTRAINT "instruments_fx_cols_ck" CHECK ((
        ("instruments"."kind" = 'fx' AND "instruments"."fx_foreign_currency" IS NOT NULL AND length(trim("instruments"."fx_foreign_currency")) > 0)
        OR
        ("instruments"."kind" <> 'fx' AND "instruments"."fx_foreign_currency" IS NULL)
      ));--> statement-breakpoint
ALTER TABLE "instruments" ADD CONSTRAINT "instruments_broker_id_kind_ck" CHECK ((
        ("instruments"."kind" IN ('etf', 'stock', 'commodity', 'fx') AND "instruments"."broker_id" IS NULL)
        OR
        ("instruments"."kind" IN ('custom', 'cash_account') AND "instruments"."broker_id" IS NOT NULL)
      ));