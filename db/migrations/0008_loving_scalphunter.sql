ALTER TABLE "brokers" ADD COLUMN "broker_type" text DEFAULT 'exchange' NOT NULL;--> statement-breakpoint
ALTER TABLE "brokers" ADD CONSTRAINT "brokers_broker_type_ck" CHECK ("brokers"."broker_type" IN ('exchange', 'seligson', 'cash_account'));--> statement-breakpoint
UPDATE "brokers" SET "broker_type" = 'seligson' WHERE "code" = 'SELIGSON';--> statement-breakpoint
UPDATE "brokers" SET "broker_type" = 'cash_account' WHERE "code" = 'SVEA';