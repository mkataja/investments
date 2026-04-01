ALTER TABLE "instruments" DROP CONSTRAINT "instruments_broker_id_kind_ck";--> statement-breakpoint
ALTER TABLE "instruments" ADD COLUMN "commodity_sector" text;--> statement-breakpoint
ALTER TABLE "instruments" ADD COLUMN "commodity_country_iso" text;--> statement-breakpoint
ALTER TABLE "instruments" ADD CONSTRAINT "instruments_commodity_cols_ck" CHECK ((
        ("instruments"."kind" = 'commodity' AND "instruments"."commodity_sector" IN ('gold', 'silver', 'other')
          AND "instruments"."commodity_sector" IS NOT NULL)
        OR
        ("instruments"."kind" <> 'commodity' AND "instruments"."commodity_sector" IS NULL AND "instruments"."commodity_country_iso" IS NULL)
      ));--> statement-breakpoint
ALTER TABLE "instruments" ADD CONSTRAINT "instruments_broker_id_kind_ck" CHECK ((
        ("instruments"."kind" IN ('etf', 'stock', 'commodity') AND "instruments"."broker_id" IS NULL)
        OR
        ("instruments"."kind" IN ('custom', 'cash_account') AND "instruments"."broker_id" IS NOT NULL)
      ));