import type { DistributionPayload } from "@investments/lib/distributionPayload";

type SeligsonFundSummary = {
  id: number;
  fid: number;
  name: string;
};

export type InstrumentListItem = {
  id: number;
  kind: string;
  displayName: string;
  /** At least one `prices` row from Yahoo (`yahoo_quote_summary`, `yahoo_fx_cross`, or `yahoo_chart_backfill`). */
  hasYahooFetchedPrice: boolean;
  /** Latest `fetched_at` among Yahoo `prices` sources (quote, FX, chart backfill), ISO string; null if none. */
  yahooPricesLastFetchedAt: string | null;
  /** Latest `fetched_at` for `yahoo_chart_backfill` only (bulk backfill 3h backoff); null if never chart-backfilled. */
  yahooChartBackfillLastFetchedAt: string | null;
  yahooSymbol: string | null;
  isin: string | null;
  seligsonFundId: number | null;
  brokerId: number | null;
  broker: {
    id: number;
    name: string;
    brokerType: string;
  } | null;
  cashGeoKey: string | null;
  cashCurrency: string | null;
  cashInterestType: string | null;
  createdAt: string;
  netQuantity: number;
  distribution: {
    fetchedAt: string;
    source: string;
    payload: DistributionPayload;
    yahooFinance?: { raw: unknown } | null;
    seligsonDistribution?: {
      holdingsHtml: string | null;
      allocationHtml: string | null;
      countryHtml: string | null;
    } | null;
  } | null;
  seligsonFund: SeligsonFundSummary | null;
};

export type RefreshDistributionResponse =
  | { ok: true; instrument: InstrumentListItem }
  | { skipped: true; reason: string };
