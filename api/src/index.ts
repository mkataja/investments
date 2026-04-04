import { serve } from "@hono/node-server";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { runDevMigrations } from "./runDevMigrations.js";
import * as brokers from "./service/brokers/index.js";
import { refreshStaleDistributionCaches } from "./service/distributionCache/refreshDistribution.js";
import { processFxBackfillQueue } from "./service/fx/fxEurPriceBackfill.js";
import {
  postImportDegiro,
  postImportIbkr,
  postImportSeligson,
  postImportSvea,
} from "./service/import/index.js";
import * as instruments from "./service/instrument/index.js";
import * as portfolios from "./service/portfolio/index.js";
import * as transactions from "./service/transactions/index.js";

/**
 * HTTP surface for this app: route registration only. Handlers live under `service/`.
 * Document non-obvious request/response contracts in JSDoc on each handler (or the service it delegates to), not in `docs/api.md`.
 */
const app = new Hono();

app.use(
  "/*",
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
  }),
);

app.get("/health", (c) => c.json({ ok: true }));

app.get("/portfolios", portfolios.listPortfolios);
app.post(
  "/portfolios",
  zValidator("json", portfolios.portfolioCreateIn),
  portfolios.createPortfolio,
);
app.post(
  "/portfolios/backtest",
  zValidator("json", portfolios.portfolioBacktestCreateIn),
  portfolios.createBacktestPortfolio,
);
app.patch(
  "/portfolios/:id",
  zValidator("json", portfolios.portfolioPatchIn),
  portfolios.patchPortfolio,
);
app.delete("/portfolios/:id", portfolios.deletePortfolio);
app.get("/portfolios/:id/benchmark-weights", portfolios.getBenchmarkWeights);
app.put(
  "/portfolios/:id/benchmark-weights",
  zValidator("json", portfolios.benchmarkWeightsPutIn),
  portfolios.putBenchmarkWeights,
);

app.get("/brokers", brokers.listBrokers);
app.post(
  "/brokers",
  zValidator("json", brokers.brokerCreateIn),
  brokers.createBroker,
);
app.patch(
  "/brokers/:id",
  zValidator("json", brokers.brokerPatchIn),
  brokers.patchBroker,
);
app.delete("/brokers/:id", brokers.deleteBroker);

app.get("/transactions", transactions.getTransactions);
app.post(
  "/transactions",
  zValidator("json", transactions.transactionIn),
  transactions.postTransaction,
);
app.patch(
  "/transactions/:id",
  zValidator("json", transactions.transactionIn),
  transactions.patchTransaction,
);
app.delete("/transactions/:id", transactions.deleteTransaction);

app.post("/import/degiro", postImportDegiro);
app.post("/import/ibkr", postImportIbkr);
app.post("/import/seligson", postImportSeligson);
app.post("/import/svea", postImportSvea);

app.get("/instruments", instruments.getInstruments);
app.get("/instruments/lookup-yahoo", instruments.getInstrumentsLookupYahoo);
app.post(
  "/instruments/seligson-fund-page-preview",
  zValidator("json", instruments.seligsonFundPagePreviewIn),
  instruments.postSeligsonFundPagePreview,
);
app.post(
  "/instruments/backfill-yahoo-prices",
  instruments.postBackfillYahooPricesAll,
);
app.post(
  "/instruments/:id/backfill-yahoo-prices",
  instruments.postBackfillYahooPricesForInstrument,
);
app.post(
  "/instruments/:id/backfill-seligson-csv-prices",
  instruments.postBackfillSeligsonCsvPrices,
);
app.get("/instruments/:id", instruments.getInstrumentById);
app.post(
  "/instruments",
  zValidator("json", instruments.instrumentIn),
  instruments.postInstrument,
);
app.patch("/instruments/:id", instruments.patchInstrument);
app.post(
  "/instruments/:id/refresh-distribution",
  instruments.postRefreshInstrumentDistribution,
);
app.delete("/instruments/:id", instruments.deleteInstrument);

app.get("/positions", instruments.getPositions);
app.get("/portfolio/distributions", instruments.getPortfolioDistributionsRoute);
app.get(
  "/portfolio/asset-mix-history",
  instruments.getPortfolioAssetMixHistoryRoute,
);

const port = Number.parseInt(process.env.PORT ?? "3001", 10);

async function start(): Promise<void> {
  await runDevMigrations();

  void processFxBackfillQueue().catch((e) => {
    console.error("fx_backfill_queue drain on startup", e);
  });

  setImmediate(() => {
    void refreshStaleDistributionCaches();
  });

  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`API listening on http://localhost:${info.port}`);
  });
}

void start().catch((err) => {
  console.error(err);
  process.exit(1);
});
