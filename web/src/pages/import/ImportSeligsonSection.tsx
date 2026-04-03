import type { FormEvent, RefObject } from "react";
import { Button } from "../../components/Button";
import type { HomeBroker } from "../home/types";
import { ImportBrokerSection } from "./ImportBrokerSection";
import type { DegiroOk } from "./types";

type ImportSeligsonSectionProps = {
  importBrokers: HomeBroker[];
  importBrokerId: number | null;
  onImportBrokerIdChange: (id: number) => void;
  busy: boolean;
  seligsonError: string | null;
  seligsonResult: DegiroOk | null;
  seligsonFile: File | null;
  onSeligsonFileChange: (file: File | null) => void;
  seligsonPasteText: string;
  seligsonPasteOpen: boolean;
  onSeligsonPasteOpenToggle: () => void;
  onSeligsonPasteChange: (value: string) => void;
  seligsonFileInputRef: RefObject<HTMLInputElement | null>;
  seligsonMissingFunds: string[] | null;
  seligsonAmbiguousFunds: string[] | null;
  onSubmitSeligson: (e: FormEvent) => void;
  onImportAnyway: () => void;
};

export function ImportSeligsonSection({
  importBrokers,
  importBrokerId,
  onImportBrokerIdChange,
  busy,
  seligsonError,
  seligsonResult,
  seligsonFile,
  onSeligsonFileChange,
  seligsonPasteText,
  seligsonPasteOpen,
  onSeligsonPasteOpenToggle,
  onSeligsonPasteChange,
  seligsonFileInputRef,
  seligsonMissingFunds,
  seligsonAmbiguousFunds,
  onSubmitSeligson,
  onImportAnyway,
}: ImportSeligsonSectionProps) {
  const intro = (
    <div className="space-y-2">
      <p>
        On{" "}
        <a
          href="https://omasalkku.seligson.fi/portfolio/transactions?view=transactions"
          target="_blank"
          rel="noopener noreferrer"
          className="text-slate-700 underline underline-offset-2 hover:text-slate-900"
        >
          <em>Oma Salkku</em> → <em>Tapahtumat</em>
        </a>
        , pick the dates you want to import, and copy the full table from the
        header row through the summary row. If needed, change the page size from
        25 to all items so nothing is missing. Paste it below via{" "}
        <span className="font-medium">Paste here...</span>, or save the same
        content as a <span className="font-medium">text file</span> and upload
        it. No extra formatting is required — paste as-is.
      </p>
      <p>The PDF report is not supported.</p>
    </div>
  );

  const errorExtra =
    seligsonError !== null ? (
      <>
        {seligsonMissingFunds !== null && seligsonMissingFunds.length > 0 ? (
          <ul className="mt-2 list-disc space-y-0.5 pl-5">
            {seligsonMissingFunds.map((name) => (
              <li key={name} className="break-words">
                {name}
              </li>
            ))}
          </ul>
        ) : null}
        {seligsonAmbiguousFunds !== null &&
        seligsonAmbiguousFunds.length > 0 ? (
          <ul className="mt-2 list-disc space-y-0.5 pl-5">
            {seligsonAmbiguousFunds.map((name) => (
              <li key={name} className="break-words">
                {name}
              </li>
            ))}
          </ul>
        ) : null}
        {seligsonMissingFunds !== null && seligsonMissingFunds.length > 0 ? (
          <div className="mt-3">
            <Button type="button" disabled={busy} onClick={onImportAnyway}>
              {busy ? "Working..." : "Import anyway"}
            </Button>
          </div>
        ) : null}
      </>
    ) : null;

  return (
    <ImportBrokerSection
      title="Seligson"
      intro={intro}
      importBrokers={importBrokers}
      importBrokerId={importBrokerId}
      onImportBrokerIdChange={onImportBrokerIdChange}
      importBrokerSelectId="import-broker-seligson"
      noImportBrokersMessage="Add a Seligson-type broker under Instruments before importing."
      fileInputId="seligson-tsv"
      fileAriaLabel="Seligson export file"
      file={seligsonFile}
      onFileChange={onSeligsonFileChange}
      fileInputRef={seligsonFileInputRef}
      pasteOpen={seligsonPasteOpen}
      onPasteOpenToggle={onSeligsonPasteOpenToggle}
      pasteText={seligsonPasteText}
      onPasteChange={onSeligsonPasteChange}
      pasteTextareaId="seligson-paste"
      pasteSrLabel="Paste Seligson export"
      busy={busy}
      onSubmit={onSubmitSeligson}
      error={seligsonError}
      errorExtra={errorExtra}
      result={seligsonResult}
    />
  );
}
