import type { Dispatch, FormEvent, RefObject, SetStateAction } from "react";
import { Button } from "../../components/Button";
import type { HomeBroker } from "../home/types";
import { ImportBrokerSection } from "./ImportBrokerSection";
import {
  type DegiroNeedsInstruments,
  type DegiroOk,
  type DegiroProposal,
  isProposalOk,
} from "./types";

type ImportDegiroSectionProps = {
  importBrokers: HomeBroker[];
  importBrokerId: number | null;
  onImportBrokerIdChange: (id: number) => void;
  busy: boolean;
  error: string | null;
  result: DegiroOk | null;
  pending: DegiroNeedsInstruments | null;
  degiroFile: File | null;
  onDegiroFileChange: (file: File | null) => void;
  degiroPasteText: string;
  degiroPasteOpen: boolean;
  onDegiroPasteOpenToggle: () => void;
  onDegiroPasteChange: (value: string) => void;
  degiroFileInputRef: RefObject<HTMLInputElement | null>;
  selectedIsin: Record<string, boolean>;
  setSelectedIsin: Dispatch<SetStateAction<Record<string, boolean>>>;
  onSubmitDegiro: (e: FormEvent) => void | Promise<void>;
  onConfirmAddAndImport: (e: FormEvent) => void | Promise<void>;
  deleteAllOld: boolean;
  onDeleteAllOldChange: (next: boolean) => void;
};

export function ImportDegiroSection({
  importBrokers,
  importBrokerId,
  onImportBrokerIdChange,
  busy,
  error,
  result,
  pending,
  degiroFile,
  onDegiroFileChange,
  degiroPasteText,
  degiroPasteOpen,
  onDegiroPasteOpenToggle,
  onDegiroPasteChange,
  degiroFileInputRef,
  selectedIsin,
  setSelectedIsin,
  onSubmitDegiro,
  onConfirmAddAndImport,
  deleteAllOld,
  onDeleteAllOldChange,
}: ImportDegiroSectionProps) {
  const intro = (
    <>
      <p>
        Export <strong className="font-medium">Transactions</strong> report from
        Degiro (CSV).
      </p>
      <p>
        Instruments are matched by ISIN when present in the DB, otherwise looked
        up by Yahoo symbol. Only EUR trades are imported.
      </p>
    </>
  );

  const footer =
    pending !== null ? (
      <div className="page-section mt-4 rounded-lg border border-amber-200 bg-amber-50/80 p-4 [&_h3]:font-semibold [&_h3]:text-amber-950">
        <h3>Add missing instruments</h3>
        <p className="text-sm text-amber-950/90">
          These ISINs are not in your portfolio yet. We matched them to Yahoo
          Finance. Select which to create, then import the same CSV again.
        </p>
        <ul className="list-stack">
          {pending.proposals.map((p: DegiroProposal) => (
            <li
              key={p.isin}
              className="rounded border border-amber-200/80 bg-white p-3 text-sm"
            >
              {isProposalOk(p) ? (
                <label className="flex cursor-pointer gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300"
                    checked={selectedIsin[p.isin] === true}
                    onChange={(ev) => {
                      setSelectedIsin((prev) => ({
                        ...prev,
                        [p.isin]: ev.target.checked,
                      }));
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="text-xs text-slate-600">{p.isin}</span>
                    <span className="mt-0.5 block font-medium text-slate-900">
                      {p.displayName}
                    </span>
                    <span className="mt-1 block text-xs text-slate-600">
                      Yahoo: {p.yahooSymbol} · {p.kind}
                      {p.quoteType ? ` · ${p.quoteType}` : ""}
                    </span>
                    {p.product ? (
                      <span className="mt-1 block text-xs text-slate-500">
                        Degiro: {p.product}
                      </span>
                    ) : null}
                  </span>
                </label>
              ) : (
                <div>
                  <span className="text-xs text-slate-600">{p.isin}</span>
                  <p className="field-error">{p.error}</p>
                </div>
              )}
            </li>
          ))}
        </ul>
        <form onSubmit={onConfirmAddAndImport}>
          <Button type="submit" disabled={busy}>
            {busy ? "Working..." : "Add selected and import"}
          </Button>
        </form>
      </div>
    ) : null;

  return (
    <ImportBrokerSection
      title="Degiro"
      intro={intro}
      importBrokers={importBrokers}
      importBrokerId={importBrokerId}
      onImportBrokerIdChange={onImportBrokerIdChange}
      importBrokerSelectId="import-broker-degiro"
      noImportBrokersMessage="Add an exchange broker under Instruments before importing."
      fileInputId="degiro-csv"
      fileAriaLabel="Degiro CSV file"
      accept=".csv,text/csv"
      file={degiroFile}
      onFileChange={onDegiroFileChange}
      fileInputRef={degiroFileInputRef}
      pasteOpen={degiroPasteOpen}
      onPasteOpenToggle={onDegiroPasteOpenToggle}
      pasteText={degiroPasteText}
      onPasteChange={onDegiroPasteChange}
      pasteTextareaId="degiro-paste"
      pasteSrLabel="Paste Degiro CSV"
      busy={busy}
      onSubmit={onSubmitDegiro}
      error={error}
      result={result}
      footer={footer}
      deleteAllOldControl={{
        checked: deleteAllOld,
        onChange: onDeleteAllOldChange,
      }}
    />
  );
}
