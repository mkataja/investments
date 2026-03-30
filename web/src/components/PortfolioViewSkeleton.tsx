import { BlockSkeleton } from "./skeletonPrimitives";

export function PortfolioViewSkeleton() {
  return (
    <section
      className="space-y-4"
      aria-busy="true"
      aria-label="Loading portfolio"
    >
      <h2 className="text-xl font-medium text-slate-800">
        Distributions (value-weighted)
      </h2>
      <p className="text-slate-600 text-sm">
        Total estimated:{" "}
        <span className="tabular-nums inline-block align-middle min-w-[5rem]">
          <BlockSkeleton className="h-4 w-20 inline-block" />
        </span>{" "}
        EUR (incl.{" "}
        <span className="tabular-nums inline-block align-middle min-w-[4rem]">
          <BlockSkeleton className="h-4 w-16 inline-block" />
        </span>{" "}
        EUR emergency fund)
      </p>
      <div className="max-w-md">
        <h3 className="text-sm font-medium text-slate-700 mb-1">Asset mix</h3>
        <BlockSkeleton className="h-44 w-full rounded-lg" />
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="h-64">
          <h3 className="text-sm font-medium text-slate-700 mb-2">Regions</h3>
          <BlockSkeleton className="h-[calc(100%-2rem)] w-full" />
        </div>
        <div className="h-64">
          <h3 className="text-sm font-medium text-slate-700 mb-2">Sectors</h3>
          <BlockSkeleton className="h-[calc(100%-2rem)] w-full" />
        </div>
      </div>
      <h3 className="text-lg font-medium text-slate-800 mb-2">Holdings</h3>
      <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white shadow-sm text-sm">
        <table className="min-w-full">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="text-left p-2 font-medium">Ticker</th>
              <th className="text-left p-2 font-medium">Instrument</th>
              <th className="text-right p-2 font-medium">Qty</th>
              <th className="text-right p-2 font-medium">Unit EUR</th>
              <th className="text-right p-2 font-medium">Weight</th>
              <th className="text-right p-2 font-medium">Value EUR</th>
              <th className="text-left p-2 font-medium">Valuation</th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                "pos-sk-1",
                "pos-sk-2",
                "pos-sk-3",
                "pos-sk-4",
                "pos-sk-5",
              ] as const
            ).map((rowKey) => (
              <tr key={rowKey} className="border-t border-slate-100">
                <td className="p-2">
                  <BlockSkeleton className="h-4 w-14" />
                </td>
                <td className="p-2 min-w-[12rem]">
                  <BlockSkeleton className="h-4 w-40 max-w-full" />
                </td>
                <td className="p-2 text-right">
                  <BlockSkeleton className="ml-auto h-4 w-10" />
                </td>
                <td className="p-2 text-right">
                  <BlockSkeleton className="ml-auto h-4 w-16" />
                </td>
                <td className="p-2 text-right">
                  <BlockSkeleton className="ml-auto h-4 w-14" />
                </td>
                <td className="p-2 text-right">
                  <BlockSkeleton className="ml-auto h-4 w-20" />
                </td>
                <td className="p-2">
                  <BlockSkeleton className="h-4 w-24" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function TransactionsTableSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading transactions">
      <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white shadow-sm text-sm">
        <table className="min-w-full">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="text-left p-2 font-medium">Date/time</th>
              <th className="text-left p-2 font-medium">Side</th>
              <th className="text-left p-2 font-medium">Instrument</th>
              <th className="text-left p-2 font-medium">Ticker</th>
              <th className="text-right p-2 font-medium">Qty</th>
              <th className="text-right p-2 font-medium">Price</th>
              <th className="text-right p-2 font-medium">Value</th>
              <th className="text-left p-2 font-medium w-40">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                "txn-sk-1",
                "txn-sk-2",
                "txn-sk-3",
                "txn-sk-4",
                "txn-sk-5",
                "txn-sk-6",
              ] as const
            ).map((rowKey) => (
              <tr key={rowKey} className="border-t border-slate-100">
                <td className="p-2">
                  <BlockSkeleton className="h-4 w-36" />
                </td>
                <td className="p-2">
                  <BlockSkeleton className="h-4 w-10" />
                </td>
                <td className="p-2 min-w-[12rem]">
                  <BlockSkeleton className="h-4 w-48 max-w-full" />
                </td>
                <td className="p-2">
                  <BlockSkeleton className="h-4 w-16" />
                </td>
                <td className="p-2 text-right">
                  <BlockSkeleton className="ml-auto h-4 w-12" />
                </td>
                <td className="p-2 text-right">
                  <BlockSkeleton className="ml-auto h-4 w-24" />
                </td>
                <td className="p-2 text-right">
                  <BlockSkeleton className="ml-auto h-4 w-28" />
                </td>
                <td className="p-2">
                  <BlockSkeleton className="h-4 w-20" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-sm text-slate-600 tabular-nums">
        <span className="inline-block align-middle w-10">
          <BlockSkeleton className="h-4 w-8" />
        </span>{" "}
        transactions
      </p>
    </div>
  );
}
