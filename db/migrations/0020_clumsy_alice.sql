CREATE TABLE "provider_holdings_cache" (
	"instrument_id" integer PRIMARY KEY NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"raw" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "instruments" ADD COLUMN "holdings_distribution_url" text;--> statement-breakpoint
ALTER TABLE "provider_holdings_cache" ADD CONSTRAINT "provider_holdings_cache_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE TRIGGER provider_holdings_cache_set_updated_at
  BEFORE UPDATE ON public.provider_holdings_cache
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();