import type { FormEvent, RefObject } from "react";
import type { HomeBroker } from "../home/types";
import { ImportBrokerSection } from "./ImportBrokerSection";
import type { DegiroOk } from "./types";

type ImportSveaSectionProps = {
  importBrokers: HomeBroker[];
  importBrokerId: number | null;
  onImportBrokerIdChange: (id: number) => void;
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
        type with exactly one EUR cash account instrument (under Instruments).
      </p>
    </div>
  );

  return (
    <ImportBrokerSection
      title="Svea Bank"
      intro={intro}
      importBrokers={importBrokers}
      importBrokerId={importBrokerId}
      onImportBrokerIdChange={onImportBrokerIdChange}
      importBrokerSelectId="import-broker-svea"
      noImportBrokersMessage="Add a cash account broker under Instruments before importing."
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
