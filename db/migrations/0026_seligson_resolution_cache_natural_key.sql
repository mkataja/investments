DROP TABLE "seligson_holdings_resolution_cache";
--> statement-breakpoint
CREATE TABLE "seligson_holdings_resolution_cache" (
	"seligson_company_name" text NOT NULL,
	"country_iso" text NOT NULL,
	"yahoo_symbol" text,
	"yahoo_company_name" text,
	"sector_canonical_id" text NOT NULL,
	"raw_sector_label" text,
	"source" text NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seligson_holdings_resolution_cache_source_ck" CHECK ("seligson_holdings_resolution_cache"."source" IN ('yahoo', 'seligson_fallback')),
	CONSTRAINT "seligson_holdings_resolution_cache_pkey" PRIMARY KEY ("seligson_company_name","country_iso")
);
--> statement-breakpoint
CREATE INDEX "seligson_holdings_resolution_cache_yahoo_symbol_idx" ON "seligson_holdings_resolution_cache" USING btree ("yahoo_symbol");
--> statement-breakpoint
CREATE TRIGGER seligson_holdings_resolution_cache_set_updated_at
  BEFORE UPDATE ON public.seligson_holdings_resolution_cache
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
