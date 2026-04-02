import type { RefObject } from "react";
import type { SeligsonFundPageCompositePreviewResponse } from "../../api/seligsonFundPageCompositePreview";
import type { InstrumentListItem } from "../../pages/instruments/types";
import { FormFieldsCardSkeleton } from "../skeletonPrimitives";
import { SeligsonCompositeAllocationPanel } from "./SeligsonCompositeAllocationPanel";
import type { BrokerRow, SeligsonCompositeMappedRow } from "./types";

export function NewCustomSeligsonSection({
  brokersLoading,
  seligsonBrokers,
  customBrokerId,
  setCustomBrokerId,
  seligsonFundPageUrl,
  setSeligsonFundPageUrl,
  seligsonFundPageUrlInputRef,
  seligsonCompositePreview,
  seligsonCompositePreviewLoading,
  seligsonCompositePreviewError,
  seligsonCompositeMappedRows,
  setSeligsonCompositeMappedRows,
  seligsonCompositeInstrumentOptions,
  seligsonCompositeInstrumentOptionsLoading,
  seligsonCompositeInstrumentOptionsError,
}: {
  brokersLoading: boolean;
  seligsonBrokers: BrokerRow[];
  customBrokerId: number | "";
  setCustomBrokerId: (v: number | "") => void;
  seligsonFundPageUrl: string;
  setSeligsonFundPageUrl: (v: string) => void;
  seligsonFundPageUrlInputRef: RefObject<HTMLInputElement>;
  seligsonCompositePreview: SeligsonFundPageCompositePreviewResponse | null;
  seligsonCompositePreviewLoading: boolean;
  seligsonCompositePreviewError: string | null;
  seligsonCompositeMappedRows: SeligsonCompositeMappedRow[];
  setSeligsonCompositeMappedRows: (v: SeligsonCompositeMappedRow[]) => void;
  seligsonCompositeInstrumentOptions: InstrumentListItem[];
  seligsonCompositeInstrumentOptionsLoading: boolean;
  seligsonCompositeInstrumentOptionsError: string | null;
}) {
  if (brokersLoading) {
    return <FormFieldsCardSkeleton ariaLabel="Loading brokers" fields={3} />;
  }
  const showComposite =
    seligsonCompositePreview?.composite === true &&
    seligsonCompositePreview.rows.length > 0;

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

      <label className="block text-sm">
        Fund page URL
        <input
          ref={seligsonFundPageUrlInputRef}
          type="url"
          className="mt-1 block w-full border rounded px-2 py-1"
          value={seligsonFundPageUrl}
          onChange={(e) => setSeligsonFundPageUrl(e.target.value)}
          placeholder="https://www.seligson.fi/suomi/rahastot/..."
        />
      </label>

      {seligsonCompositePreviewLoading ? (
        <p className="text-xs text-slate-500">Analyzing fund page...</p>
      ) : null}
      {seligsonCompositePreviewError != null &&
      seligsonCompositePreviewError !== "" ? (
        <p className="text-xs text-amber-800">
          {seligsonCompositePreviewError}
        </p>
      ) : null}

      <p className="text-xs text-slate-500">
        Paste the public fund page on seligson.fi (for example{" "}
        <code className="text-[11px] bg-slate-100 px-1 rounded">
          https://www.seligson.fi/suomi/rahastot/rahes_suomi.htm
        </code>
        ).
      </p>

      {showComposite ? (
        <SeligsonCompositeAllocationPanel
          previewRows={seligsonCompositePreview.rows}
          mappedRows={seligsonCompositeMappedRows}
          onChangeMapped={setSeligsonCompositeMappedRows}
          fundName={seligsonCompositePreview.fundName}
          notes={seligsonCompositePreview.notes}
          instrumentOptions={seligsonCompositeInstrumentOptions}
          instrumentOptionsLoading={seligsonCompositeInstrumentOptionsLoading}
          instrumentOptionsError={seligsonCompositeInstrumentOptionsError}
        />
      ) : null}
    </div>
  );
}
