ALTER TABLE "seligson_distribution_cache" DROP CONSTRAINT "seligson_distribution_cache_html_source_ck";--> statement-breakpoint
ALTER TABLE "seligson_distribution_cache" ADD CONSTRAINT "seligson_distribution_cache_html_source_ck" CHECK ((
        COALESCE(TRIM("seligson_distribution_cache"."holdings_html"), '') <> ''
        OR (
          COALESCE(TRIM("seligson_distribution_cache"."allocation_html"), '') <> ''
          AND COALESCE(TRIM("seligson_distribution_cache"."country_html"), '') <> ''
        )
        OR (
          COALESCE(TRIM("seligson_distribution_cache"."allocation_html"), '') <> ''
          AND COALESCE(TRIM("seligson_distribution_cache"."holdings_html"), '') = ''
          AND COALESCE(TRIM("seligson_distribution_cache"."country_html"), '') = ''
        )
      ));