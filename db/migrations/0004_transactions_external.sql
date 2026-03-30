ALTER TABLE "transactions" ADD COLUMN "external_source" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "external_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_broker_external_uidx" ON "transactions" USING btree ("broker_id","external_source","external_id") WHERE "external_id" IS NOT NULL;
