import Skeleton from "react-loading-skeleton";

const skeletonColors = {
  baseColor: "#e2e8f0",
  highlightColor: "#f1f5f9",
};

function BlockSkeleton({ className }: { className?: string }) {
  return (
    <Skeleton
      {...skeletonColors}
      className={className}
      borderRadius={6}
      enableAnimation
    />
  );
}

export function PortfolioViewSkeleton() {
  return (
    <section
      className="space-y-4"
      aria-busy="true"
      aria-label="Loading portfolio"
    >
      <BlockSkeleton className="h-7 w-72 max-w-full" />
      <BlockSkeleton className="h-4 w-56" />
      <div className="grid md:grid-cols-2 gap-6">
        <div className="h-64 space-y-2">
          <BlockSkeleton className="h-4 w-20" />
          <BlockSkeleton className="h-[calc(100%-2rem)] w-full" />
        </div>
        <div className="h-64 space-y-2">
          <BlockSkeleton className="h-4 w-20" />
          <BlockSkeleton className="h-[calc(100%-2rem)] w-full" />
        </div>
      </div>
      <div className="overflow-x-auto border rounded-lg border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="text-left p-2 text-slate-700">Instrument</th>
              <th className="text-right p-2 text-slate-700">Weight</th>
              <th className="text-right p-2 text-slate-700">Value EUR</th>
              <th className="text-left p-2 text-slate-700">Valuation</th>
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
                  <BlockSkeleton className="h-4 w-40 max-w-full" />
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
      <div className="overflow-x-auto border rounded-lg text-sm border-slate-200">
        <table className="min-w-full">
          <thead className="bg-slate-100">
            <tr>
              <th className="text-left p-2 text-slate-700">Date/time</th>
              <th className="text-left p-2 text-slate-700">Side</th>
              <th className="text-left p-2 text-slate-700">Ticker</th>
              <th className="text-left p-2 text-slate-700">Instrument</th>
              <th className="text-right p-2 text-slate-700">Qty</th>
              <th className="text-right p-2 text-slate-700">Price</th>
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
                <td className="p-2">
                  <BlockSkeleton className="h-4 w-16" />
                </td>
                <td className="p-2 min-w-[12rem]">
                  <BlockSkeleton className="h-4 w-48 max-w-full" />
                </td>
                <td className="p-2 text-right">
                  <BlockSkeleton className="ml-auto h-4 w-12" />
                </td>
                <td className="p-2 text-right">
                  <BlockSkeleton className="ml-auto h-4 w-24" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2">
        <BlockSkeleton className="h-4 w-40" />
      </div>
    </div>
  );
}
