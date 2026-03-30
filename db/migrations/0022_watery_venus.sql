DROP TABLE "portfolio_settings" CASCADE;--> statement-breakpoint
ALTER TABLE "portfolios" ADD COLUMN "emergency_fund_eur" numeric(24, 8) DEFAULT '0' NOT NULL;