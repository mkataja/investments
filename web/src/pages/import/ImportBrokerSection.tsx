import type { FormEvent, ReactNode, Ref } from "react";
import { useEffect, useRef } from "react";
import { Button } from "../../components/Button";
import { ErrorAlert } from "../../components/ErrorAlert";
import { FileBrowseButton } from "../../components/FileBrowseButton";
import type { HomeBroker } from "../home/types";
import type { DegiroOk } from "./types";

type ImportBrokerSectionProps = {
  title: string;
  intro: ReactNode;
  importBrokers: HomeBroker[];
  importBrokerId: number | null;
  onImportBrokerIdChange: (id: number) => void;
  importBrokerSelectId: string;
  noImportBrokersMessage: string;
  fileInputId: string;
  fileAriaLabel: string;
  accept?: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
  fileInputRef?: Ref<HTMLInputElement | null>;
  pasteOpen: boolean;
  onPasteOpenToggle: () => void;
  pasteText: string;
  onPasteChange: (value: string) => void;
  pasteTextareaId: string;
  pasteSrLabel: string;
  busy: boolean;
  onSubmit: (e: FormEvent) => void;
  error: string | null;
  errorExtra?: ReactNode;
  result: DegiroOk | null;
  footer?: ReactNode;
};

function ImportSuccessMessage({ result }: { result: DegiroOk }) {
  return (
    <p className="copy-success">
      Processed {result.processed} transaction
      {result.processed === 1 ? "" : "s"}: {result.changed} written to the
      database
      {result.unchanged > 0 ? `, ${result.unchanged} already up to date` : ""}
      {result.skippedRows != null && result.skippedRows > 0
        ? `, ${result.skippedRows} skipped (no matching instrument)`
        : ""}
      .
    </p>
  );
}

export function ImportBrokerSection({
  title,
  intro,
  importBrokers,
  importBrokerId,
  onImportBrokerIdChange,
  importBrokerSelectId,
  noImportBrokersMessage,
  fileInputId,
  fileAriaLabel,
  accept,
  file,
  onFileChange,
  fileInputRef,
  pasteOpen,
  onPasteOpenToggle,
  pasteText,
  onPasteChange,
  pasteTextareaId,
  pasteSrLabel,
  busy,
  onSubmit,
  error,
  errorExtra,
  result,
  footer,
}: ImportBrokerSectionProps) {
  const pasteTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (pasteOpen) {
      pasteTextareaRef.current?.focus();
    }
  }, [pasteOpen]);

  const hasImportTarget =
    importBrokers.length === 0 ||
    (importBrokerId != null &&
      importBrokers.some((b) => b.id === importBrokerId));
  const canSubmit =
    hasImportTarget &&
    (file !== null || (pasteOpen && pasteText.trim().length > 0));

  return (
    <section className="page-section rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2>{title}</h2>
      <div className="space-y-2 text-sm text-slate-600">{intro}</div>
      <form className="flex flex-col gap-3" onSubmit={onSubmit}>
        {importBrokers.length > 0 ? (
          <label
            className="block text-sm text-slate-700"
            htmlFor={importBrokerSelectId}
          >
            Import into broker
            <select
              id={importBrokerSelectId}
              className="mt-1 block w-full max-w-md rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
              value={importBrokerId ?? ""}
              onChange={(e) => {
                const id = Number.parseInt(e.target.value, 10);
                if (Number.isFinite(id)) {
                  onImportBrokerIdChange(id);
                }
              }}
            >
              {importBrokers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="text-sm text-slate-600">{noImportBrokersMessage}</p>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
            <Button type="button" className="w-28" onClick={onPasteOpenToggle}>
              {pasteOpen ? "Cancel" : "Paste here..."}
            </Button>
            <span className="shrink-0 text-sm font-medium text-slate-400 sm:px-0.5">
              or
            </span>
            <div className="min-w-0 flex-1">
              <FileBrowseButton
                id={fileInputId}
                ariaLabel={fileAriaLabel}
                accept={accept}
                inputRef={fileInputRef}
                file={file}
                onChange={(ev) => {
                  const f = ev.target.files?.[0];
                  onFileChange(f ?? null);
                }}
              />
            </div>
          </div>
          {canSubmit ? (
            <Button type="submit" disabled={busy}>
              {busy ? "Working..." : "Import"}
            </Button>
          ) : null}
        </div>
        {pasteOpen ? (
          <div>
            <label htmlFor={pasteTextareaId} className="sr-only">
              {pasteSrLabel}
            </label>
            <textarea
              ref={pasteTextareaRef}
              id={pasteTextareaId}
              value={pasteText}
              onChange={(ev) => {
                onPasteChange(ev.target.value);
              }}
              rows={5}
              className="my-2 max-h-32 w-full resize-y rounded border border-slate-300 px-2 py-1.5 font-mono text-xs text-slate-800"
              spellCheck={false}
            />
          </div>
        ) : null}
      </form>
      {error !== null ? (
        <ErrorAlert>
          <div className="whitespace-pre-wrap break-words">{error}</div>
          {errorExtra}
        </ErrorAlert>
      ) : null}
      {result !== null ? <ImportSuccessMessage result={result} /> : null}
      {footer}
    </section>
  );
}
