ALTER TABLE "instruments" ADD COLUMN "broker_id" integer;--> statement-breakpoint
ALTER TABLE "instruments" ADD CONSTRAINT "instruments_broker_id_brokers_id_fk" FOREIGN KEY ("broker_id") REFERENCES "public"."brokers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
UPDATE "instruments" SET "broker_id" = (
  SELECT "id" FROM "brokers" WHERE "broker_type" = 'seligson' ORDER BY "id" ASC LIMIT 1
) WHERE "kind" = 'seligson_fund';--> statement-breakpoint
UPDATE "instruments" SET "kind" = 'custom' WHERE "kind" = 'seligson_fund';--> statement-breakpoint
ALTER TABLE "instruments" ADD CONSTRAINT "instruments_broker_id_kind_ck" CHECK ((
        ("instruments"."kind" IN ('etf', 'stock') AND "instruments"."broker_id" IS NULL)
        OR
        ("instruments"."kind" IN ('custom', 'cash_account') AND "instruments"."broker_id" IS NOT NULL)
      ));
