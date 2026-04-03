import {
  brokers,
  type distributions,
  instrumentCompositeConstituents,
  instruments,
  providerHoldingsCache,
  seligsonDistributionCache,
  seligsonFunds,
  transactions,
  yahooFinanceCache,
} from "@investments/db";
import { USER_ID } from "@investments/lib/appUser";
import { isInstrumentKindAllowedForBrokerType } from "@investments/lib/brokerInstrumentRules";
import type { BrokerType } from "@investments/lib/brokerTypes";
import { SUPPORTED_CASH_CURRENCY_CODES } from "@investments/lib/currencies";
import { normalizeCashAccountIsoCountryCode } from "@investments/lib/geo/iso3166Alpha2CountryCodes";
import {
  validateHoldingsDistributionUrl,
  validateProviderBreakdownDataUrl,
} from "@investments/lib/holdingsUrl";
import { COMPOSITE_PSEUDO_KEYS } from "@investments/lib/instrumentComposite";
import { normalizeYahooSymbolForStorage } from "@investments/lib/yahooSymbol";
import {
  type InferSelectModel,
  and,
  asc,
  eq,
  inArray,
  ne,
  sql,
} from "drizzle-orm";
import type { Context } from "hono";
import { z } from "zod";
import { type DbOrTx, db } from "../../db.js";
import { fetchSeligsonFundName } from "../../distributions/seligson.js";
import { upsertSeligsonFundValuesFromPage } from "../../distributions/seligsonFundValues.js";
import {
  buildYahooInstrumentLookup,
  displayNameFromYahooLookup,
  fetchYahooQuoteSummaryRaw,
} from "../../distributions/yahoo.js";
import { validJson } from "../../lib/honoValidJson.js";
import {
  duplicateSeligsonFundInstrumentMessage,
  userFacingMessageFromDbError,
} from "../../lib/postgresUserMessage.js";
import { writeCompositeDistributionCache } from "../distributionCache/compositeDistributionWrite.js";
import { refreshDistributionCacheForInstrumentId } from "../distributionCache/refreshDistribution.js";
import { writeSeligsonDistributionCache } from "../distributionCache/seligsonDistributionWrite.js";
import { getPortfolioDistributions } from "../portfolio/portfolio.js";
import { loadPortfolioOwnedByUser } from "../portfolio/portfolioAccess.js";
import {
  type AssetMixHistoryVariant,
  getPortfolioAssetMixHistory,
} from "../portfolio/portfolioAssetMixHistory.js";
import { loadOpenPositionsForPortfolio } from "../portfolio/positions.js";
import { backfillSeligsonPricesFromArvohistoriaCsv } from "../seligson/seligsonArvohistoriaCsv.js";
import {
  backfillSeligsonCsvPricesForInstrument,
  loadSeligsonCsvBackfillInstrumentRowById,
} from "../seligson/seligsonCsvPriceBackfill.js";
import {
  fetchSeligsonFundIntroPageHtml,
  isSeligsonFundViewerUrl,
  normalizeSeligsonFundPageToHttps,
  parseSeligsonFundIntroHtml,
  resolveRahastonSijoituksetTableUrl,
} from "../seligson/seligsonFundIntroPage.js";
import { seligsonFundPageCompositePreview } from "../seligson/seligsonFundPageCompositePreview.js";
import {
  insertCommodityFromYahoo,
  insertEtfStockFromYahoo,
} from "../yahoo/createYahooInstrument.js";
import {
  instrumentHasYahooFetchedPrice,
  loadInstrumentIdsWithYahooFetchedPrices,
} from "../yahoo/yahooFetchedPriceSources.js";
import {
  backfillAllYahooPricesFromHistory,
  backfillYahooPricesForInstrument,
  loadYahooBackfillInstrumentRowById,
} from "../yahoo/yahooPriceHistoryBackfill.js";
import { formatYahooUpstreamError } from "../yahoo/yahooUpstream.js";
import { deleteInstrumentWithLinkedSeligsonFund } from "./deleteInstrumentWithLinkedSeligsonFund.js";
import { loadInstrumentPriceActivityByInstrumentIds } from "./instrumentPriceActivity.js";
import { loadPriceRowCountsByInstrumentIds } from "./instrumentPriceRowCounts.js";
import { loadLatestDistributionRowsByInstrumentIds } from "./latestPriceDistribution.js";
const cashCurrencySchema = z.enum(
  SUPPORTED_CASH_CURRENCY_CODES as unknown as [string, ...string[]],
);

function assertEtfStockBreakdownUrls(
  holdingsRaw: string | null | undefined,
  breakdownRaw: string | null | undefined,
): { ok: true } | { ok: false; message: string } {
  const hv = validateHoldingsDistributionUrl(holdingsRaw);
  if (!hv.ok) {
    return { ok: false, message: hv.message };
  }
  const bv = validateProviderBreakdownDataUrl(breakdownRaw);
  if (!bv.ok) {
    return { ok: false, message: bv.message };
  }
  if (bv.normalized && (!hv.normalized || hv.provider !== "jpm_xlsx")) {
    return {
      ok: false,
      message:
        "Provider breakdown data URL is only supported with a J.P. Morgan daily ETF holdings XLSX URL in Provider holdings URL.",
    };
  }
  return { ok: true };
}

const compositePseudoKeyIn = z.enum(
  COMPOSITE_PSEUDO_KEYS as unknown as [string, ...string[]],
);

const compositeConstituentIn = z
  .object({
    rawLabel: z.string().trim().min(1),
    weightOfFund: z.number().positive().finite(),
    targetInstrumentId: z.number().int().positive().optional(),
    pseudoKey: compositePseudoKeyIn.optional(),
  })
  .refine(
    (d) =>
      (d.targetInstrumentId != null ? 1 : 0) + (d.pseudoKey != null ? 1 : 0) ===
      1,
    {
      message:
        "Each constituent must have exactly one of targetInstrumentId or pseudoKey",
    },
  );

