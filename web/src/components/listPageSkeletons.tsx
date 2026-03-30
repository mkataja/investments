import { BlockSkeleton, FormFieldsCardSkeleton } from "./skeletonPrimitives";

const INSTR_ROW_KEYS = [
  "ins-sk-1",
  "ins-sk-2",
  "ins-sk-3",
  "ins-sk-4",
  "ins-sk-5",
  "ins-sk-6",
] as const;

const BR_ROW_KEYS = ["br-sk-1", "br-sk-2", "br-sk-3", "br-sk-4"] as const;

export function InstrumentsTableSkeleton() {
  return (
    <div
      className="overflow-x-auto border border-slate-200 rounded-lg bg-white shadow-sm"
      aria-busy="true"
      aria-label="Loading instruments"
    >
      <table className="min-w-full text-sm">
        <thead className="bg-slate-100 text-slate-700">
          <tr>
            <th className="text-left p-2 font-medium">Kind</th>
            <th className="text-left p-2 font-medium">Ticker</th>
            <th className="text-left p-2 font-medium whitespace-nowrap">
              ISIN
            </th>
            <th className="text-left p-2 font-medium">Name</th>
            <th className="text-left p-2 font-medium">Distribution</th>
            <th className="text-left p-2 font-medium whitespace-nowrap">
              Last updated
            </th>
            <th className="text-right p-2 font-medium w-40">Actions</th>
          </tr>
        </thead>
        <tbody>
          {INSTR_ROW_KEYS.map((rowKey) => (
            <tr key={rowKey} className="border-t border-slate-100 align-top">
              <td className="p-2">
                <BlockSkeleton className="h-4 w-16" />
              </td>
              <td className="p-2">
                <BlockSkeleton className="h-4 w-14" />
              </td>
              <td className="p-2">
                <BlockSkeleton className="h-4 w-28" />
              </td>
              <td className="p-2">
                <BlockSkeleton className="h-4 w-36 max-w-full" />
              </td>
              <td className="p-2 min-w-[14rem] max-w-xl">
                <div className="space-y-2 py-0.5">
                  <BlockSkeleton className="h-3 w-full max-w-[12rem]" />
                  <BlockSkeleton className="h-3 w-full max-w-[10rem]" />
                </div>
              </td>
              <td className="p-2 min-w-[10rem] max-w-xs">
                <BlockSkeleton className="h-3 w-36" />
              </td>
              <td className="p-2 text-right">
                <div className="flex flex-col items-end gap-2 sm:flex-row sm:justify-end sm:gap-3">
                  <BlockSkeleton className="h-4 w-20" />
                  <BlockSkeleton className="h-4 w-16" />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BrokersTableSkeleton() {
  return (
    <div
      className="overflow-x-auto border border-slate-200 rounded-lg bg-white"
      aria-busy="true"
      aria-label="Loading brokers"
    >
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left">
            <th className="px-3 py-2 font-medium">Name</th>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium w-40">Actions</th>
          </tr>
        </thead>
        <tbody>
          {BR_ROW_KEYS.map((rowKey) => (
            <tr key={rowKey} className="border-b border-slate-100">
              <td className="px-3 py-2">
                <BlockSkeleton className="h-4 w-40 max-w-full" />
              </td>
              <td className="px-3 py-2">
                <BlockSkeleton className="h-4 w-28" />
              </td>
              <td className="px-3 py-2">
                <div className="flex gap-3">
                  <BlockSkeleton className="h-4 w-10" />
                  <BlockSkeleton className="h-4 w-12" />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EditInstrumentPageSkeleton() {
  return (
    <div
      className="w-full min-w-0 space-y-4"
      aria-busy="true"
      aria-label="Loading instrument"
    >
      <BlockSkeleton className="h-4 w-36" />
      <BlockSkeleton className="h-8 w-64 max-w-full" />
      <FormFieldsCardSkeleton ariaLabel="Loading form" fields={4} />
    </div>
  );
}
