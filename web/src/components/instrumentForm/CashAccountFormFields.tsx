import {
  type CashCurrencyCode,
  SUPPORTED_CASH_CURRENCY_CODES,
} from "@investments/db";
import type { RefObject } from "react";
import { FormFieldsCardSkeleton } from "../skeletonPrimitives";
import type { BrokerRow } from "./types";

export function CashAccountFormFields({
  brokersLoading,
  cashBrokers,
  cashBrokerId,
  setCashBrokerId,
  cashDisplayName,
  setCashDisplayName,
  cashDisplayNameInputRef,
  cashCurrency,
  setCashCurrency,
  cashGeoKey,
  setCashGeoKey,
}: {
  brokersLoading: boolean;
  cashBrokers: BrokerRow[];
  cashBrokerId: number | "";
  setCashBrokerId: (v: number | "") => void;
  cashDisplayName: string;
  setCashDisplayName: (v: string) => void;
  cashDisplayNameInputRef?: RefObject<HTMLInputElement>;
  cashCurrency: CashCurrencyCode;
  setCashCurrency: (v: CashCurrencyCode) => void;
  cashGeoKey: string;
  setCashGeoKey: (v: string) => void;
}) {
  if (brokersLoading) {
    return <FormFieldsCardSkeleton ariaLabel="Loading brokers" fields={4} />;
  }
  return (
    <div className="form-stack border border-slate-200 rounded-lg p-4 bg-white">
      <label className="block text-sm">
        Broker
        <select
          className="mt-1 block w-full border rounded px-2 py-1"
          value={cashBrokerId === "" ? "" : String(cashBrokerId)}
          onChange={(e) => {
            const v = e.target.value;
            setCashBrokerId(v === "" ? "" : Number.parseInt(v, 10));
          }}
          required
        >
          {cashBrokers.length === 0 ? (
            <option value="">
              No cash-account-type broker - add one under Brokers
            </option>
          ) : (
            cashBrokers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))
          )}
        </select>
      </label>
      <label className="block text-sm">
        Display name
        <input
          ref={cashDisplayNameInputRef}
          className="mt-1 block w-full border rounded px-2 py-1"
          required
          value={cashDisplayName}
          onChange={(e) => setCashDisplayName(e.target.value)}
        />
      </label>
      <label className="block text-sm">
        Currency
        <select
          className="mt-1 block w-full border rounded px-2 py-1"
          value={cashCurrency}
          onChange={(e) => setCashCurrency(e.target.value as CashCurrencyCode)}
        >
          {SUPPORTED_CASH_CURRENCY_CODES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        Country code
        <input
          className="mt-1 block w-full border rounded px-2 py-1"
          required
          value={cashGeoKey}
          onChange={(e) => setCashGeoKey(e.target.value)}
          placeholder="ISO 2-letter code (e.g. FI)"
        />
      </label>
      <p className="text-xs text-slate-500">
        Cash account country is not used for portfolio distribution
        calculations.
      </p>
    </div>
  );
}
