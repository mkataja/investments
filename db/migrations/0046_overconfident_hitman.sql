CREATE TYPE "public"."interest_rate_index" AS ENUM('euribor_3m');--> statement-breakpoint
CREATE TABLE "interest_rates" (
	"index_name" "interest_rate_index" NOT NULL,
	"date" date NOT NULL,
	"rate" numeric(24, 10) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "interest_rates_index_name_date_uidx" ON "interest_rates" USING btree ("index_name","date");