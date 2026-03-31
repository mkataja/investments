ALTER TABLE "seligson_distribution_cache" ADD COLUMN "holdings_html" text;
UPDATE "seligson_distribution_cache" SET "holdings_html" = COALESCE(NULLIF(TRIM("other_distribution_html"), ''), NULLIF(TRIM("country_html"), ''), '');
ALTER TABLE "seligson_distribution_cache" ALTER COLUMN "holdings_html" SET NOT NULL;
ALTER TABLE "seligson_distribution_cache" DROP COLUMN "country_html";
ALTER TABLE "seligson_distribution_cache" DROP COLUMN "other_distribution_html";
