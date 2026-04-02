UPDATE "seligson_funds" SET "price_history_csv_url" = '' WHERE "price_history_csv_url" IS NULL;--> statement-breakpoint
ALTER TABLE "seligson_funds" ALTER COLUMN "price_history_csv_url" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "seligson_funds" ALTER COLUMN "price_history_csv_url" DROP DEFAULT;
