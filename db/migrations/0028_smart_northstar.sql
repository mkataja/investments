CREATE INDEX "instruments_seligson_fund_id_idx" ON "instruments" USING btree ("seligson_fund_id");--> statement-breakpoint
CREATE INDEX "instruments_broker_id_idx" ON "instruments" USING btree ("broker_id");--> statement-breakpoint
CREATE INDEX "instruments_isin_idx" ON "instruments" USING btree ("isin");--> statement-breakpoint
CREATE INDEX "transactions_user_id_idx" ON "transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "transactions_portfolio_id_trade_date_idx" ON "transactions" USING btree ("portfolio_id","trade_date");--> statement-breakpoint
CREATE INDEX "transactions_instrument_id_idx" ON "transactions" USING btree ("instrument_id");
