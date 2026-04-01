import type { FormEvent, Ref } from "react";
import { Button } from "../../components/Button";
import { ErrorAlert } from "../../components/ErrorAlert";
import { FileBrowseButton } from "../../components/FileBrowseButton";
import type { DegiroOk } from "./types";

type ImportSeligsonSectionProps = {
  busy: boolean;
  seligsonError: string | null;
  seligsonResult: DegiroOk | null;
  seligsonFile: File | null;
  setSeligsonFile: (f: File | null) => void;
  seligsonPasteText: string;
  seligsonPasteOpen: boolean;
  setSeligsonPasteOpen: (o: boolean | ((p: boolean) => boolean)) => void;
  seligsonFileInputRef: Ref<HTMLInputElement>;
  seligsonPasteTextareaRef: Ref<HTMLTextAreaElement>;
  seligsonMissingFunds: string[] | null;
  seligsonAmbiguousFunds: string[] | null;
  onSubmitSeligson: (e: FormEvent) => void;
  onSeligsonFilePicked: (file: File | null) => void;
  onSeligsonPasteChange: (value: string) => void;
  onImportAnyway: () => void;
};

export function ImportSeligsonSection({
  busy,
  seligsonError,
  seligsonResult,
  seligsonFile,
  setSeligsonFile,
  seligsonPasteText,
  seligsonPasteOpen,
  setSeligsonPasteOpen,
  seligsonFileInputRef,
  seligsonPasteTextareaRef,
  seligsonMissingFunds,
  seligsonAmbiguousFunds,
  onSubmitSeligson,
  onSeligsonFilePicked,
  onSeligsonPasteChange,
  onImportAnyway,
}: ImportSeligsonSectionProps) {
  return (
    <section className="page-section rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2>Seligson</h2>
      <div className="space-y-2 text-sm text-slate-600">
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
          , copy the full table from the header row through the summary row. If
          needed, change the page size from 25 to all items so nothing is
          missing. Paste it into the field below via{" "}
          <span className="font-medium">Paste here...</span>, or alternatively
          save the same content as a{" "}
          <span className="font-medium">text file</span> and upload it. No extra
          formatting is required — paste as-is.
        </p>
        <p>The PDF report is not supported.</p>
        <p>
          The funds need to be added to the instruments list before importing.
        </p>
      </div>
      <form className="flex flex-col gap-3" onSubmit={onSubmitSeligson}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              type="button"
              className="w-28"
              onClick={() => {
                setSeligsonPasteOpen((o) => !o);
              }}
            >
              {seligsonPasteOpen ? "Cancel" : "Paste here..."}
            </Button>
            <span className="shrink-0 text-sm font-medium text-slate-400 sm:px-0.5">
              or
            </span>
            <div className="min-w-0 flex-1">
              <FileBrowseButton
                id="seligson-tsv"
                ariaLabel="Seligson export file"
                inputRef={seligsonFileInputRef}
                file={seligsonFile}
                onChange={(ev) => {
                  const f = ev.target.files?.[0];
                  const next = f ?? null;
                  setSeligsonFile(next);
                  onSeligsonFilePicked(next);
                }}
              />
            </div>
          </div>
          {seligsonFile !== null ||
          (seligsonPasteOpen && seligsonPasteText.trim().length > 0) ? (
            <Button type="submit" disabled={busy}>
              {busy ? "Working..." : "Import"}
            </Button>
          ) : null}
        </div>
        {seligsonPasteOpen ? (
          <div>
            <label htmlFor="seligson-paste" className="sr-only">
              Paste Seligson export
            </label>
            <textarea
              ref={seligsonPasteTextareaRef}
              id="seligson-paste"
              value={seligsonPasteText}
              onChange={(ev) => {
                onSeligsonPasteChange(ev.target.value);
              }}
              rows={5}
              className="my-2 max-h-32 w-full resize-y rounded border border-slate-300 px-2 py-1.5 font-mono text-xs text-slate-800"
              spellCheck={false}
            />
          </div>
        ) : null}
      </form>
      {seligsonError !== null ? (
        <ErrorAlert>
          <div className="whitespace-pre-wrap break-words">{seligsonError}</div>
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
              <Button
                type="button"
                disabled={busy}
                onClick={() => {
                  onImportAnyway();
                }}
              >
                {busy ? "Working..." : "Import anyway"}
              </Button>
            </div>
          ) : null}
        </ErrorAlert>
      ) : null}
      {seligsonResult !== null ? (
        <p className="copy-success">
          Processed {seligsonResult.processed} transaction
          {seligsonResult.processed === 1 ? "" : "s"}: {seligsonResult.changed}{" "}
          written to the database
          {seligsonResult.unchanged > 0
            ? `, ${seligsonResult.unchanged} already up to date`
            : ""}
          {seligsonResult.skippedRows != null && seligsonResult.skippedRows > 0
            ? `, ${seligsonResult.skippedRows} skipped (no matching instrument)`
            : ""}
          .
        </p>
      ) : null}
    </section>
  );
}
