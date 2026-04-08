DROP INDEX "portfolios_user_name_uidx";--> statement-breakpoint
CREATE UNIQUE INDEX "portfolios_user_name_kind_uidx" ON "portfolios" USING btree ("user_id","name","kind");