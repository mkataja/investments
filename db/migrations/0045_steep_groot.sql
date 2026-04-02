ALTER TABLE "instruments" DROP CONSTRAINT "instruments_seligson_fund_id_seligson_funds_id_fk";
--> statement-breakpoint
ALTER TABLE "instruments" ADD CONSTRAINT "instruments_seligson_fund_id_seligson_funds_id_fk" FOREIGN KEY ("seligson_fund_id") REFERENCES "public"."seligson_funds"("id") ON DELETE cascade ON UPDATE no action;