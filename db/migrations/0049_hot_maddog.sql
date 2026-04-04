DROP INDEX "instruments_isin_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "instruments_yahoo_symbol_uidx" ON "instruments" USING btree ("yahoo_symbol") WHERE "instruments"."yahoo_symbol" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "instruments_isin_uidx" ON "instruments" USING btree ("isin") WHERE "instruments"."isin" IS NOT NULL;