DROP INDEX IF EXISTS "brokers_name_uidx";
--> statement-breakpoint
ALTER TABLE "brokers" ADD COLUMN "user_id" integer;
--> statement-breakpoint
UPDATE "brokers" SET "user_id" = 1 WHERE "user_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "brokers" ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "brokers" ADD CONSTRAINT "brokers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "brokers_user_name_uidx" ON "brokers" USING btree ("user_id","name");
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "user_id" integer;
--> statement-breakpoint
UPDATE "transactions" AS t SET "user_id" = b."user_id" FROM "brokers" AS b WHERE t."broker_id" = b."id";
--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
