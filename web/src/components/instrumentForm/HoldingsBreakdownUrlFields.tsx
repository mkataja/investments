import { ProviderBreakdownDataUrlHint } from "../ProviderBreakdownDataUrlHint";
import { ProviderHoldingsUrlHint } from "../ProviderHoldingsUrlHint";

export function HoldingsBreakdownUrlFields({
  holdingsDistributionUrl,
  setHoldingsDistributionUrl,
  providerBreakdownDataUrl,
  setProviderBreakdownDataUrl,
  onClearError,
}: {
  holdingsDistributionUrl: string;
  setHoldingsDistributionUrl: (v: string) => void;
  providerBreakdownDataUrl: string;
  setProviderBreakdownDataUrl: (v: string) => void;
  onClearError?: () => void;
}) {
  return (
    <>
      <label className="block text-sm">
        Provider holdings URL (optional)
        <input
          className="mt-1 block w-full border rounded px-2 py-1 font-mono text-sm"
          value={holdingsDistributionUrl}
          onChange={(e) => {
            setHoldingsDistributionUrl(e.target.value);
            onClearError?.();
          }}
        />
      </label>
      <ProviderHoldingsUrlHint />
      <hr />
      <label className="block text-sm">
        Provider breakdown data URL (optional)
        <input
          className="mt-1 block w-full border rounded px-2 py-1 font-mono text-sm"
          value={providerBreakdownDataUrl}
          onChange={(e) => {
            setProviderBreakdownDataUrl(e.target.value);
            onClearError?.();
          }}
        />
      </label>
      <ProviderBreakdownDataUrlHint />
    </>
  );
}
