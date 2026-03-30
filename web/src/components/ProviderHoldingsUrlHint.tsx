import {
  ISHARES_HOLDINGS_EXAMPLE_URL,
  SPDR_HOLDINGS_EXAMPLE_URL,
} from "../lib/holdingsExampleUrls";

type ProviderHoldingsUrlHintProps = {
  showClearToYahooNote?: boolean;
};

export function ProviderHoldingsUrlHint({
  showClearToYahooNote = false,
}: ProviderHoldingsUrlHintProps) {
  return (
    <>
      <div className="mt-2 space-y-1.5 text-xs text-slate-600">
        <p className="font-mono break-all">
          <span className="text-slate-500">iShares example: </span>
          {ISHARES_HOLDINGS_EXAMPLE_URL}
        </p>
        <p className="font-mono break-all">
          <span className="text-slate-500">SPDR example: </span>
          {SPDR_HOLDINGS_EXAMPLE_URL}
        </p>
      </div>
      {showClearToYahooNote ? (
        <p className="text-xs text-slate-500">
          When set, country/sector distributions are built from this file
          (iShares CSV or SPDR XLSX). Clear the field to use Yahoo only.
        </p>
      ) : null}
    </>
  );
}
