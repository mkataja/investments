ALTER TABLE "portfolios" DROP CONSTRAINT "portfolios_kind_ck";--> statement-breakpoint
ALTER TABLE "portfolios" ADD COLUMN "simulation_start_date" date;--> statement-breakpoint
UPDATE "portfolios" SET "kind" = 'static' WHERE "kind" = 'benchmark';--> statement-breakpoint
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_kind_ck" CHECK ("portfolios"."kind" IN ('live', 'static', 'backtest'));