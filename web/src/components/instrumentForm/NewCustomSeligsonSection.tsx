import type { RefObject } from "react";
import { FormFieldsCardSkeleton } from "../skeletonPrimitives";
import {
  type CompositePreviewRow,
  SeligsonCompositeAllocationPanel,
} from "./SeligsonCompositeModal";
import type { BrokerRow } from "./types";

export function NewCustomSeligsonSection({
  brokersLoading,
  seligsonBrokers,
  customBrokerId,
  setCustomBrokerId,
  seligsonFid,
  setSeligsonFid,
  seligsonFidInputRef,
  useCompositeAllocation,
  setUseCompositeAllocation,
  compositeTableUrl,
  setCompositeTableUrl,
  compositeTableUrlInputRef,
  onLoadComposition,
  compositionLoading,
  compositePreview,
  compositeFundDisplayName,
  setCompositeFundDisplayName,
  compositeSelectionByRow,
  onCompositeSelectionChange,
  instrumentOptionsForComposite,
  onConfirmCompositeAllocation,
  confirmCompositeDisabled,
  onClearCompositeAllocation,
}: {
  brokersLoading: boolean;
  seligsonBrokers: BrokerRow[];
  customBrokerId: number | "";
  setCustomBrokerId: (v: number | "") => void;
  seligsonFid: string;
  setSeligsonFid: (v: string) => void;
  seligsonFidInputRef: RefObject<HTMLInputElement>;
  useCompositeAllocation: boolean;
  setUseCompositeAllocation: (v: boolean) => void;
  compositeTableUrl: string;
  setCompositeTableUrl: (v: string) => void;
  compositeTableUrlInputRef: RefObject<HTMLInputElement>;
  onLoadComposition: () => void;
  compositionLoading: boolean;
  compositePreview: {
    asOfDate: string | null;
    notes: string[];
    rows: CompositePreviewRow[];
  } | null;
  compositeFundDisplayName: string;
  setCompositeFundDisplayName: (v: string) => void;
  compositeSelectionByRow: Record<number, string>;
  onCompositeSelectionChange: (rowIndex: number, value: string) => void;
  instrumentOptionsForComposite: Array<{
    id: number;
    kind: string;
    displayName: string;
    yahooSymbol: string | null;
    seligsonFund: { name: string } | null;
  }>;
  onConfirmCompositeAllocation: () => void;
  confirmCompositeDisabled: boolean;
  onClearCompositeAllocation: () => void;
}) {
  if (brokersLoading) {
    return <FormFieldsCardSkeleton ariaLabel="Loading brokers" fields={3} />;
  }
  return (
    <div className="form-stack border border-slate-200 rounded-lg p-4 bg-white">
      <label className="block text-sm">
        Broker
        <select
          className="mt-1 block w-full border rounded px-2 py-1"
          value={customBrokerId === "" ? "" : String(customBrokerId)}
          onChange={(e) => {
            const v = e.target.value;
            setCustomBrokerId(v === "" ? "" : Number.parseInt(v, 10));
          }}
          required
        >
          {seligsonBrokers.length === 0 ? (
            <option value="">
              No Seligson-type broker - add one under Brokers
            </option>
          ) : (
            seligsonBrokers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))
          )}
        </select>
      </label>
      {!useCompositeAllocation ? (
        <label className="block text-sm">
          Seligson FID
          <input
            ref={seligsonFidInputRef}
            type="number"
            min={1}
            className="mt-1 block w-full border rounded px-2 py-1"
            value={seligsonFid}
            onChange={(e) => setSeligsonFid(e.target.value)}
            placeholder="FundViewer fid=…"
          />
        </label>
      ) : null}
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={useCompositeAllocation}
          onChange={(e) => setUseCompositeAllocation(e.target.checked)}
        />
        Composite allocation from public table
      </label>
      {useCompositeAllocation ? (
        <div className="form-stack">
          <label className="block text-sm">
            Allocation table URL
            <input
              ref={compositeTableUrlInputRef}
              type="url"
              className="mt-1 block w-full border rounded px-2 py-1"
              value={compositeTableUrl}
              onChange={(e) => setCompositeTableUrl(e.target.value)}
              placeholder="https://www.seligson.fi/…/…-taulukko/"
            />
          </label>
          <button
            type="button"
            className="bg-emerald-700 disabled:bg-slate-300 text-white px-4 py-2 rounded w-fit"
            disabled={compositionLoading}
            onClick={onLoadComposition}
          >
            {compositionLoading ? "Loading…" : "Load composition"}
          </button>
          {compositePreview != null ? (
            <SeligsonCompositeAllocationPanel
              asOfDate={compositePreview.asOfDate}
              notes={compositePreview.notes}
              fundDisplayName={compositeFundDisplayName}
              onFundDisplayNameChange={setCompositeFundDisplayName}
              rows={compositePreview.rows}
              instrumentOptions={instrumentOptionsForComposite}
              selectionByRow={compositeSelectionByRow}
              onChangeSelection={onCompositeSelectionChange}
              onConfirm={onConfirmCompositeAllocation}
              confirmDisabled={confirmCompositeDisabled}
              onClear={onClearCompositeAllocation}
            />
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-slate-500">
          The fund name is loaded from Seligson when you create the instrument.
        </p>
      )}
    </div>
  );
}
