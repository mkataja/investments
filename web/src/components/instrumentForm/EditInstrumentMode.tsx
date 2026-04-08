import type { CommoditySectorStorage } from "@investments/lib/commodity";
import type { CashCurrencyCode } from "@investments/lib/currencies";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { sortedIsoCountryOptions } from "../../lib/isoCountrySelectOptions";
import { routes } from "../../routes";
import { ButtonLink } from "../Button";
import { ErrorAlert } from "../ErrorAlert";
import { CashAccountFormFields } from "./CashAccountFormFields";
import { HoldingsBreakdownUrlFields } from "./HoldingsBreakdownUrlFields";
import type { BrokerRow, InstrumentDetail } from "./types";

const COMMODITY_SECTOR_EDIT: readonly {
  value: CommoditySectorStorage;
  label: string;
}[] = [
  { value: "gold", label: "Gold 🟨" },
  { value: "silver", label: "Silver 🪙" },
  { value: "other", label: "Other commodities 📦" },
];

export function EditInstrumentMode({
  initial,
  error,
  holdingsDistributionUrl,
  setHoldingsDistributionUrl,
  providerBreakdownDataUrl,
  setProviderBreakdownDataUrl,
  submitEditEtfStock,
  submitEditCommodity,
  submitEditCash,
  onClearUrlError,
  brokersLoading,
  cashBrokers,
  cashBrokerId,
  setCashBrokerId,
  cashDisplayName,
  setCashDisplayName,
  cashCurrency,
  setCashCurrency,
  cashGeoKey,
  setCashGeoKey,
  commoditySector,
  setCommoditySector,
  commodityCountryIso,
  setCommodityCountryIso,
}: {
  initial: InstrumentDetail | null;
  error: string | null;
  holdingsDistributionUrl: string;
  setHoldingsDistributionUrl: (v: string) => void;
  providerBreakdownDataUrl: string;
  setProviderBreakdownDataUrl: (v: string) => void;
  submitEditEtfStock: (e: FormEvent) => void;
  submitEditCommodity: (e: FormEvent) => void;
  submitEditCash: (e: FormEvent) => void;
  onClearUrlError: () => void;
  brokersLoading: boolean;
  cashBrokers: BrokerRow[];
  cashBrokerId: number | "";
  setCashBrokerId: (v: number | "") => void;
  cashDisplayName: string;
  setCashDisplayName: (v: string) => void;
  cashCurrency: CashCurrencyCode;
  setCashCurrency: (v: CashCurrencyCode) => void;
  cashGeoKey: string;
  setCashGeoKey: (v: string) => void;
  commoditySector: CommoditySectorStorage;
  setCommoditySector: (v: CommoditySectorStorage) => void;
  commodityCountryIso: string;
  setCommodityCountryIso: (v: string) => void;
}) {
  const countryOptions = sortedIsoCountryOptions();
  if (!initial) {
    return (
      <div className="page-form-max page-section">
        {error ? <ErrorAlert>{error}</ErrorAlert> : null}
        <ButtonLink to={routes.instruments.list}>
          Back to instruments
        </ButtonLink>
      </div>
    );
  }

  if (initial.kind === "custom") {
    return (
      <div className="page-form-max page-stack">
        <header className="page-header-stack">
          <Link to={routes.instruments.list} className="action-link">
            ← Instruments
          </Link>
          <h1>Edit instrument</h1>
        </header>
        <p className="text-slate-700 text-sm max-w-lg">
          Seligson-linked instruments are not edited here.
        </p>
        <ButtonLink to={routes.instruments.list}>
          Back to instruments
        </ButtonLink>
      </div>
    );
  }

  if (initial.kind === "etf" || initial.kind === "stock") {
    return (
      <div className="page-form-max page-stack">
        <header className="page-header-stack">
          <Link to={routes.instruments.list} className="action-link">
            ← Instruments
          </Link>
          <h1>Edit {initial.kind === "etf" ? "ETF" : "stock"}</h1>
          {error ? <ErrorAlert>{error}</ErrorAlert> : null}
        </header>

        <form
          onSubmit={(e) => void submitEditEtfStock(e)}
          className="page-stack"
        >
          <div className="form-stack border border-slate-200 rounded-lg p-4 bg-white">
            <label className="block text-sm">
              Yahoo symbol
              <input
                readOnly
                className="mt-1 block w-full border rounded px-2 py-1 bg-slate-50 text-slate-800 font-mono"
                value={initial.yahooSymbol ?? ""}
              />
            </label>
            <label className="block text-sm">
              Name
              <input
                readOnly
                className="mt-1 block w-full border rounded px-2 py-1 bg-slate-50 text-slate-800"
                value={initial.displayName}
              />
            </label>
            <HoldingsBreakdownUrlFields
              holdingsDistributionUrl={holdingsDistributionUrl}
              setHoldingsDistributionUrl={setHoldingsDistributionUrl}
              providerBreakdownDataUrl={providerBreakdownDataUrl}
              setProviderBreakdownDataUrl={setProviderBreakdownDataUrl}
              onClearError={onClearUrlError}
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="submit" className="button-primary">
              Save
            </button>
            <Link to={routes.instruments.list} className="button-cancel">
              Cancel
            </Link>
          </div>
        </form>
      </div>
    );
  }

  if (initial.kind === "commodity") {
    return (
      <div className="page-form-max page-stack">
        <header className="page-header-stack">
          <Link to={routes.instruments.list} className="action-link">
            ← Instruments
          </Link>
          <h1>Edit commodity</h1>
          {error ? <ErrorAlert>{error}</ErrorAlert> : null}
        </header>

        <form
          onSubmit={(e) => void submitEditCommodity(e)}
          className="page-stack"
        >
          <div className="form-stack border border-slate-200 rounded-lg p-4 bg-white">
            <label className="block text-sm">
              Yahoo symbol
              <input
                readOnly
                className="mt-1 block w-full border rounded px-2 py-1 bg-slate-50 text-slate-800 font-mono"
                value={initial.yahooSymbol ?? ""}
              />
            </label>
            <label className="block text-sm">
              Name
              <input
                readOnly
                className="mt-1 block w-full border rounded px-2 py-1 bg-slate-50 text-slate-800"
                value={initial.displayName}
              />
            </label>
            <label className="block text-sm">
              Commodity sector
              <select
                className="mt-1 block w-full border rounded px-2 py-1 bg-white"
                value={commoditySector}
                onChange={(e) =>
                  setCommoditySector(e.target.value as CommoditySectorStorage)
                }
              >
                {COMMODITY_SECTOR_EDIT.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Country (optional)
              <select
                className="mt-1 block w-full border rounded px-2 py-1 bg-white"
                value={commodityCountryIso}
                onChange={(e) => setCommodityCountryIso(e.target.value)}
              >
                <option value="">—</option>
                {countryOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="submit" className="button-primary">
              Save
            </button>
            <Link to={routes.instruments.list} className="button-cancel">
              Cancel
            </Link>
          </div>
        </form>
      </div>
    );
  }

  if (initial.kind !== "cash_account") {
    return (
      <div className="page-form-max page-stack">
        <header className="page-header-stack">
          <Link to={routes.instruments.list} className="action-link">
            ← Instruments
          </Link>
          <h1>Edit instrument</h1>
        </header>
        <p className="text-slate-700 text-sm max-w-lg">
          This instrument type cannot be edited here.
        </p>
        <ButtonLink to={routes.instruments.list}>
          Back to instruments
        </ButtonLink>
      </div>
    );
  }

  if (initial.kind === "cash_account") {
    return (
      <div className="page-form-max page-stack">
        <header className="page-header-stack">
          <Link to={routes.instruments.list} className="action-link">
            ← Instruments
          </Link>
          <h1>Edit cash account</h1>
          {error ? <ErrorAlert>{error}</ErrorAlert> : null}
        </header>

        <form onSubmit={(e) => void submitEditCash(e)} className="page-stack">
          <CashAccountFormFields
            brokersLoading={brokersLoading}
            cashBrokers={cashBrokers}
            cashBrokerId={cashBrokerId}
            setCashBrokerId={setCashBrokerId}
            cashDisplayName={cashDisplayName}
            setCashDisplayName={setCashDisplayName}
            cashCurrency={cashCurrency}
            setCashCurrency={setCashCurrency}
            cashGeoKey={cashGeoKey}
            setCashGeoKey={setCashGeoKey}
          />

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={brokersLoading}
              className="button-primary"
            >
              Save
            </button>
            <Link to={routes.instruments.list} className="button-cancel">
              Cancel
            </Link>
          </div>
        </form>
      </div>
    );
  }
}
