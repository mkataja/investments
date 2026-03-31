import type { RefObject } from "react";
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
}: {
  kind: InstrumentKind;
  yahooSymbol: string;
  setYahooSymbol: (v: string) => void;
  yahooSymbolInputRef: RefObject<HTMLInputElement | null>;
  onPreviewYahoo: () => void;
  holdingsDistributionUrl: string;
  setHoldingsDistributionUrl: (v: string) => void;
  providerBreakdownDataUrl: string;
  setProviderBreakdownDataUrl: (v: string) => void;
  yahooPreview: YahooLookupResponse | null;
}) {
  return (
    <div className="space-y-3 border border-slate-200 rounded-lg p-4 bg-white">
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
        className="text-sm text-emerald-800 underline"
        onClick={() => void onPreviewYahoo()}
      >
        Preview from Yahoo
      </button>
      <HoldingsBreakdownUrlFields
        holdingsDistributionUrl={holdingsDistributionUrl}
        setHoldingsDistributionUrl={setHoldingsDistributionUrl}
        providerBreakdownDataUrl={providerBreakdownDataUrl}
        setProviderBreakdownDataUrl={setProviderBreakdownDataUrl}
      />
      {yahooPreview && (
        <div className="text-sm text-slate-700 space-y-1 border-t pt-3 mt-2">
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
    </div>
  );
}
