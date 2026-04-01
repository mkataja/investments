import type { RefObject } from "react";
import { ErrorAlert } from "../ErrorAlert";
import { HoldingsBreakdownUrlFields } from "./HoldingsBreakdownUrlFields";
import type { InstrumentKind, YahooLookupResponse } from "./types";

export function NewYahooEtfStockSection({
  kind,
  yahooSymbol,
  setYahooSymbol,
  yahooSymbolInputRef,
  onPreviewYahoo,
  holdingsDistributionUrl,
  setHoldingsDistributionUrl,
  providerBreakdownDataUrl,
  setProviderBreakdownDataUrl,
  yahooPreview,
  yahooPreviewError,
}: {
  kind: InstrumentKind;
  yahooSymbol: string;
  setYahooSymbol: (v: string) => void;
  yahooSymbolInputRef: RefObject<HTMLInputElement>;
  onPreviewYahoo: () => void;
  holdingsDistributionUrl: string;
  setHoldingsDistributionUrl: (v: string) => void;
  providerBreakdownDataUrl: string;
  setProviderBreakdownDataUrl: (v: string) => void;
  yahooPreview: YahooLookupResponse | null;
  yahooPreviewError: string | null;
}) {
  return (
    <div className="form-stack border border-slate-200 rounded-lg p-4 bg-white">
      <label className="block text-sm">
        Yahoo symbol
        <input
          ref={yahooSymbolInputRef}
          className="mt-1 block w-full border rounded px-2 py-1"
          value={yahooSymbol}
          onChange={(e) => setYahooSymbol(e.target.value)}
          placeholder={kind === "stock" ? "BRK-B" : "SXR8.DE"}
        />
      </label>
      <button
        type="button"
        className="action-primary self-start"
        onClick={() => void onPreviewYahoo()}
      >
        Preview from Yahoo
      </button>
      {yahooPreviewError ? (
        <ErrorAlert className="mt-2">{yahooPreviewError}</ErrorAlert>
      ) : null}
      {yahooPreview && (
        <div className="text-sm text-slate-700">
          <p>
            <span className="text-slate-500">Symbol: </span>
            {yahooPreview.lookup.symbol}
          </p>
          <p>
            <span className="text-slate-500">Name: </span>
            {yahooPreview.displayName}
          </p>
          {yahooPreview.lookup.isin && (
            <p>
              <span className="text-slate-500">ISIN: </span>
              {yahooPreview.lookup.isin}
            </p>
          )}
          {(yahooPreview.lookup.sector || yahooPreview.lookup.country) && (
            <p>
              <span className="text-slate-500">Sector / country: </span>
              {[yahooPreview.lookup.sector, yahooPreview.lookup.country]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
      )}
      <hr />
      <HoldingsBreakdownUrlFields
        holdingsDistributionUrl={holdingsDistributionUrl}
        setHoldingsDistributionUrl={setHoldingsDistributionUrl}
        providerBreakdownDataUrl={providerBreakdownDataUrl}
        setProviderBreakdownDataUrl={setProviderBreakdownDataUrl}
      />
    </div>
  );
}
