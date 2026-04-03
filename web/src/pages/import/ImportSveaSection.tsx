import type { FormEvent, RefObject } from "react";
import { ImportBrokerSection } from "./ImportBrokerSection";
import type { DegiroOk } from "./types";

type ImportSveaSectionProps = {
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
        Add broker <span className="font-medium">Svea</span> with type{" "}
        <span className="font-medium">Cash account</span> and exactly one EUR
        cash account instrument for that broker (under Instruments).
      </p>
    </div>
  );

  return (
    <ImportBrokerSection
      title="Svea Bank"
      intro={intro}
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
