import type { FormEvent, RefObject } from "react";
import { ImportBrokerSection } from "./ImportBrokerSection";
import type { DegiroOk } from "./types";

type ImportIbkrSectionProps = {
  busy: boolean;
  ibkrError: string | null;
  ibkrResult: DegiroOk | null;
  ibkrFile: File | null;
  onIbkrFileChange: (file: File | null) => void;
  ibkrPasteText: string;
  ibkrPasteOpen: boolean;
  onIbkrPasteOpenToggle: () => void;
  onIbkrPasteChange: (value: string) => void;
  ibkrFileInputRef: RefObject<HTMLInputElement | null>;
  ibkrMissingSymbols: string[] | null;
  ibkrAmbiguousSymbols: string[] | null;
  ibkrAmbiguousIsins: string[] | null;
  ibkrMissingIsins: string[] | null;
  onSubmitIbkr: (e: FormEvent) => void | Promise<void>;
};

export function ImportIbkrSection({
  busy,
  ibkrError,
  ibkrResult,
  ibkrFile,
  onIbkrFileChange,
  ibkrPasteText,
  ibkrPasteOpen,
  onIbkrPasteOpenToggle,
  onIbkrPasteChange,
  ibkrFileInputRef,
  ibkrMissingSymbols,
  ibkrAmbiguousSymbols,
  ibkrAmbiguousIsins,
  ibkrMissingIsins,
  onSubmitIbkr,
}: ImportIbkrSectionProps) {
  const intro = (
    <div className="space-y-3">
      <p>
        Upload a CSV from an IBKR{" "}
        <strong className="font-medium">Flex Query</strong> (web client portal →{" "}
        <em>Performance & Reports</em> → <em>Flex Queries</em>). A plain
        transaction history CSV is not supported.
      </p>
      <p>
        Broker name must be <strong className="font-medium">IBKR</strong>.
        Instruments are matched by ISIN when present in the DB, otherwise looked
        up by Yahoo symbol.
      </p>
      <div>
        <p className="font-medium text-slate-800">Active Flex Query</p>
        <p className="mt-1">
          Use for importing all <strong className="font-medium">past</strong>{" "}
          trades — does not include same-day fills. Includes max 365 days per
          export. You can import multiple exports to cover longer periods.
        </p>
        <p className="mt-1">
          Create an Active Flex Query with a <code>Trades</code> section and the
          following columns in it:{" "}
          <code>
            ClientAccountID, DateTime, Symbol, ISIN, Exchange, TransactionType,
            Quantity, TradePrice, CurrencyPrimary
          </code>
          .
        </p>
      </div>
      <div>
        <p className="font-medium text-slate-800">
          Trade Confirmation Flex Query
        </p>
        <p className="mt-1">
          Same-day fills only. Use to update{" "}
          <strong className="font-medium">today&apos;s</strong> trades not yet
          included in the above Active Flex Query.
        </p>
        <p className="mt-1">
          Create a Trade Confirmation Flex Query with the following columns:{" "}
          <code>
            ClientAccountID, Date/Time, Symbol, ISIN, Exchange, Buy/Sell,
            Quantity, Price, Currency
          </code>
          .
        </p>
      </div>
    </div>
  );

  const errorExtra =
    ibkrError !== null ? (
      <>
        {ibkrMissingIsins !== null && ibkrMissingIsins.length > 0 ? (
          <ul className="mt-2 list-disc space-y-0.5 pl-5">
            {ibkrMissingIsins.map((isin) => (
              <li key={isin} className="break-words font-mono text-sm">
                {isin}
              </li>
            ))}
          </ul>
        ) : null}
        {ibkrAmbiguousIsins !== null && ibkrAmbiguousIsins.length > 0 ? (
          <ul className="mt-2 list-disc space-y-0.5 pl-5">
            {ibkrAmbiguousIsins.map((isin) => (
              <li key={isin} className="break-words font-mono text-sm">
                {isin}
              </li>
            ))}
          </ul>
        ) : null}
        {ibkrMissingSymbols !== null && ibkrMissingSymbols.length > 0 ? (
          <ul className="mt-2 list-disc space-y-0.5 pl-5">
            {ibkrMissingSymbols.map((sym) => (
              <li key={sym} className="break-words font-mono text-sm">
                {sym}
              </li>
            ))}
          </ul>
        ) : null}
        {ibkrAmbiguousSymbols !== null && ibkrAmbiguousSymbols.length > 0 ? (
          <ul className="mt-2 list-disc space-y-0.5 pl-5">
            {ibkrAmbiguousSymbols.map((sym) => (
              <li key={sym} className="break-words font-mono text-sm">
                {sym}
              </li>
            ))}
          </ul>
        ) : null}
      </>
    ) : null;

  return (
    <ImportBrokerSection
      title="Interactive Brokers"
      intro={intro}
      fileInputId="ibkr-csv"
      fileAriaLabel="IBKR CSV file"
      accept=".csv,text/csv"
      file={ibkrFile}
      onFileChange={onIbkrFileChange}
      fileInputRef={ibkrFileInputRef}
      pasteOpen={ibkrPasteOpen}
      onPasteOpenToggle={onIbkrPasteOpenToggle}
      pasteText={ibkrPasteText}
      onPasteChange={onIbkrPasteChange}
      pasteTextareaId="ibkr-paste"
      pasteSrLabel="Paste IBKR Flex Query CSV"
      busy={busy}
      onSubmit={onSubmitIbkr}
      error={ibkrError}
      errorExtra={errorExtra}
      result={ibkrResult}
    />
  );
}
