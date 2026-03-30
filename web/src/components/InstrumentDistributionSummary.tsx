import type { DistributionPayload } from "@investments/db";
import {
  sortedSectorsForDisplay,
  topCountriesSegmentsForDisplay,
} from "../lib/distributionDisplay";

export function DistributionSummary({
  payload,
}: {
  payload: DistributionPayload;
}) {
  const countrySegs = topCountriesSegmentsForDisplay(payload.countries, 9);
  const sectorRows = sortedSectorsForDisplay(payload.sectors);
  return (
    <div className="space-y-1">
      <div className="text-xs text-slate-800">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 py-0.5 min-w-0">
          {countrySegs.length > 0 ? (
            countrySegs.map((s) => (
              <span
                key={s.key}
                className="inline-flex items-center gap-0.5 whitespace-nowrap shrink-0"
              >
                <span
                  className="text-2xl leading-none select-none"
                  title={s.label}
                  aria-hidden
                >
                  {s.icon}
                </span>
                <span className="tabular-nums">{s.pctLabel}</span>
              </span>
            ))
          ) : (
            <span>—</span>
          )}
        </div>
      </div>
      <div className="text-xs text-slate-800">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 py-0.5 min-w-0">
          {sectorRows.length > 0 ? (
            sectorRows.map((s) => (
              <span
                key={s.name}
                className="inline-flex items-center gap-0.5 shrink-0"
              >
                <span
                  className="text-2xl leading-none select-none"
                  title={s.name}
                  aria-hidden
                >
                  {s.icon}
                </span>
                <span className="tabular-nums">{s.pctLabel}</span>
              </span>
            ))
          ) : (
            <span className="py-0.5">—</span>
          )}
        </div>
      </div>
    </div>
  );
}

function cashAccountSyntheticPayload(cashGeoKey: string): DistributionPayload {
  const trimmed = cashGeoKey.trim();
  return {
    countries: trimmed.length > 0 ? { [trimmed.toUpperCase()]: 1 } : {},
    sectors: { cash: 1 },
  };
}

export function CashAccountDistributionSummary({
  cashGeoKey,
}: { cashGeoKey: string }) {
  return (
    <DistributionSummary payload={cashAccountSyntheticPayload(cashGeoKey)} />
  );
}
