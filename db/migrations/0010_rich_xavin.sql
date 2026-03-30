ALTER TABLE "brokers" DROP CONSTRAINT "brokers_code_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "brokers_name_uidx" ON "brokers" USING btree ("name");--> statement-breakpoint
ALTER TABLE "brokers" DROP COLUMN "code";