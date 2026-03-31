import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Placeholder for future auth; the seed user is inserted by migration with explicit **`name`** (no DB default).
 */
export const users = pgTable("users", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * One row per named portfolio bucket; transactions are scoped to a portfolio.
 */
export const portfolios = pgTable(
  "portfolios",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Amount reserved as emergency cash; drives asset mix cash vs excess split for this portfolio. */
    emergencyFundEur: numeric("emergency_fund_eur", {
      precision: 24,
      scale: 8,
    })
      .notNull()
      .default("0"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("portfolios_user_name_uidx").on(t.userId, t.name)],
);

export const brokers = pgTable(
  "brokers",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    /** See `BROKER_TYPES` in `@investments/db` brokerTypes. */
    brokerType: text("broker_type").notNull().default("exchange"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("brokers_user_name_uidx").on(t.userId, t.name),
    check(
      "brokers_broker_type_ck",
      sql`${t.brokerType} IN ('exchange', 'seligson', 'cash_account')`,
    ),
  ],
);

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

export const instruments = pgTable(
  "instruments",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    kind: text("kind").notNull(),
    displayName: text("display_name").notNull(),
    yahooSymbol: text("yahoo_symbol"),
    isin: text("isin"),
    seligsonFundId: integer("seligson_fund_id").references(
      () => seligsonFunds.id,
    ),
    /**
     * Required for `custom` (e.g. Seligson) and `cash_account`; null for `etf`/`stock`.
     * See `instruments_broker_id_kind_ck`.
     */
    brokerId: integer("broker_id").references(() => brokers.id),
    /** Required when `kind` is `cash_account` (see table CHECK). */
    cashGeoKey: text("cash_geo_key"),
    /** Nominal currency for cash_account quantity (see SUPPORTED_CASH_CURRENCY_CODES). */
    cashCurrency: text("cash_currency"),
    cashInterestType: text("cash_interest_type"),
    /**
     * Optional HTTPS URL to provider holdings file (iShares CSV, SSGA XLSX, or DWS Xtrackers XLSX).
     * Parser is chosen from the URL hostname — see API `holdingsUrl` validation.
     */
    holdingsDistributionUrl: text("holdings_distribution_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "instruments_cash_geo_required_ck",
      sql`(${t.kind} <> 'cash_account') OR (${t.cashGeoKey} IS NOT NULL AND length(trim(${t.cashGeoKey})) > 0)`,
    ),
    check(
      "instruments_broker_id_kind_ck",
      sql`(
        (${t.kind} IN ('etf', 'stock') AND ${t.brokerId} IS NULL)
        OR
        (${t.kind} IN ('custom', 'cash_account') AND ${t.brokerId} IS NOT NULL)
      )`,
    ),
    uniqueIndex("instruments_cash_account_display_name_uidx")
      .on(sql`lower(trim(${t.displayName}))`)
      .where(sql`${t.kind} = 'cash_account'`),
  ],
);

export const transactions = pgTable(
  "transactions",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    portfolioId: integer("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "restrict" }),
    brokerId: integer("broker_id")
      .notNull()
      .references(() => brokers.id),
    tradeDate: timestamp("trade_date", { withTimezone: true }).notNull(),
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
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    /**
     * Non-partial unique index so `INSERT ... ON CONFLICT (broker_id, external_source, external_id)`
     * matches (PostgreSQL does not infer partial unique indexes for ON CONFLICT).
     * Multiple rows with `external_id` NULL remain allowed (NULLs are distinct in unique indexes).
     */
    uniqueIndex("transactions_broker_external_uidx").on(
      t.brokerId,
      t.externalSource,
      t.externalId,
    ),
  ],
);

export type DistributionPayload = {
  /** Uppercase ISO 3166-1 alpha-2 country codes → weights (0–1). */
  countries: Record<string, number>;
  /** Canonical sector ids (`distribution/sectorIds.ts`) → weights (0–1). */
  sectors: Record<string, number>;
};

