import type { CommoditySectorStorage } from "@investments/lib/commodity";
import type { RefObject } from "react";
import { sortedIsoCountryOptions } from "../../lib/isoCountrySelectOptions";
import { ErrorAlert } from "../ErrorAlert";
import type { YahooLookupResponse } from "./types";

const SECTOR_OPTIONS: readonly {
  value: CommoditySectorStorage;
  label: string;
}[] = [
  { value: "gold", label: "Gold 🟨" },
  { value: "silver", label: "Silver 🪙" },
  { value: "other", label: "Other commodities 📦" },
];

export function NewCommoditySection({
  yahooSymbol,
  setYahooSymbol,
  yahooSymbolInputRef,
  onPreviewYahoo,
  commoditySector,
  setCommoditySector,
  commodityCountryIso,
  setCommodityCountryIso,
  yahooPreview,
  yahooPreviewError,
}: {
  yahooSymbol: string;
  setYahooSymbol: (v: string) => void;
  yahooSymbolInputRef: RefObject<HTMLInputElement>;
  onPreviewYahoo: () => void;
  commoditySector: CommoditySectorStorage;
  setCommoditySector: (v: CommoditySectorStorage) => void;
  commodityCountryIso: string;
  setCommodityCountryIso: (v: string) => void;
  yahooPreview: YahooLookupResponse | null;
  yahooPreviewError: string | null;
}) {
  const countryOptions = sortedIsoCountryOptions();
  return (
    <div className="form-stack border border-slate-200 rounded-lg p-4 bg-white">
      <label className="block text-sm">
        Yahoo symbol
        <input
          ref={yahooSymbolInputRef}
          className="mt-1 block w-full border rounded px-2 py-1"
          value={yahooSymbol}
          onChange={(e) => setYahooSymbol(e.target.value)}
          placeholder="GC=F"
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
        </div>
      )}
      <hr />
      <label className="block text-sm">
        Commodity sector
        <select
          className="mt-1 block w-full border rounded px-2 py-1 bg-white"
          value={commoditySector}
          onChange={(e) =>
            setCommoditySector(e.target.value as CommoditySectorStorage)
          }
        >
          {SECTOR_OPTIONS.map((o) => (
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
  );
}
