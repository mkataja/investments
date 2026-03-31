import type { RefObject } from "react";
import { FormFieldsCardSkeleton } from "../skeletonPrimitives";
import type { BrokerRow } from "./types";

export function NewCustomSeligsonSection({
  brokersLoading,
  seligsonBrokers,
  customBrokerId,
  setCustomBrokerId,
  seligsonFid,
  setSeligsonFid,
  seligsonFidInputRef,
}: {
  brokersLoading: boolean;
  seligsonBrokers: BrokerRow[];
  customBrokerId: number | "";
  setCustomBrokerId: (v: number | "") => void;
  seligsonFid: string;
  setSeligsonFid: (v: string) => void;
  seligsonFidInputRef: RefObject<HTMLInputElement | null>;
}) {
  if (brokersLoading) {
    return <FormFieldsCardSkeleton ariaLabel="Loading brokers" fields={3} />;
  }
  return (
    <div className="space-y-3 border border-slate-200 rounded-lg p-4 bg-white">
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
      <p className="text-xs text-slate-500">
        The fund name is loaded from Seligson when you create the instrument.
      </p>
    </div>
  );
}
