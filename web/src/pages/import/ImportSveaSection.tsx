import type { FormEvent, RefObject } from "react";
import type { HomeBroker } from "../home/types";
import type { InstrumentListItem } from "../instruments/types";
import { ImportBrokerSection } from "./ImportBrokerSection";
import type { DegiroOk } from "./types";

function cashAccountSelectLabel(i: InstrumentListItem): string {
  const ccy = i.cashCurrency?.trim().toUpperCase() ?? "?";
  return `${i.displayName} (${ccy})`;
}

type ImportSveaSectionProps = {
  importBrokers: HomeBroker[];
  importBrokerId: number | null;
  onImportBrokerIdChange: (id: number) => void;
  sveaCashAccounts: InstrumentListItem[];
  sveaCashAccountsLoading: boolean;
  sveaCashInstrumentId: number | null;
  onSveaCashInstrumentIdChange: (id: number) => void;
  busy: boolean;
  sveaError: string | null;
  sveaResult: DegiroOk | null;
  sveaFile: File | null;
  onSveaFileChange: (file: File | null) => void;
  sveaPasteText: string;
  sveaPasteOpen: boolean;
  onSveaPasteOpenToggle: () => void;
  onSveaPasteChange: (value: string) => void;
  sveaFileInputRef: RefObject<HTMLInputElement | null>;
  onSubmitSvea: (e: FormEvent) => void;
};

export function ImportSveaSection({
  importBrokers,
  importBrokerId,
  onImportBrokerIdChange,
  sveaCashAccounts,
  sveaCashAccountsLoading,
  sveaCashInstrumentId,
  onSveaCashInstrumentIdChange,
  busy,
  sveaError,
  sveaResult,
  sveaFile,
  onSveaFileChange,
  sveaPasteText,
  sveaPasteOpen,
  onSveaPasteOpenToggle,
  onSveaPasteChange,
  sveaFileInputRef,
  onSubmitSvea,
}: ImportSveaSectionProps) {
  const intro = (
    <div className="space-y-2">
      <p>
        From Svea online banking, copy the full account <em>Tilitapahtumat</em>{" "}
        list (starting from the header row through all the amounts) as plain
        text. Paste via <span className="font-medium">Paste here...</span> or
        save as a <span className="font-medium">.txt</span> file and upload it.
      </p>
      <p>
        The broker must be <span className="font-medium">Cash account</span>{" "}
        type. Paste amounts are EUR; pick a EUR cash account below when offered.
        Add instruments under <em>Instruments</em> if needed.
      </p>
    </div>
  );

  const sveaCashPicker =
    importBrokers.length > 0 ? (
      sveaCashAccountsLoading ? (
        <p className="text-sm text-slate-500">Loading cash accounts...</p>
      ) : sveaCashAccounts.length === 0 ? (
        <p className="text-sm text-slate-600">
          No cash account instruments for this broker. Add one under
          Instruments.
        </p>
      ) : (
        <label
          className="block text-sm text-slate-700"
          htmlFor="import-svea-cash-instrument"
        >
          Import into cash account
          <select
            id="import-svea-cash-instrument"
            className="mt-1 block w-full max-w-md rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
            value={sveaCashInstrumentId ?? ""}
            onChange={(e) => {
              const id = Number.parseInt(e.target.value, 10);
              if (Number.isFinite(id)) {
                onSveaCashInstrumentIdChange(id);
              }
            }}
          >
            {sveaCashAccounts.map((i) => (
              <option key={i.id} value={i.id}>
                {cashAccountSelectLabel(i)}
              </option>
            ))}
          </select>
        </label>
      )
    ) : null;

  const sveaSubmitReady =
    !sveaCashAccountsLoading &&
    sveaCashAccounts.length > 0 &&
    sveaCashInstrumentId != null &&
    sveaCashAccounts.some((c) => c.id === sveaCashInstrumentId);

  return (
    <ImportBrokerSection
      title="Svea Bank"
      intro={intro}
      importBrokers={importBrokers}
      importBrokerId={importBrokerId}
      onImportBrokerIdChange={onImportBrokerIdChange}
      importBrokerSelectId="import-broker-svea"
      noImportBrokersMessage="Add a cash account broker under Instruments before importing."
      afterBrokerSelect={sveaCashPicker}
      additionalSubmitGate={sveaSubmitReady}
      fileInputId="svea-txt"
      fileAriaLabel="Svea account paste file"
      accept=".txt,text/plain"
      file={sveaFile}
      onFileChange={onSveaFileChange}
      fileInputRef={sveaFileInputRef}
      pasteOpen={sveaPasteOpen}
      onPasteOpenToggle={onSveaPasteOpenToggle}
      pasteText={sveaPasteText}
      onPasteChange={onSveaPasteChange}
      pasteTextareaId="svea-paste"
      pasteSrLabel="Paste Svea account export"
      busy={busy}
      onSubmit={onSubmitSvea}
      error={sveaError}
      result={sveaResult}
    />
  );
}
