UPDATE "instruments"
SET "cash_geo_key" = 'unallocated'
WHERE "kind" = 'cash_account' AND ("cash_geo_key" IS NULL OR trim("cash_geo_key") = '');--> statement-breakpoint
ALTER TABLE "instruments" ADD CONSTRAINT "instruments_cash_geo_required_ck" CHECK (("kind" <> 'cash_account') OR ("cash_geo_key" IS NOT NULL AND length(trim("cash_geo_key")) > 0));
