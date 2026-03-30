ALTER TABLE "brokers" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "brokers" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "distributions" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "distributions" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "instruments" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "portfolio_settings" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "portfolio_settings" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "prices" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "prices" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "seligson_distribution_cache" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "seligson_distribution_cache" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "seligson_fund_value_cache" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "seligson_fund_value_cache" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "yahoo_finance_cache" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "yahoo_finance_cache" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
CREATE TRIGGER portfolio_settings_set_updated_at
  BEFORE UPDATE ON public.portfolio_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
CREATE TRIGGER brokers_set_updated_at
  BEFORE UPDATE ON public.brokers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
CREATE TRIGGER instruments_set_updated_at
  BEFORE UPDATE ON public.instruments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
CREATE TRIGGER transactions_set_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
CREATE TRIGGER seligson_funds_set_updated_at
  BEFORE UPDATE ON public.seligson_funds
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
CREATE TRIGGER yahoo_finance_cache_set_updated_at
  BEFORE UPDATE ON public.yahoo_finance_cache
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
CREATE TRIGGER seligson_distribution_cache_set_updated_at
  BEFORE UPDATE ON public.seligson_distribution_cache
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
CREATE TRIGGER distributions_set_updated_at
  BEFORE UPDATE ON public.distributions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
CREATE TRIGGER prices_set_updated_at
  BEFORE UPDATE ON public.prices
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
CREATE TRIGGER seligson_fund_value_cache_set_updated_at
  BEFORE UPDATE ON public.seligson_fund_value_cache
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();