import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const brokers = pgTable("brokers", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
});

export const seligsonFunds = pgTable(
  "seligson_funds",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    fid: integer("fid").notNull(),
    name: text("name").notNull(),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("seligson_funds_fid_uidx").on(t.fid)],
);

export const instruments = pgTable("instruments", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  kind: text("kind").notNull(),
  displayName: text("display_name").notNull(),
  yahooSymbol: text("yahoo_symbol"),
  isin: text("isin"),
  seligsonFundId: integer("seligson_fund_id").references(
    () => seligsonFunds.id,
  ),
  cashGeoKey: text("cash_geo_key"),
  /** Nominal currency for cash_account quantity (see SUPPORTED_CASH_CURRENCY_CODES). */
  cashCurrency: text("cash_currency"),
  cashInterestType: text("cash_interest_type"),
  /** Manual mark for valuation (e.g. Seligson fund NAV) when Yahoo quote is unavailable */
  markPriceEur: numeric("mark_price_eur", { precision: 24, scale: 8 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const transactions = pgTable(
  "transactions",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    brokerId: integer("broker_id")
      .notNull()
      .references(() => brokers.id),
    tradeDate: date("trade_date").notNull(),
    side: text("side").notNull(),
    instrumentId: integer("instrument_id")
      .notNull()
      .references(() => instruments.id),
    quantity: numeric("quantity", { precision: 24, scale: 8 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 24, scale: 8 }).notNull(),
    currency: text("currency").notNull(),
    unitPriceEur: numeric("unit_price_eur", { precision: 24, scale: 8 }),
    /** Import source label, e.g. `degiro_csv`. Null for manually entered rows. */
    externalSource: text("external_source"),
    /** Stable id within `external_source` (e.g. row fingerprint). Null for manual rows. */
    externalId: text("external_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("transactions_broker_external_uidx")
      .on(t.brokerId, t.externalSource, t.externalId)
      .where(sql`${t.externalId} IS NOT NULL`),
  ],
);

export const distributionCache = pgTable("distribution_cache", {
  instrumentId: integer("instrument_id")
    .primaryKey()
    .references(() => instruments.id),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  source: text("source").notNull(),
  /** Normalized region/sector weights (current processing). */
  payload: jsonb("payload").notNull(),
  /**
   * Upstream snapshot for reprocessing without refetch: Yahoo `quoteSummary`-shaped JSON,
   * or Seligson FundViewer HTML string. Omitted for manual rows and legacy rows.
   */
  rawPayload: jsonb("raw_payload").$type<unknown>(),
});

export const brokersRelations = relations(brokers, ({ many }) => ({
  transactions: many(transactions),
}));

export const seligsonFundsRelations = relations(seligsonFunds, ({ many }) => ({
  instruments: many(instruments),
}));

export const instrumentsRelations = relations(instruments, ({ one, many }) => ({
  seligsonFund: one(seligsonFunds, {
    fields: [instruments.seligsonFundId],
    references: [seligsonFunds.id],
  }),
  transactions: many(transactions),
  distributionCache: one(distributionCache, {
    fields: [instruments.id],
    references: [distributionCache.instrumentId],
  }),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  broker: one(brokers, {
    fields: [transactions.brokerId],
    references: [brokers.id],
  }),
  instrument: one(instruments, {
    fields: [transactions.instrumentId],
    references: [instruments.id],
  }),
}));

export const distributionCacheRelations = relations(
  distributionCache,
  ({ one }) => ({
    instrument: one(instruments, {
      fields: [distributionCache.instrumentId],
      references: [instruments.id],
    }),
  }),
);

export type DistributionPayload = {
  regions: Record<string, number>;
  sectors: Record<string, number>;
};
