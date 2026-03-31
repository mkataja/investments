import { JPM_PRODUCT_DATA_BREAKDOWN_EXAMPLE_URL } from "../lib/holdingsExampleUrls";

export function ProviderBreakdownDataUrlHint() {
  return (
    <div className="mt-2 space-y-1.5 text-xs text-slate-600">
      <p className="font-mono break-all">
        <span className="text-slate-500">J.P. Morgan example: </span>
        {JPM_PRODUCT_DATA_BREAKDOWN_EXAMPLE_URL}
      </p>
    </div>
  );
}