export const yahooFinanceCache = pgTable("yahoo_finance_cache", {
  instrumentId: integer("instrument_id")
    .primaryKey()
    .references(() => instruments.id, { onDelete: "cascade" }),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  raw: jsonb("raw").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Raw provider holdings snapshot (CSV text or base64 XLSX bytes) for debugging.
 */
export const providerHoldingsCache = pgTable("provider_holdings_cache", {
  instrumentId: integer("instrument_id")
    .primaryKey()
    .references(() => instruments.id, { onDelete: "cascade" }),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  /** Same label as `distributions.source` for this fetch (`ishares_holdings_csv`, `ssga_holdings_xlsx`, `xtrackers_holdings_xlsx`, `jpm_holdings_xlsx`, `sec_13f_infotable_xml`). */
  source: text("source").notNull(),
  /** CSV UTF-8 text, or base64-encoded XLSX bytes. */
  raw: text("raw").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const seligsonDistributionCache = pgTable(
  "seligson_distribution_cache",
  {
    instrumentId: integer("instrument_id")
      .primaryKey()
      .references(() => instruments.id, { onDelete: "cascade" }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    countryHtml: text("country_html").notNull(),
    otherDistributionHtml: text("other_distribution_html").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export const distributions = pgTable("distributions", {
  instrumentId: integer("instrument_id")
    .primaryKey()
    .references(() => instruments.id, { onDelete: "cascade" }),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  source: text("source").notNull(),
  payload: jsonb("payload").$type<DistributionPayload>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const prices = pgTable("prices", {
  instrumentId: integer("instrument_id")
    .primaryKey()
    .references(() => instruments.id, { onDelete: "cascade" }),
  quotedPrice: numeric("quoted_price", { precision: 24, scale: 8 }).notNull(),
  currency: text("currency").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  source: text("source").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const seligsonFundValueCache = pgTable("seligson_fund_value_cache", {
  seligsonFundId: integer("seligson_fund_id")
    .primaryKey()
    .references(() => seligsonFunds.id, { onDelete: "cascade" }),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  raw: jsonb("raw").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  brokers: many(brokers),
  transactions: many(transactions),
  portfolios: many(portfolios),
}));

export const portfoliosRelations = relations(portfolios, ({ one, many }) => ({
  user: one(users, {
    fields: [portfolios.userId],
    references: [users.id],
  }),
  transactions: many(transactions),
}));

export const brokersRelations = relations(brokers, ({ many, one }) => ({
  user: one(users, {
    fields: [brokers.userId],
    references: [users.id],
  }),
  transactions: many(transactions),
  instruments: many(instruments),
}));

export const seligsonFundsRelations = relations(
  seligsonFunds,
  ({ many, one }) => ({
    instruments: many(instruments),
    valueCache: one(seligsonFundValueCache, {
      fields: [seligsonFunds.id],
      references: [seligsonFundValueCache.seligsonFundId],
    }),
  }),
);

export const instrumentsRelations = relations(instruments, ({ one, many }) => ({
  seligsonFund: one(seligsonFunds, {
    fields: [instruments.seligsonFundId],
    references: [seligsonFunds.id],
  }),
  broker: one(brokers, {
    fields: [instruments.brokerId],
    references: [brokers.id],
  }),
  transactions: many(transactions),
  distribution: one(distributions, {
    fields: [instruments.id],
    references: [distributions.instrumentId],
  }),
  yahooFinanceCache: one(yahooFinanceCache, {
    fields: [instruments.id],
    references: [yahooFinanceCache.instrumentId],
  }),
  seligsonDistributionCache: one(seligsonDistributionCache, {
    fields: [instruments.id],
    references: [seligsonDistributionCache.instrumentId],
  }),
  providerHoldingsCache: one(providerHoldingsCache, {
    fields: [instruments.id],
    references: [providerHoldingsCache.instrumentId],
  }),
  price: one(prices, {
    fields: [instruments.id],
    references: [prices.instrumentId],
  }),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  user: one(users, {
    fields: [transactions.userId],
    references: [users.id],
  }),
  portfolio: one(portfolios, {
    fields: [transactions.portfolioId],
    references: [portfolios.id],
  }),
  broker: one(brokers, {
    fields: [transactions.brokerId],
    references: [brokers.id],
  }),
  instrument: one(instruments, {
    fields: [transactions.instrumentId],
    references: [instruments.id],
  }),
}));

export const yahooFinanceCacheRelations = relations(
  yahooFinanceCache,
  ({ one }) => ({
    instrument: one(instruments, {
      fields: [yahooFinanceCache.instrumentId],
      references: [instruments.id],
    }),
  }),
);

export const seligsonDistributionCacheRelations = relations(
  seligsonDistributionCache,
  ({ one }) => ({
    instrument: one(instruments, {
      fields: [seligsonDistributionCache.instrumentId],
      references: [instruments.id],
    }),
  }),
);

export const providerHoldingsCacheRelations = relations(
  providerHoldingsCache,
  ({ one }) => ({
    instrument: one(instruments, {
      fields: [providerHoldingsCache.instrumentId],
      references: [instruments.id],
    }),
  }),
);

export const distributionsRelations = relations(distributions, ({ one }) => ({
  instrument: one(instruments, {
    fields: [distributions.instrumentId],
    references: [instruments.id],
  }),
}));

export const pricesRelations = relations(prices, ({ one }) => ({
  instrument: one(instruments, {
    fields: [prices.instrumentId],
    references: [instruments.id],
  }),
}));

export const seligsonFundValueCacheRelations = relations(
  seligsonFundValueCache,
  ({ one }) => ({
    seligsonFund: one(seligsonFunds, {
      fields: [seligsonFundValueCache.seligsonFundId],
      references: [seligsonFunds.id],
    }),
  }),
);
