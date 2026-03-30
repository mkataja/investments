DROP TABLE "distribution_cache";--> statement-breakpoint
CREATE TABLE "yahoo_finance_cache" (
	"instrument_id" integer PRIMARY KEY NOT NULL REFERENCES "instruments"("id") ON DELETE CASCADE,
	"fetched_at" timestamp with time zone NOT NULL,
	"raw" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seligson_distribution_cache" (
	"instrument_id" integer PRIMARY KEY NOT NULL REFERENCES "instruments"("id") ON DELETE CASCADE,
	"fetched_at" timestamp with time zone NOT NULL,
	"country_html" text NOT NULL,
	"other_distribution_html" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "distributions" (
	"instrument_id" integer PRIMARY KEY NOT NULL REFERENCES "instruments"("id") ON DELETE CASCADE,
	"fetched_at" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prices" (
	"instrument_id" integer PRIMARY KEY NOT NULL REFERENCES "instruments"("id") ON DELETE CASCADE,
	"quoted_price" numeric(24, 8) NOT NULL,
	"currency" text NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"source" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seligson_fund_value_cache" (
	"seligson_fund_id" integer PRIMARY KEY NOT NULL REFERENCES "seligson_funds"("id") ON DELETE CASCADE,
	"fetched_at" timestamp with time zone NOT NULL,
	"raw" jsonb NOT NULL
);
