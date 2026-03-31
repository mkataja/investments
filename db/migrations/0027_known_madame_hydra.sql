ALTER TABLE "seligson_distribution_cache" ALTER COLUMN "holdings_html" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "seligson_distribution_cache" ADD COLUMN "allocation_html" text;--> statement-breakpoint
ALTER TABLE "seligson_distribution_cache" ADD COLUMN "country_html" text;--> statement-breakpoint
ALTER TABLE "seligson_distribution_cache" ADD CONSTRAINT "seligson_distribution_cache_html_source_ck" CHECK ((
        COALESCE(TRIM("seligson_distribution_cache"."holdings_html"), '') <> ''
        OR (
          COALESCE(TRIM("seligson_distribution_cache"."allocation_html"), '') <> ''
          AND COALESCE(TRIM("seligson_distribution_cache"."country_html"), '') <> ''
        )
      ));