const customInstrumentIn = z.object({
  kind: z.literal("custom"),
  brokerId: z.number().int().positive(),
  seligsonFid: z.number().int().positive().optional(),
  /** Public fund intro page (`rahes_*.htm`). Server reads `fid`, CSV URL, and optional “Rahaston sijoitukset” table URL once; intro URL is not stored. */
  seligsonFundPageUrl: z.string().trim().min(1).url().optional(),
  /** Required with `seligsonFid` when not using `seligsonFundPageUrl`. */
  priceHistoryCsvUrl: z.string().trim().min(1).url().optional(),
  /** When set with `seligsonFundPageUrl`, creates a composite instrument (manual sleeve mapping) instead of a single-fund scrape. */
  constituents: z.array(compositeConstituentIn).optional(),
});

export const seligsonFundPagePreviewIn = z.object({
  seligsonFundPageUrl: z.string().trim().min(1).url(),
});

const commodityInstrumentIn = z.object({
  kind: z.literal("commodity"),
  yahooSymbol: z.string().min(1).transform(normalizeYahooSymbolForStorage),
  commoditySector: z.enum(["gold", "silver", "other"]),
  commodityCountryIso: z.string().optional(),
});

export const instrumentIn = z.discriminatedUnion("kind", [
  z.object({
    kind: z.enum(["etf", "stock"]),
    yahooSymbol: z.string().min(1).transform(normalizeYahooSymbolForStorage),
    holdingsDistributionUrl: z.string().optional(),
    providerBreakdownDataUrl: z.string().optional(),
  }),
  commodityInstrumentIn,
  customInstrumentIn,
  z.object({
    kind: z.literal("cash_account"),
    brokerId: z.number().int().positive(),
    displayName: z.string().trim().min(1),
    currency: cashCurrencySchema,
    cashGeoKey: z
      .string()
      .trim()
      .min(1)
      .transform((s) => normalizeCashAccountIsoCountryCode(s))
      .refine((s): s is string => s !== null, {
        message:
          "Country code must be a valid ISO 3166-1 alpha-2 value (e.g. FI, US)",
      }),
  }),
]);

const etfStockInstrumentPatchIn = z
  .object({
    holdingsDistributionUrl: z.union([z.string(), z.null()]).optional(),
    providerBreakdownDataUrl: z.union([z.string(), z.null()]).optional(),
  })
  .refine(
    (o) =>
      o.holdingsDistributionUrl !== undefined ||
      o.providerBreakdownDataUrl !== undefined,
    { message: "At least one field is required" },
  );

const commodityInstrumentPatchIn = z
  .object({
    commoditySector: z.enum(["gold", "silver", "other"]).optional(),
    commodityCountryIso: z.union([z.string(), z.null()]).optional(),
  })
  .refine(
    (o) =>
      o.commoditySector !== undefined || o.commodityCountryIso !== undefined,
    { message: "At least one field is required" },
  );

/** Cash accounts, ETF/stock, and commodity accept PATCH. */
const cashInstrumentPatchIn = z
  .object({
    displayName: z.string().trim().min(1).optional(),
    brokerId: z.number().int().positive().optional(),
    cashCurrency: cashCurrencySchema.optional(),
    cashGeoKey: z
      .string()
      .trim()
      .min(1)
      .transform((s) => normalizeCashAccountIsoCountryCode(s))
      .refine((s): s is string => s !== null, {
        message:
          "Country code must be a valid ISO 3166-1 alpha-2 value (e.g. FI, US)",
      })
      .optional(),
  })
  .refine(
    (o) =>
      o.displayName != null ||
      o.brokerId != null ||
      o.cashCurrency != null ||
      o.cashGeoKey != null,
    { message: "At least one field is required" },
  );

type JoinedInstrumentRow = {
  instrument: InferSelectModel<typeof instruments>;
  distribution: InferSelectModel<typeof distributions> | null;
  yahooFinanceCache: InferSelectModel<typeof yahooFinanceCache> | null;
  seligsonDistributionCache: InferSelectModel<
    typeof seligsonDistributionCache
  > | null;
  providerHoldingsCache: InferSelectModel<typeof providerHoldingsCache> | null;
  seligsonFund: InferSelectModel<typeof seligsonFunds> | null;
  broker: InferSelectModel<typeof brokers> | null;
};

function mapJoinedRowToInstrumentPayload(
  row: JoinedInstrumentRow,
  netQuantity: number,
  hasYahooFetchedPrice: boolean,
  yahooPricesLastFetchedAt: string | null,
  yahooChartBackfillLastFetchedAt: string | null,
  seligsonCsvBackfillLastFetchedAt: string | null,
  pricesLastFetchedAt: string | null,
  pricesRowCount: number,
) {
  const {
    instrument,
    distribution,
    yahooFinanceCache: yahooRow,
    seligsonDistributionCache: seligsonRow,
    providerHoldingsCache: providerHoldingsRow,
    seligsonFund: fund,
    broker: br,
  } = row;
  return {
    ...instrument,
    hasYahooFetchedPrice,
    yahooPricesLastFetchedAt,
    yahooChartBackfillLastFetchedAt,
    seligsonCsvBackfillLastFetchedAt,
    pricesLastFetchedAt,
    pricesRowCount,
    netQuantity,
    providerHoldings: providerHoldingsRow
      ? {
          source: providerHoldingsRow.source,
          fetchedAt: providerHoldingsRow.fetchedAt,
          raw: providerHoldingsRow.raw,
        }
      : null,
    distribution: distribution
      ? {
          fetchedAt: distribution.fetchedAt,
          source: distribution.source,
          payload: distribution.payload,
          yahooFinance: yahooRow ? { raw: yahooRow.raw } : null,
          seligsonDistribution: seligsonRow
            ? {
                holdingsHtml: seligsonRow.holdingsHtml,
                allocationHtml: seligsonRow.allocationHtml,
                countryHtml: seligsonRow.countryHtml,
              }
            : null,
        }
      : null,
    seligsonFund: fund
      ? {
          id: fund.id,
          fid: fund.fid,
          name: fund.name,
          priceHistoryCsvUrl: fund.priceHistoryCsvUrl,
          publicAllocationPageUrl: fund.publicAllocationPageUrl,
        }
      : null,
    broker: br
      ? {
          id: br.id,
          name: br.name,
          brokerType: br.brokerType,
        }
      : null,
  };
}

type NetQtyScope = { kind: "portfolio"; portfolioId: number } | { kind: "all" };

