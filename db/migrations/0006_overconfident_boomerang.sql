DROP INDEX IF EXISTS "transactions_broker_external_uidx";--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_broker_external_uidx" ON "transactions" USING btree ("broker_id","external_source","external_id");
