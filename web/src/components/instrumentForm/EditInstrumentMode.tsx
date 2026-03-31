import type { CashCurrencyCode } from "@investments/db";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { ButtonLink } from "../Button";
import { ErrorAlert } from "../ErrorAlert";
import { EditInstrumentPageSkeleton } from "../listPageSkeletons";
import { CashAccountFormFields } from "./CashAccountFormFields";
import { HoldingsBreakdownUrlFields } from "./HoldingsBreakdownUrlFields";
import { INSTRUMENT_FORM_CANCEL_LINK_CLASS } from "./cancelLinkClass";
import type { BrokerRow, InstrumentDetail } from "./types";

export function EditInstrumentMode({
  loadingEdit,
  initial,
  error,
  holdingsDistributionUrl,
  setHoldingsDistributionUrl,
  providerBreakdownDataUrl,
  setProviderBreakdownDataUrl,
  submitEditEtfStock,
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
}: {
  loadingEdit: boolean;
  initial: InstrumentDetail | null;
  error: string | null;
  holdingsDistributionUrl: string;
  setHoldingsDistributionUrl: (v: string) => void;
  providerBreakdownDataUrl: string;
  setProviderBreakdownDataUrl: (v: string) => void;
  submitEditEtfStock: (e: FormEvent) => void;
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
}) {
  if (loadingEdit) {
    return <EditInstrumentPageSkeleton />;
  }

  if (!initial) {
    return (
      <div className="w-full min-w-0 page-section">
        {error ? <ErrorAlert>{error}</ErrorAlert> : null}
        <ButtonLink to="/instruments">Back to instruments</ButtonLink>
      </div>
    );
  }

  if (initial.kind === "custom") {
    return (
      <div className="w-full min-w-0 page-stack">
        <header className="page-header-stack">
          <Link
            to="/instruments"
            className="text-sm text-emerald-800 hover:underline"
          >
            ← Instruments
          </Link>
          <h1>Edit instrument</h1>
        </header>
        <p className="text-slate-700 text-sm max-w-lg">
          Seligson-linked instruments are not edited here.
        </p>
        <ButtonLink to="/instruments">Back to instruments</ButtonLink>
      </div>
    );
  }

  if (initial.kind === "etf" || initial.kind === "stock") {
    return (
      <div className="w-full min-w-0 page-stack">
        <header className="page-header-stack">
          <Link
            to="/instruments"
            className="text-sm text-emerald-800 hover:underline"
          >
            ← Instruments
          </Link>
          <h1>Edit instrument</h1>
          <p className="text-sm text-slate-600">
            {initial.kind === "etf" ? "ETF" : "Stock"}
          </p>
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
            <button
              type="submit"
              className="bg-emerald-700 text-white px-4 py-2 rounded"
            >
              Save
            </button>
            <Link
              to="/instruments"
              className={INSTRUMENT_FORM_CANCEL_LINK_CLASS}
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    );
  }

  if (initial.kind !== "cash_account") {
    return (
      <div className="w-full min-w-0 page-stack">
        <header className="page-header-stack">
          <Link
            to="/instruments"
            className="text-sm text-emerald-800 hover:underline"
          >
            ← Instruments
          </Link>
          <h1>Edit instrument</h1>
        </header>
        <p className="text-slate-700 text-sm max-w-lg">
          This instrument type cannot be edited here.
        </p>
        <ButtonLink to="/instruments">Back to instruments</ButtonLink>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 page-stack">
      <header className="page-header-stack">
        <Link
          to="/instruments"
          className="text-sm text-emerald-800 hover:underline"
        >
          ← Instruments
        </Link>
        <h1>Edit instrument</h1>
        <p className="text-sm text-slate-600">Cash account</p>
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
            className="bg-emerald-700 text-white px-4 py-2 rounded disabled:bg-slate-300 disabled:cursor-not-allowed"
          >
            Save
          </button>
          <Link to="/instruments" className={INSTRUMENT_FORM_CANCEL_LINK_CLASS}>
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