async function loadInstrumentPayloadById(
  id: number,
  netQtyScope: NetQtyScope = { kind: "all" },
): Promise<ReturnType<typeof mapJoinedRowToInstrumentPayload> | null> {
  const joined = await db
    .select({
      instrument: instruments,
      yahooFinanceCache: yahooFinanceCache,
      seligsonDistributionCache: seligsonDistributionCache,
      providerHoldingsCache: providerHoldingsCache,
      seligsonFund: seligsonFunds,
      broker: brokers,
    })
    .from(instruments)
    .leftJoin(
      yahooFinanceCache,
      eq(instruments.id, yahooFinanceCache.instrumentId),
    )
    .leftJoin(
      seligsonDistributionCache,
      eq(instruments.id, seligsonDistributionCache.instrumentId),
    )
    .leftJoin(
      providerHoldingsCache,
      eq(instruments.id, providerHoldingsCache.instrumentId),
    )
    .leftJoin(seligsonFunds, eq(instruments.seligsonFundId, seligsonFunds.id))
    .leftJoin(brokers, eq(instruments.brokerId, brokers.id))
    .where(eq(instruments.id, id))
    .limit(1);
  if (joined.length === 0) {
    return null;
  }
  const [row] = joined;
  if (!row) {
    return null;
  }
  const distMap = await loadLatestDistributionRowsByInstrumentIds(db, [id]);
  const rowWithDist = {
    ...row,
    distribution: distMap.get(id) ?? null,
  };
  const netWhere =
    netQtyScope.kind === "portfolio"
      ? and(
          eq(transactions.instrumentId, id),
          eq(transactions.portfolioId, netQtyScope.portfolioId),
        )
      : and(
          eq(transactions.instrumentId, id),
          eq(transactions.userId, USER_ID),
        );
  const [qtyRow] = await db
    .select({
      qty: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.side} = 'buy' THEN ${transactions.quantity}::numeric ELSE -${transactions.quantity}::numeric END), 0)`,
    })
    .from(transactions)
    .where(netWhere);
  const q =
    qtyRow?.qty != null && qtyRow.qty !== ""
      ? Number.parseFloat(qtyRow.qty)
      : 0;
  const netQuantity = Number.isFinite(q) ? q : 0;
  const hasYahooFetchedPrice = await instrumentHasYahooFetchedPrice(db, id);
  const activityMap = await loadInstrumentPriceActivityByInstrumentIds(db, [
    id,
  ]);
  const activity = activityMap.get(id) ?? {
    yahooPricesLastFetchedAt: null,
    yahooChartBackfillLastFetchedAt: null,
    seligsonCsvBackfillLastFetchedAt: null,
    pricesLastFetchedAt: null,
  };
  const priceCountMap = await loadPriceRowCountsByInstrumentIds(db, [id]);
  return mapJoinedRowToInstrumentPayload(
    rowWithDist,
    netQuantity,
    hasYahooFetchedPrice,
    activity.yahooPricesLastFetchedAt,
    activity.yahooChartBackfillLastFetchedAt,
    activity.seligsonCsvBackfillLastFetchedAt,
    activity.pricesLastFetchedAt,
    priceCountMap.get(id) ?? 0,
  );
}

class DuplicateSeligsonInstrumentError extends Error {
  constructor() {
    super("An instrument for this Seligson fund already exists.");
    this.name = "DuplicateSeligsonInstrumentError";
  }
}

function isSeligsonFundFidUniqueViolation(e: unknown): boolean {
  if (
    typeof e !== "object" ||
    e === null ||
    !("code" in e) ||
    (e as { code: unknown }).code !== "23505"
  ) {
    return false;
  }
  const constraint =
    "constraint" in e &&
    typeof (e as { constraint: unknown }).constraint === "string"
      ? (e as { constraint: string }).constraint
      : "";
  const msg = e instanceof Error ? e.message : String(e);
  return (
    constraint === "seligson_funds_fid_uidx" ||
    msg.includes("seligson_funds_fid_uidx")
  );
}

async function backfillSeligsonCsvIfConfigured(
  instrumentId: number,
  priceHistoryCsvUrl: string,
): Promise<void> {
  if (priceHistoryCsvUrl.trim() === "") {
    return;
  }
  await backfillSeligsonPricesFromArvohistoriaCsv(
    db,
    instrumentId,
    priceHistoryCsvUrl,
  );
}

/**
 * Inside a transaction: find or insert `seligson_funds`. Pass `fundNameForInsert` when the fund
 * row may need to be created (caller prefetches via `fetchSeligsonFundName` outside the tx).
 */
async function findOrCreateSeligsonFundByFidInTx(
  tx: DbOrTx,
  fid: number,
  priceHistoryCsvUrlForNewRow: string | null | undefined,
  publicAllocationPageUrlForNewRow: string | null | undefined,
  fundNameForInsert: string | null,
): Promise<InferSelectModel<typeof seligsonFunds>> {
  const publicAlloc = publicAllocationPageUrlForNewRow?.trim() ?? null;
  const [existing] = await tx
    .select()
    .from(seligsonFunds)
    .where(eq(seligsonFunds.fid, fid));
  if (existing) {
    return existing;
  }
  if (fid <= 0) {
    throw new Error("Invalid fid for Seligson fund insert");
  }
  const csv = priceHistoryCsvUrlForNewRow?.trim();
  if (csv == null || csv === "") {
    throw new Error(
      "priceHistoryCsvUrl is required when creating a Seligson fund row",
    );
  }
  const name = fundNameForInsert?.trim();
  if (name == null || name === "") {
    throw new Error("Fund name is required when creating a Seligson fund row");
  }
  try {
    const [inserted] = await tx
      .insert(seligsonFunds)
      .values({
        fid,
        name,
        priceHistoryCsvUrl: csv,
        publicAllocationPageUrl: publicAlloc,
        isActive: true,
      })
      .returning();
    if (!inserted) {
      throw new Error("Failed to insert seligson fund");
    }
    return inserted;
  } catch (e) {
    if (isSeligsonFundFidUniqueViolation(e)) {
      const [row] = await tx
        .select()
        .from(seligsonFunds)
        .where(eq(seligsonFunds.fid, fid))
        .limit(1);
      if (row) {
        return row;
      }
    }
    throw e;
  }
}

export async function getInstruments(c: Context) {
  const portfolioIdRaw = c.req.query("portfolioId")?.trim();
  let portfolioIdForNet: number | null = null;
  if (portfolioIdRaw != null && portfolioIdRaw !== "") {
    const pid = Number.parseInt(portfolioIdRaw, 10);
    if (!Number.isFinite(pid) || pid < 1) {
      return c.json({ message: "Invalid portfolioId" }, 400);
    }
    const p = await loadPortfolioOwnedByUser(pid);
    if (!p) {
      return c.json({ message: "Portfolio not found" }, 404);
    }
    portfolioIdForNet = pid;
  }

  const brokerIdRaw = c.req.query("brokerId")?.trim();
  let brokerTypeForFilter: string | null = null;
  let filterBrokerId: number | null = null;
  if (brokerIdRaw != null && brokerIdRaw !== "") {
    const brokerId = Number.parseInt(brokerIdRaw, 10);
    if (!Number.isFinite(brokerId) || brokerId < 1) {
      return c.json({ message: "Invalid brokerId" }, 400);
    }
    const [b] = await db
      .select({ brokerType: brokers.brokerType })
      .from(brokers)
      .where(eq(brokers.id, brokerId));
    if (!b) {
      return c.json({ message: "Broker not found" }, 404);
    }
    brokerTypeForFilter = b.brokerType;
    filterBrokerId = brokerId;
  }

  const joined = await db
    .select({
      instrument: instruments,
      yahooFinanceCache: yahooFinanceCache,
      seligsonDistributionCache: seligsonDistributionCache,
      providerHoldingsCache: providerHoldingsCache,
      seligsonFund: seligsonFunds,
      broker: brokers,
    })
    .from(instruments)
    .leftJoin(
      yahooFinanceCache,
      eq(instruments.id, yahooFinanceCache.instrumentId),
    )
    .leftJoin(
      seligsonDistributionCache,
      eq(instruments.id, seligsonDistributionCache.instrumentId),
    )
    .leftJoin(
      providerHoldingsCache,
      eq(instruments.id, providerHoldingsCache.instrumentId),
    )
    .leftJoin(seligsonFunds, eq(instruments.seligsonFundId, seligsonFunds.id))
    .leftJoin(brokers, eq(instruments.brokerId, brokers.id))
    .orderBy(asc(instruments.id));

  const distMap = await loadLatestDistributionRowsByInstrumentIds(
    db,
    joined.map((j) => j.instrument.id),
  );

  const yahooFetchedIdSet = await loadInstrumentIdsWithYahooFetchedPrices(db);

  const instrumentIds = joined.map((j) => j.instrument.id);
  const [instrumentPriceActivityMap, priceRowCountMap] = await Promise.all([
    loadInstrumentPriceActivityByInstrumentIds(db, instrumentIds),
    loadPriceRowCountsByInstrumentIds(db, instrumentIds),
  ]);

  const qtyRows = await db
    .select({
      instrumentId: transactions.instrumentId,
      qty: sql<string>`SUM(CASE WHEN ${transactions.side} = 'buy' THEN ${transactions.quantity}::numeric ELSE -${transactions.quantity}::numeric END)`,
    })
    .from(transactions)
    .where(
      portfolioIdForNet != null
        ? eq(transactions.portfolioId, portfolioIdForNet)
        : eq(transactions.userId, USER_ID),
    )
    .groupBy(transactions.instrumentId);

  const netQtyByInstrument = new Map<number, number>();
  for (const r of qtyRows) {
    const q = Number.parseFloat(r.qty);
    if (Number.isFinite(q)) {
      netQtyByInstrument.set(r.instrumentId, q);
    }
  }

  let payload = joined.map((row) => {
    const act = instrumentPriceActivityMap.get(row.instrument.id) ?? {
      yahooPricesLastFetchedAt: null,
      yahooChartBackfillLastFetchedAt: null,
      seligsonCsvBackfillLastFetchedAt: null,
      pricesLastFetchedAt: null,
    };
    return mapJoinedRowToInstrumentPayload(
      {
        ...row,
        distribution: distMap.get(row.instrument.id) ?? null,
      },
      netQtyByInstrument.get(row.instrument.id) ?? 0,
      yahooFetchedIdSet.has(row.instrument.id),
      act.yahooPricesLastFetchedAt,
      act.yahooChartBackfillLastFetchedAt,
      act.seligsonCsvBackfillLastFetchedAt,
      act.pricesLastFetchedAt,
      priceRowCountMap.get(row.instrument.id) ?? 0,
    );
  });

  if (brokerTypeForFilter != null && filterBrokerId != null) {
    payload = payload.filter((row) => {
      if (
        !isInstrumentKindAllowedForBrokerType(
          brokerTypeForFilter as BrokerType,
          row.kind,
        )
      ) {
        return false;
      }
      if (row.kind === "cash_account" || row.kind === "custom") {
        return row.brokerId === filterBrokerId;
      }
      return true;
    });
  }

  return c.json(payload);
}

export async function getInstrumentsLookupYahoo(c: Context) {
  const symbol = c.req.query("symbol")?.trim();
  if (!symbol) {
    return c.json({ message: "symbol query required" }, 400);
  }
  try {
    const raw = await fetchYahooQuoteSummaryRaw(symbol);
    const lookup = buildYahooInstrumentLookup(raw, symbol);
    return c.json({
      lookup,
      displayName: displayNameFromYahooLookup(lookup, symbol),
    });
  } catch (e) {
    const { message, status } = formatYahooUpstreamError(e);
    return c.json({ message }, status);
  }
}

export async function postSeligsonFundPagePreview(c: Context) {
  const { seligsonFundPageUrl } = validJson(c, seligsonFundPagePreviewIn);
  try {
    const result = await seligsonFundPageCompositePreview(seligsonFundPageUrl);
    return c.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (
      message.includes("Invalid fund page") ||
      message.includes("Fund page URL must")
    ) {
      return c.json({ message }, 400);
    }
    if (
      message.includes("Could not find") ||
      message.includes("Multiple distinct fid") ||
      message.includes("CSV link must")
    ) {
      return c.json({ message }, 502);
    }
    return c.json({ message }, 502);
  }
}

export async function postBackfillYahooPricesAll(c: Context) {
  const result = await backfillAllYahooPricesFromHistory();
  const rowsUpsertedTotal = result.instruments.reduce(
    (s, r) => s + r.rowsUpserted,
    0,
  );
  const failed = result.instruments.filter((r) => r.error != null);
  return c.json({
    ok: true,
    summary: {
      instrumentsTotal: result.instruments.length,
      rowsUpsertedTotal,
      failedCount: failed.length,
      instruments: result.instruments,
    },
  });
}

export async function postBackfillYahooPricesForInstrument(c: Context) {
  const id = Number.parseInt(c.req.param("id") ?? "", 10);
  if (!Number.isFinite(id) || id < 1) {
    return c.json({ message: "Invalid id" }, 400);
  }
  const row = await loadYahooBackfillInstrumentRowById(id);
  if (!row) {
    return c.json(
      {
        message:
          "Instrument not found or not eligible for Yahoo price backfill",
      },
      404,
    );
  }
  const result = await backfillYahooPricesForInstrument(row);
  return c.json({ ok: true, ...result });
}

/**
 * Fetches Seligson Arvohistoria CSV and upserts historical `prices` (`seligson_csv_backfill`).
 * Eligible: `kind` `custom` with linked `seligson_funds.price_history_csv_url` non-empty.
 */
export async function postBackfillSeligsonCsvPrices(c: Context) {
  const id = Number.parseInt(c.req.param("id") ?? "", 10);
  if (!Number.isFinite(id) || id < 1) {
    return c.json({ message: "Invalid id" }, 400);
  }
  const row = await loadSeligsonCsvBackfillInstrumentRowById(id);
  if (!row) {
    return c.json(
      {
        message:
          "Instrument not found or not eligible for Seligson CSV price backfill",
      },
      404,
    );
  }
  const result = await backfillSeligsonCsvPricesForInstrument(row);
  return c.json({ ok: true, ...result });
}

export async function getInstrumentById(c: Context) {
  const id = Number.parseInt(c.req.param("id") ?? "", 10);
  if (!Number.isFinite(id) || id < 1) {
    return c.json({ message: "Invalid id" }, 400);
  }
  const portfolioIdRaw = c.req.query("portfolioId")?.trim();
  let netQtyScope: NetQtyScope = { kind: "all" };
  if (portfolioIdRaw != null && portfolioIdRaw !== "") {
    const pid = Number.parseInt(portfolioIdRaw, 10);
    if (!Number.isFinite(pid) || pid < 1) {
      return c.json({ message: "Invalid portfolioId" }, 400);
    }
    const p = await loadPortfolioOwnedByUser(pid);
    if (!p) {
      return c.json({ message: "Portfolio not found" }, 404);
    }
    netQtyScope = { kind: "portfolio", portfolioId: pid };
  }
  const payload = await loadInstrumentPayloadById(id, netQtyScope);
  if (!payload) {
    return c.json({ message: "Not found" }, 404);
  }
  return c.json(payload);
}

export async function postInstrument(c: Context) {
  const body = validJson(c, instrumentIn);

  if (body.kind === "etf" || body.kind === "stock") {
    try {
      const holdingsRaw =
        body.holdingsDistributionUrl != null &&
        body.holdingsDistributionUrl.trim().length > 0
          ? body.holdingsDistributionUrl
          : null;
      const breakdownRaw =
        body.providerBreakdownDataUrl != null &&
        body.providerBreakdownDataUrl.trim().length > 0
          ? body.providerBreakdownDataUrl
          : null;
      const combo = assertEtfStockBreakdownUrls(holdingsRaw, breakdownRaw);
      if (!combo.ok) {
        return c.json({ message: combo.message }, 400);
      }
      const row = await insertEtfStockFromYahoo(body.kind, body.yahooSymbol, {
        holdingsDistributionUrl: holdingsRaw,
        providerBreakdownDataUrl: breakdownRaw,
      });
      return c.json(row, 201);
    } catch (e) {
      const { message, status } = formatYahooUpstreamError(e);
      return c.json({ message }, status);
    }
  }

  if (body.kind === "commodity") {
    const countryRaw = body.commodityCountryIso?.trim() ?? "";
    const countryIso =
      countryRaw.length === 0
        ? null
        : normalizeCashAccountIsoCountryCode(countryRaw);
    if (countryIso === null && countryRaw.length > 0) {
      return c.json({ message: "Invalid ISO country code" }, 400);
    }
    try {
      const row = await insertCommodityFromYahoo(
        body.yahooSymbol,
        body.commoditySector,
        countryIso,
      );
      return c.json(row, 201);
    } catch (e) {
      const { message, status } = formatYahooUpstreamError(e);
      return c.json({ message }, status);
    }
  }

  if (body.kind === "custom") {
    const isComposite =
      body.constituents != null && body.constituents.length > 0;
    const compositeRows = body.constituents;
    const pageUrlRaw = body.seligsonFundPageUrl?.trim();
    const hasPageUrl = pageUrlRaw != null && pageUrlRaw.length > 0;

    if (isComposite) {
      if (!hasPageUrl) {
        return c.json(
          {
            message:
              "seligsonFundPageUrl is required when constituents are provided",
          },
          400,
        );
      }
      if (body.seligsonFid != null) {
        return c.json(
          {
            message:
              "Do not pass seligsonFid when providing composite constituents",
          },
          400,
        );
      }
      if (body.priceHistoryCsvUrl != null) {
        return c.json(
          {
            message:
              "Do not pass priceHistoryCsvUrl when providing composite constituents",
          },
          400,
        );
      }
    }

    if (hasPageUrl) {
      if (body.seligsonFid != null) {
        return c.json(
          {
            message:
              "Do not pass seligsonFid together with seligsonFundPageUrl",
          },
          400,
        );
      }
      if (body.priceHistoryCsvUrl != null) {
        return c.json(
          {
            message:
              "Do not pass priceHistoryCsvUrl together with seligsonFundPageUrl",
          },
          400,
        );
      }
    } else if (body.seligsonFid == null) {
      return c.json(
        { message: "Provide seligsonFundPageUrl or seligsonFid" },
        400,
      );
    } else if (
      body.priceHistoryCsvUrl == null ||
      body.priceHistoryCsvUrl.trim() === ""
    ) {
      return c.json(
        {
          message:
            "priceHistoryCsvUrl is required when using seligsonFid without seligsonFundPageUrl",
        },
        400,
      );
    }

    const [br] = await db
      .select()
      .from(brokers)
      .where(eq(brokers.id, body.brokerId));
    if (!br) {
      return c.json({ message: "Broker not found" }, 404);
    }
    if (br.brokerType !== "seligson") {
      return c.json(
        { message: "Seligson instruments require a Seligson-type broker" },
        400,
      );
    }

    let fid: number;
    let csvForFund: string;
    let publicAllocationPageUrlForNewRow: string | null = null;
    try {
      if (hasPageUrl && pageUrlRaw != null) {
        const { href, html } = await fetchSeligsonFundIntroPageHtml(pageUrlRaw);
        const parsed = parseSeligsonFundIntroHtml(html, href);
        fid = parsed.fid;
        csvForFund = parsed.priceHistoryCsvUrl;
        const tableUrl = resolveRahastonSijoituksetTableUrl(html, href);
        const tableHttps =
          tableUrl != null ? normalizeSeligsonFundPageToHttps(tableUrl) : null;
        publicAllocationPageUrlForNewRow =
          tableHttps != null && !isSeligsonFundViewerUrl(tableHttps)
            ? tableHttps
            : null;
      } else {
        const fidRaw = body.seligsonFid;
        const csvUrl = body.priceHistoryCsvUrl?.trim();
        if (fidRaw == null || csvUrl == null || csvUrl === "") {
          return c.json(
            {
              message:
                "seligsonFundPageUrl or seligsonFid with priceHistoryCsvUrl is required",
            },
            400,
          );
        }
        fid = fidRaw;
        csvForFund = csvUrl;
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (
        message.includes("Invalid fund page") ||
        message.includes("Fund page URL must")
      ) {
        return c.json({ message }, 400);
      }
      if (
        message.includes("Could not find") ||
        message.includes("Multiple distinct fid") ||
        message.includes("CSV link must")
      ) {
        return c.json({ message }, 502);
      }
      return c.json({ message }, 502);
    }

    const [preExistingFund] = await db
      .select()
      .from(seligsonFunds)
      .where(eq(seligsonFunds.fid, fid))
      .limit(1);
    let fundNameForInsert: string | null = null;
    if (!preExistingFund) {
      try {
        fundNameForInsert = await fetchSeligsonFundName(fid);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return c.json({ message }, 502);
      }
    }

    let fund!: InferSelectModel<typeof seligsonFunds>;
    let row!: InferSelectModel<typeof instruments>;
    try {
      await db.transaction(async (tx) => {
        fund = await findOrCreateSeligsonFundByFidInTx(
          tx,
          fid,
          csvForFund,
          publicAllocationPageUrlForNewRow,
          fundNameForInsert,
        );
        const [dupInstrument] = await tx
          .select({ id: instruments.id })
          .from(instruments)
          .where(eq(instruments.seligsonFundId, fund.id))
          .limit(1);
        if (dupInstrument) {
          throw new DuplicateSeligsonInstrumentError();
        }
        const [inserted] = await tx
          .insert(instruments)
          .values({
            kind: "custom",
            displayName: fund.name,
            seligsonFundId: fund.id,
            brokerId: body.brokerId,
          })
          .returning();
        if (!inserted) {
          throw new Error("Failed to insert instrument");
        }
        row = inserted;
        if (isComposite && compositeRows != null) {
          await tx.insert(instrumentCompositeConstituents).values(
            compositeRows.map(
              (
                c: {
                  rawLabel: string;
                  weightOfFund: number;
                  targetInstrumentId?: number;
                  pseudoKey?: string;
                },
                i: number,
              ) => ({
                parentInstrumentId: row.id,
                sortOrder: i,
                rawLabel: c.rawLabel,
                weight: String(c.weightOfFund),
                targetInstrumentId: c.targetInstrumentId ?? null,
                pseudoKey: c.pseudoKey ?? null,
              }),
            ),
          );
        }
      });
    } catch (e) {
      if (e instanceof DuplicateSeligsonInstrumentError) {
        return c.json({ message: e.message }, 409);
      }
      const dupMsg = duplicateSeligsonFundInstrumentMessage(e);
      if (dupMsg) {
        return c.json({ message: dupMsg }, 409);
      }
      const message = e instanceof Error ? e.message : String(e);
      if (
        message.includes("priceHistoryCsvUrl is required") ||
        message.includes(
          "Fund name is required when creating a Seligson fund row",
        )
      ) {
        return c.json({ message }, 400);
      }
      return c.json({ message }, 502);
    }

    if (isComposite) {
      try {
        const now = new Date();
        await writeCompositeDistributionCache(row.id, now);
        await upsertSeligsonFundValuesFromPage(db, now);
        await backfillSeligsonCsvIfConfigured(row.id, fund.priceHistoryCsvUrl);
      } catch (e) {
        await deleteInstrumentWithLinkedSeligsonFund(
          db,
          row.id,
          row.seligsonFundId ?? null,
        );
        const message =
          userFacingMessageFromDbError(e) ??
          (e instanceof Error ? e.message : String(e));
        return c.json({ message }, 502);
      }
      return c.json(row, 201);
    }

    try {
      await writeSeligsonDistributionCache(row.id, fund.fid);
      await backfillSeligsonCsvIfConfigured(row.id, fund.priceHistoryCsvUrl);
    } catch (e) {
      await deleteInstrumentWithLinkedSeligsonFund(
        db,
        row.id,
        row.seligsonFundId ?? null,
      );
      const message =
        userFacingMessageFromDbError(e) ??
        (e instanceof Error ? e.message : String(e));
      return c.json({ message }, 502);
    }
    return c.json(row, 201);
  }

  if (body.kind === "cash_account") {
    const [br] = await db
      .select()
      .from(brokers)
      .where(eq(brokers.id, body.brokerId));
    if (!br) {
      return c.json({ message: "Broker not found" }, 404);
    }
    if (br.brokerType !== "cash_account") {
      return c.json(
        { message: "Cash instruments require a cash-account-type broker" },
        400,
      );
    }
    const displayName = body.displayName;
    const [nameDup] = await db
      .select({ id: instruments.id })
      .from(instruments)
      .where(
        and(
          eq(instruments.kind, "cash_account"),
          sql`lower(trim(${instruments.displayName})) = ${displayName.toLowerCase()}`,
        ),
      )
      .limit(1);
    if (nameDup) {
      return c.json(
        { message: "A cash account with this name already exists" },
        409,
      );
    }
    try {
      const [row] = await db
        .insert(instruments)
        .values({
          kind: "cash_account",
          displayName,
          cashCurrency: body.currency,
          cashGeoKey: body.cashGeoKey,
          brokerId: body.brokerId,
        })
        .returning();
      if (!row) {
        return c.json({ message: "Failed to insert instrument" }, 500);
      }
      return c.json(row, 201);
    } catch (e) {
      if (
        typeof e === "object" &&
        e !== null &&
        "code" in e &&
        (e as { code?: string }).code === "23505"
      ) {
        return c.json(
          { message: "A cash account with this name already exists" },
          409,
        );
      }
      throw e;
    }
  }

  return c.json({ message: "Unsupported instrument kind" }, 400);
}

export async function patchInstrument(c: Context) {
  const id = Number.parseInt(c.req.param("id") ?? "", 10);
  if (!Number.isFinite(id) || id < 1) {
    return c.json({ message: "Invalid id" }, 400);
  }
  const [existing] = await db
    .select()
    .from(instruments)
    .where(eq(instruments.id, id));
  if (!existing) {
    return c.json({ message: "Not found" }, 404);
  }

  const rawBody: unknown = await c.req.json();

  if (existing.kind === "cash_account") {
    const parsed = cashInstrumentPatchIn.safeParse(rawBody);
    if (!parsed.success) {
      return c.json({ message: parsed.error.flatten() }, 400);
    }
    const body = parsed.data;

    const updates: {
      displayName?: string;
      brokerId?: number;
      cashCurrency?: string;
      cashGeoKey?: string;
    } = {};
    if (body.displayName != null) {
      const name = body.displayName.trim();
      const [dup] = await db
        .select({ id: instruments.id })
        .from(instruments)
        .where(
          and(
            eq(instruments.kind, "cash_account"),
            sql`lower(trim(${instruments.displayName})) = ${name.toLowerCase()}`,
            ne(instruments.id, id),
          ),
        )
        .limit(1);
      if (dup) {
        return c.json(
          { message: "A cash account with this name already exists" },
          409,
        );
      }
      updates.displayName = name;
    }
    if (body.brokerId != null) {
      const [br] = await db
        .select()
        .from(brokers)
        .where(eq(brokers.id, body.brokerId));
      if (!br) {
        return c.json({ message: "Broker not found" }, 404);
      }
      if (br.brokerType !== "cash_account") {
        return c.json(
          { message: "Cash instruments require a cash-account-type broker" },
          400,
        );
      }
      updates.brokerId = body.brokerId;
    }
    if (body.cashCurrency != null) updates.cashCurrency = body.cashCurrency;
    if (body.cashGeoKey != null) updates.cashGeoKey = body.cashGeoKey;
    if (Object.keys(updates).length === 0) {
      const payload = await loadInstrumentPayloadById(id);
      if (!payload) {
        return c.json({ message: "Not found" }, 404);
      }
      return c.json(payload);
    }
    try {
      await db.update(instruments).set(updates).where(eq(instruments.id, id));
    } catch (e) {
      if (
        typeof e === "object" &&
        e !== null &&
        "code" in e &&
        (e as { code?: string }).code === "23505"
      ) {
        return c.json(
          { message: "A cash account with this name already exists" },
          409,
        );
      }
      throw e;
    }
    const payload = await loadInstrumentPayloadById(id);
    if (!payload) {
      return c.json({ message: "Not found" }, 404);
    }
    return c.json(payload);
  }

  if (existing.kind === "etf" || existing.kind === "stock") {
    const parsed = etfStockInstrumentPatchIn.safeParse(rawBody);
    if (!parsed.success) {
      return c.json({ message: parsed.error.flatten() }, 400);
    }
    const body = parsed.data;
    const rawHoldings =
      body.holdingsDistributionUrl !== undefined
        ? body.holdingsDistributionUrl
        : existing.holdingsDistributionUrl;
    const rawBreakdown =
      body.providerBreakdownDataUrl !== undefined
        ? body.providerBreakdownDataUrl
        : existing.providerBreakdownDataUrl;
    const combo = assertEtfStockBreakdownUrls(rawHoldings, rawBreakdown);
    if (!combo.ok) {
      return c.json({ message: combo.message }, 400);
    }
    const hv = validateHoldingsDistributionUrl(rawHoldings);
    if (!hv.ok) {
      return c.json({ message: hv.message }, 400);
    }
    const bv = validateProviderBreakdownDataUrl(rawBreakdown);
    if (!bv.ok) {
      return c.json({ message: bv.message }, 400);
    }
    const prevH = validateHoldingsDistributionUrl(
      existing.holdingsDistributionUrl,
    );
    const prevB = validateProviderBreakdownDataUrl(
      existing.providerBreakdownDataUrl,
    );
    const prevHN = prevH.ok ? prevH.normalized : null;
    const prevBN = prevB.ok ? prevB.normalized : null;
    const nextHN = hv.normalized;
    const nextBN = bv.normalized;
    await db
      .update(instruments)
      .set({
        holdingsDistributionUrl: hv.normalized,
        providerBreakdownDataUrl: bv.normalized,
      })
      .where(eq(instruments.id, id));
    if (prevHN !== nextHN || prevBN !== nextBN) {
      const refresh = await refreshDistributionCacheForInstrumentId(id);
      if ("skipped" in refresh) {
        if (refresh.reason === "not_found") {
          return c.json({ message: "Not found" }, 404);
        }
      } else if ("error" in refresh) {
        return c.json({ message: refresh.error }, refresh.status);
      }
    }
    const payload = await loadInstrumentPayloadById(id);
    if (!payload) {
      return c.json({ message: "Not found" }, 404);
    }
    return c.json(payload);
  }

  if (existing.kind === "commodity") {
    const parsed = commodityInstrumentPatchIn.safeParse(rawBody);
    if (!parsed.success) {
      return c.json({ message: parsed.error.flatten() }, 400);
    }
    const body = parsed.data;
    const updates: {
      commoditySector?: string;
      commodityCountryIso?: string | null;
    } = {};
    if (body.commoditySector !== undefined) {
      updates.commoditySector = body.commoditySector;
    }
    if (body.commodityCountryIso !== undefined) {
      const v = body.commodityCountryIso;
      if (v === null) {
        updates.commodityCountryIso = null;
      } else {
        const t = v.trim();
        if (t.length === 0) {
          updates.commodityCountryIso = null;
        } else {
          const iso = normalizeCashAccountIsoCountryCode(t);
          if (iso === null) {
            return c.json({ message: "Invalid ISO country code" }, 400);
          }
          updates.commodityCountryIso = iso;
        }
      }
    }
    await db.update(instruments).set(updates).where(eq(instruments.id, id));
    const refresh = await refreshDistributionCacheForInstrumentId(id);
    if ("skipped" in refresh) {
      if (refresh.reason === "not_found") {
        return c.json({ message: "Not found" }, 404);
      }
    } else if ("error" in refresh) {
      return c.json({ message: refresh.error }, refresh.status);
    }
    const payload = await loadInstrumentPayloadById(id);
    if (!payload) {
      return c.json({ message: "Not found" }, 404);
    }
    return c.json(payload);
  }

  return c.json(
    {
      message:
        "Unsupported instrument kind for PATCH (only cash accounts, ETF/stock, and commodity)",
    },
    400,
  );
}

export async function postRefreshInstrumentDistribution(c: Context) {
  const id = Number.parseInt(c.req.param("id") ?? "", 10);
  if (!Number.isFinite(id) || id < 1) {
    return c.json({ message: "Invalid id" }, 400);
  }
  const result = await refreshDistributionCacheForInstrumentId(id);
  if ("skipped" in result) {
    if (result.reason === "not_found") {
      return c.json({ message: "Not found" }, 404);
    }
    return c.json({ skipped: true, reason: result.reason }, 200);
  }
  if ("error" in result) {
    return c.json({ message: result.error }, result.status);
  }
  const payload = await loadInstrumentPayloadById(id);
  if (!payload) {
    return c.json({ message: "Not found" }, 404);
  }
  return c.json({ ok: true, instrument: payload }, 200);
}

/** Also removes the linked Seligson fund row when `instruments.seligson_fund_id` is set. */
export async function deleteInstrument(c: Context) {
  const id = Number.parseInt(c.req.param("id") ?? "", 10);
  if (!Number.isFinite(id) || id < 1) {
    return c.json({ message: "Invalid id" }, 400);
  }
  const [existing] = await db
    .select({
      id: instruments.id,
      seligsonFundId: instruments.seligsonFundId,
    })
    .from(instruments)
    .where(eq(instruments.id, id));
  if (!existing) {
    return c.json({ message: "Not found" }, 404);
  }
  await db.transaction(async (tx) => {
    await deleteInstrumentWithLinkedSeligsonFund(
      tx,
      id,
      existing.seligsonFundId,
    );
  });
  return c.body(null, 204);
}

export async function getPositions(c: Context) {
  const raw = c.req.query("portfolioId")?.trim();
  if (!raw) {
    return c.json({ message: "portfolioId query required" }, 400);
  }
  const portfolioId = Number.parseInt(raw, 10);
  if (!Number.isFinite(portfolioId) || portfolioId < 1) {
    return c.json({ message: "Invalid portfolioId" }, 400);
  }
  const pf = await loadPortfolioOwnedByUser(portfolioId);
  if (!pf) {
    return c.json({ message: "Portfolio not found" }, 404);
  }
  if (pf.kind === "benchmark") {
    return c.json([]);
  }
  const pos = await loadOpenPositionsForPortfolio(portfolioId);
  const instRows =
    pos.length === 0
      ? []
      : await db
          .select()
          .from(instruments)
          .where(
            inArray(
              instruments.id,
              pos.map((p) => p.instrumentId),
            ),
          );
  const merged = pos.map((p) => ({
    ...p,
    instrument: instRows.find((i) => i.id === p.instrumentId) ?? null,
  }));
  return c.json(merged);
}

export async function getPortfolioDistributionsRoute(c: Context) {
  const raw = c.req.query("portfolioId")?.trim();
  if (!raw) {
    return c.json({ message: "portfolioId query required" }, 400);
  }
  const portfolioId = Number.parseInt(raw, 10);
  if (!Number.isFinite(portfolioId) || portfolioId < 1) {
    return c.json({ message: "Invalid portfolioId" }, 400);
  }
  const pf = await loadPortfolioOwnedByUser(portfolioId);
  if (!pf) {
    return c.json({ message: "Portfolio not found" }, 404);
  }
  const data = await getPortfolioDistributions(portfolioId);
  return c.json(data);
}

/**
 * `GET /portfolio/asset-mix-history?portfolioId=…&variant=…` — weekly asset mix EUR plus
 * `equitySectorsEur` per date (equity sleeve only; same sector keys as portfolio
 * distributions / sectors bar chart). Optional `variant=hodl`: simulate never selling
 * securities (sells book to virtual leverage after cash is drained; cash account sells
 * apply normally). Includes cumulative loan interest from EURIBOR + user margin. Default `variant` is `actual`.
 */
export async function getPortfolioAssetMixHistoryRoute(c: Context) {
  const raw = c.req.query("portfolioId")?.trim();
  if (!raw) {
    return c.json({ message: "portfolioId query required" }, 400);
  }
  const portfolioId = Number.parseInt(raw, 10);
  if (!Number.isFinite(portfolioId) || portfolioId < 1) {
    return c.json({ message: "Invalid portfolioId" }, 400);
  }
  const variantRaw = c.req.query("variant")?.trim().toLowerCase();
  let variant: AssetMixHistoryVariant = "actual";
  if (variantRaw !== undefined && variantRaw !== "") {
    if (variantRaw === "hodl") {
      variant = "hodl";
    } else if (variantRaw !== "actual") {
      return c.json({ message: "variant must be actual or hodl" }, 400);
    }
  }
  const pf = await loadPortfolioOwnedByUser(portfolioId);
  if (!pf) {
    return c.json({ message: "Portfolio not found" }, 404);
  }
  const data = await getPortfolioAssetMixHistory(portfolioId, {
    portfolio: pf,
    variant,
  });
  return c.json(data);
}
