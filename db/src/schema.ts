import type { DistributionPayload } from "@investments/lib/distributionPayload";
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
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
  /** Margin added on top of reference rates, as a fraction (0.005 = 0.5%). */
  rateMargin: numeric("rate_margin", { precision: 24, scale: 10 })
    .notNull()
    .default("0.005"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * One row per named portfolio bucket; transactions are scoped to a portfolio.
 * `kind = static|backtest`: target weights in `portfolio_benchmark_weights`; no transactions.
 */
export const portfolios = pgTable(
  "portfolios",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("live"),
    /** Amount reserved as emergency cash; drives asset mix cash vs excess split for this portfolio. */
    emergencyFundEur: numeric("emergency_fund_eur", {
      precision: 24,
      scale: 8,
    })
      .notNull()
      .default("0"),
    /**
     * Synthetic total EUR for static/backtest notionals (`getPortfolioDistributions`); ignored when `kind` is live.
     */
    benchmarkTotalEur: numeric("benchmark_total_eur", {
      precision: 24,
      scale: 8,
    })
      .notNull()
      .default("10000"),
    /**
     * Anchor date for backtest implied buys. Null for live/static.
     */
    simulationStartDate: date("simulation_start_date"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("portfolios_user_name_kind_uidx").on(t.userId, t.name, t.kind),
    check(
      "portfolios_kind_ck",
      sql`${t.kind} IN ('live', 'static', 'backtest')`,
    ),
  ],
);

export const brokers = pgTable(
  "brokers",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    /** See `BROKER_TYPES` in `@investments/lib` brokerTypes. */
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
    /** Absolute HTTPS URL to Seligson Arvohistoria csv for this fund. Empty string for synthetic composite rows (negative fid). */
    priceHistoryCsvUrl: text("price_history_csv_url").notNull(),
    /**
     * Public page URL of the Pharos-style allocation table (resolved once from “Rahaston sijoitukset”
     * on the fund intro page at create). Not the intro `rahes_*.htm` URL. Null when the fund has no such table.
     */
    publicAllocationPageUrl: text("public_allocation_page_url"),
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
      { onDelete: "cascade" },
    ),
    /**
     * Required for `custom` (e.g. Seligson) and `cash_account`; null for `etf`/`stock`/`commodity`/`fx`.
     * See `instruments_broker_id_kind_ck`.
     */
    brokerId: integer("broker_id").references(() => brokers.id),
    /** Required when `kind` is `cash_account` (see table CHECK). */
    cashGeoKey: text("cash_geo_key"),
    /** Nominal currency for cash_account quantity (see SUPPORTED_CASH_CURRENCY_CODES). */
    cashCurrency: text("cash_currency"),
    cashInterestType: text("cash_interest_type"),
    /**
     * Optional HTTPS URL to provider holdings (iShares CSV, SSGA XLSX, DWS Xtrackers XLSX, JPM XLSX, SEC 13F XML, or Vanguard UK Professional product page).
     * Parser is chosen from the URL hostname/path — see `validateHoldingsDistributionUrl` in `@investments/lib`.
     */
    holdingsDistributionUrl: text("holdings_distribution_url"),
    /**
     * Optional J.P. Morgan `FundsMarketingHandler/product-data` JSON URL for GICS-style sector weights
     * when `holdings_distribution_url` is a JPM daily ETF holdings XLSX; geographic weights still come from the XLSX.
     */
    providerBreakdownDataUrl: text("provider_breakdown_data_url"),
    /** When `kind` is `commodity`: manual sleeve (gold / silver / other). See `instruments_commodity_cols_ck`. */
    commoditySector: text("commodity_sector"),
    /** Optional ISO 3166-1 alpha-2 storage location / vault country for `commodity`. */
    commodityCountryIso: text("commodity_country_iso"),
    /**
     * ISO 4217 code of the non-EUR leg when `kind` is `fx` (Yahoo cross to EUR). See `instruments_fx_cols_ck`.
     */
    fxForeignCurrency: text("fx_foreign_currency"),
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
        (${t.kind} IN ('etf', 'stock', 'commodity', 'fx') AND ${t.brokerId} IS NULL)
        OR
        (${t.kind} IN ('custom', 'cash_account') AND ${t.brokerId} IS NOT NULL)
      )`,
    ),
    check(
      "instruments_fx_cols_ck",
      sql`(
        (${t.kind} = 'fx' AND ${t.fxForeignCurrency} IS NOT NULL AND length(trim(${t.fxForeignCurrency})) > 0)
        OR
        (${t.kind} <> 'fx' AND ${t.fxForeignCurrency} IS NULL)
      )`,
    ),
    check(
      "instruments_commodity_cols_ck",
      sql`(
        (${t.kind} = 'commodity' AND ${t.commoditySector} IN ('gold', 'silver', 'other')
          AND ${t.commoditySector} IS NOT NULL)
        OR
        (${t.kind} <> 'commodity' AND ${t.commoditySector} IS NULL AND ${t.commodityCountryIso} IS NULL)
      )`,
    ),
    uniqueIndex("instruments_cash_account_display_name_uidx")
      .on(sql`lower(trim(${t.displayName}))`)
      .where(sql`${t.kind} = 'cash_account'`),
    uniqueIndex("instruments_fx_foreign_currency_uidx")
      .on(sql`upper(trim(${t.fxForeignCurrency}))`)
      .where(sql`${t.kind} = 'fx'`),
    index("instruments_seligson_fund_id_idx").on(t.seligsonFundId),
    /** At most one instrument per Seligson fund (`custom` instruments only use this FK). */
    uniqueIndex("instruments_seligson_fund_id_uidx")
      .on(t.seligsonFundId)
      .where(sql`${t.seligsonFundId} IS NOT NULL`),
    index("instruments_broker_id_idx").on(t.brokerId),
    uniqueIndex("instruments_yahoo_symbol_uidx")
      .on(t.yahooSymbol)
      .where(sql`${t.yahooSymbol} IS NOT NULL`),
    uniqueIndex("instruments_isin_uidx")
      .on(t.isin)
      .where(sql`${t.isin} IS NOT NULL`),
  ],
);

/**
 * Weighted constituents for instruments whose distribution is merged from other instruments
 * (or pseudo keys). Detection: rows exist for `parent_instrument_id` — no separate flag on `instruments`.
 */
export const instrumentCompositeConstituents = pgTable(
  "instrument_composite_constituents",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    parentInstrumentId: integer("parent_instrument_id")
      .notNull()
      .references(() => instruments.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull(),
    rawLabel: text("raw_label"),
    weight: numeric("weight", { precision: 24, scale: 8 }).notNull(),
    targetInstrumentId: integer("target_instrument_id").references(
      () => instruments.id,
      { onDelete: "restrict" },
    ),
    pseudoKey: text("pseudo_key"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "instrument_composite_constituents_parent_target_ck",
      sql`(
        (${t.targetInstrumentId} IS NOT NULL)::integer
        + (${t.pseudoKey} IS NOT NULL)::integer
      ) = 1`,
    ),
    check(
      "instrument_composite_constituents_pseudo_key_ck",
      sql`${t.pseudoKey} IS NULL OR ${t.pseudoKey} IN (
        'other_equities',
        'other_long_government_bonds',
        'other_long_corporate_bonds',
        'other_short_government_bonds',
        'other_short_corporate_bonds',
        'other_ultrashort_bonds',
        'cash'
      )`,
    ),
    uniqueIndex("instrument_composite_constituents_parent_sort_uidx").on(
      t.parentInstrumentId,
      t.sortOrder,
    ),
    index("instrument_composite_constituents_parent_instrument_id_idx").on(
      t.parentInstrumentId,
    ),
    index("instrument_composite_constituents_target_instrument_id_idx").on(
      t.targetInstrumentId,
    ),
  ],
);

/**
 * Target weights for `portfolios.kind = static|backtest` (fractions; normalized in application).
 */
export const portfolioBenchmarkWeights = pgTable(
  "portfolio_benchmark_weights",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    portfolioId: integer("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade" }),
    instrumentId: integer("instrument_id")
      .notNull()
      .references(() => instruments.id, { onDelete: "restrict" }),
    weight: numeric("weight", { precision: 24, scale: 8 }).notNull(),
    sortOrder: integer("sort_order").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("portfolio_benchmark_weights_portfolio_instrument_uidx").on(
      t.portfolioId,
      t.instrumentId,
    ),
    index("portfolio_benchmark_weights_portfolio_id_idx").on(t.portfolioId),
    index("portfolio_benchmark_weights_instrument_id_idx").on(t.instrumentId),
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
      .references(() => portfolios.id, { onDelete: "cascade" }),
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
    index("transactions_user_id_idx").on(t.userId),
    index("transactions_portfolio_id_trade_date_idx").on(
      t.portfolioId,
      t.tradeDate,
    ),
    index("transactions_instrument_id_idx").on(t.instrumentId),
  ],
);

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
  /** Same label as `distributions.source` for this fetch (`ishares_holdings_csv`, `ssga_holdings_xlsx`, `xtrackers_holdings_xlsx`, `jpm_holdings_xlsx`, `sec_13f_infotable_xml`, `vanguard_uk_gpx`). */
  source: text("source").notNull(),
  /** CSV UTF-8 text, base64-encoded XLSX bytes, or JSON snapshot (`vanguard_uk_gpx`). */
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
    /** FundViewer view=10 holdings listing HTML (sector + geo from line items). Null when using bond views. */
    holdingsHtml: text("holdings_html"),
    /** FundViewer view=40 allocation + bond-type split (bond funds). */
    allocationHtml: text("allocation_html"),
    /** FundViewer view=20 long-bond country weights (bond funds). */
    countryHtml: text("country_html"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "seligson_distribution_cache_html_source_ck",
      sql`(
        COALESCE(TRIM(${t.holdingsHtml}), '') <> ''
        OR (
          COALESCE(TRIM(${t.allocationHtml}), '') <> ''
          AND COALESCE(TRIM(${t.countryHtml}), '') <> ''
        )
        OR (
          COALESCE(TRIM(${t.allocationHtml}), '') <> ''
          AND COALESCE(TRIM(${t.holdingsHtml}), '') = ''
          AND COALESCE(TRIM(${t.countryHtml}), '') = ''
        )
      )`,
    ),
  ],
);

/**
 * Global cache: Seligson holdings line → Yahoo sector (or Seligson Toimiala fallback).
 * Natural key: normalized Seligson company name + ISO country (`ZZ` when Maa does not map); no TTL.
 */
export const seligsonHoldingsResolutionCache = pgTable(
  "seligson_holdings_resolution_cache",
  {
    /** Normalized via `normLabel` (lowercase, collapsed whitespace). */
    seligsonCompanyName: text("seligson_company_name").notNull(),
    /** ISO 3166-1 alpha-2; `ZZ` when Finnish Maa cannot be resolved. */
    countryIso: text("country_iso").notNull(),
    yahooSymbol: text("yahoo_symbol"),
    /** Display name from Yahoo `quoteSummary` when `source = yahoo`. */
    yahooCompanyName: text("yahoo_company_name"),
    sectorCanonicalId: text("sector_canonical_id").notNull(),
    rawSectorLabel: text("raw_sector_label"),
    source: text("source").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.seligsonCompanyName, t.countryIso] }),
    check(
      "seligson_holdings_resolution_cache_source_ck",
      sql`${t.source} IN ('yahoo', 'seligson_fallback')`,
    ),
    index("seligson_holdings_resolution_cache_yahoo_symbol_idx").on(
      t.yahooSymbol,
    ),
  ],
);

export const priceTypeEnum = pgEnum("price_type", ["intraday", "close"]);

export const interestRateIndexEnum = pgEnum("interest_rate_index", [
  "euribor_3m",
]);

/**
 * Market interest index fixings; `rate` is a fraction (e.g. 0.06 for 6%).
 */
export const interestRates = pgTable(
  "interest_rates",
  {
    indexName: interestRateIndexEnum("index_name").notNull(),
    observationDate: date("date").notNull(),
    rate: numeric("rate", { precision: 24, scale: 10 }).notNull(),
  },
  (t) => [
    uniqueIndex("interest_rates_index_name_date_uidx").on(
      t.indexName,
      t.observationDate,
    ),
  ],
);

export const distributions = pgTable(
  "distributions",
  {
    instrumentId: integer("instrument_id")
      .notNull()
      .references(() => instruments.id, { onDelete: "cascade" }),
    /** Calendar day (UTC) for this snapshot; at most one row per instrument per day. */
    snapshotDate: date("snapshot_date").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    source: text("source").notNull(),
    payload: jsonb("payload").$type<DistributionPayload>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.instrumentId, t.snapshotDate] })],
);

export const prices = pgTable(
  "prices",
  {
    instrumentId: integer("instrument_id")
      .notNull()
      .references(() => instruments.id, { onDelete: "cascade" }),
    priceDate: date("price_date").notNull(),
    quotedPrice: numeric("quoted_price", { precision: 24, scale: 8 }).notNull(),
    currency: text("currency").notNull(),
    priceType: priceTypeEnum("price_type").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    source: text("source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.instrumentId, t.priceDate] })],
);

/**
 * Pending EUR cross fetches for non-EUR asset prices. Deduped by `(foreign_currency, price_date)`.
 * Enqueued in the same transaction as the triggering `prices` row; drained after commit.
 */
export const fxBackfillQueue = pgTable(
  "fx_backfill_queue",
  {
    foreignCurrency: text("foreign_currency").notNull(),
    priceDate: date("price_date").notNull(),
    priceType: priceTypeEnum("price_type").notNull(),
    triggerFetchedAt: timestamp("trigger_fetched_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.foreignCurrency, t.priceDate] })],
);

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
  benchmarkWeights: many(portfolioBenchmarkWeights),
}));

export const portfolioBenchmarkWeightsRelations = relations(
  portfolioBenchmarkWeights,
  ({ one }) => ({
    portfolio: one(portfolios, {
      fields: [portfolioBenchmarkWeights.portfolioId],
      references: [portfolios.id],
    }),
    instrument: one(instruments, {
      fields: [portfolioBenchmarkWeights.instrumentId],
      references: [instruments.id],
    }),
  }),
);

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
  compositeConstituentsAsParent: many(instrumentCompositeConstituents, {
    relationName: "compositeConstituentsParent",
  }),
  portfolioBenchmarkWeights: many(portfolioBenchmarkWeights),
  transactions: many(transactions),
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
}));

export const instrumentCompositeConstituentsRelations = relations(
  instrumentCompositeConstituents,
  ({ one }) => ({
    parentInstrument: one(instruments, {
      relationName: "compositeConstituentsParent",
      fields: [instrumentCompositeConstituents.parentInstrumentId],
      references: [instruments.id],
    }),
    targetInstrument: one(instruments, {
      fields: [instrumentCompositeConstituents.targetInstrumentId],
      references: [instruments.id],
    }),
  }),
);

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
