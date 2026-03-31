import { type FormEvent, useEffect, useRef, useState } from "react";
import { HttpError, apiGet, apiPostFormData } from "../api";
import { Button } from "../components/Button";
import { ErrorAlert } from "../components/ErrorAlert";
import { FileBrowseButton } from "../components/FileBrowseButton";
import {
  readStoredPortfolioId,
  writeStoredPortfolioId,
} from "../lib/portfolioSelection";

type PortfolioEntity = {
  id: number;
  userId: number;
  name: string;
  createdAt: string;
  updatedAt: string;
};

type DegiroOk = {
  ok: true;
  processed: number;
  changed: number;
  unchanged: number;
  skippedRows?: number;
};

type DegiroProposalOk = {
  isin: string;
  product: string;
  referenceExchange: string;
  venue: string;
  yahooSymbol: string;
  displayName: string;
  kind: "etf" | "stock";
  quoteType: string | null;
};

type DegiroProposalErr = {
  isin: string;
  product: string;
  referenceExchange: string;
  venue: string;
  error: string;
};

type DegiroProposal = DegiroProposalOk | DegiroProposalErr;

type DegiroNeedsInstruments = {
  ok: false;
  needsInstruments: true;
  proposals: DegiroProposal[];
};

function isProposalOk(p: DegiroProposal): p is DegiroProposalOk {
  return "yahooSymbol" in p;
}

function tryParseImportErrorJson(msg: string): {
  message?: string;
  missingFundNames?: string[];
  ambiguousFundNames?: string[];
} | null {
  const idx = msg.indexOf("{");
  if (idx < 0) {
    return null;
  }
  try {
    const v = JSON.parse(msg.slice(idx)) as unknown;
    if (v === null || typeof v !== "object") {
      return null;
    }
    return v as {
      message?: string;
      missingFundNames?: string[];
      ambiguousFundNames?: string[];
    };
  } catch {
    return null;
  }
}

export function ImportPage() {
  const [degiroFile, setDegiroFile] = useState<File | null>(null);
  const [seligsonFile, setSeligsonFile] = useState<File | null>(null);
  const [seligsonPasteText, setSeligsonPasteText] = useState("");
  const [seligsonPasteOpen, setSeligsonPasteOpen] = useState(false);
  const seligsonFileInputRef = useRef<HTMLInputElement>(null);
  const seligsonPasteTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DegiroOk | null>(null);
  const [pending, setPending] = useState<DegiroNeedsInstruments | null>(null);
  const [selectedIsin, setSelectedIsin] = useState<Record<string, boolean>>({});

  const [ibkrFile, setIbkrFile] = useState<File | null>(null);
  const [ibkrError, setIbkrError] = useState<string | null>(null);
  const [ibkrResult, setIbkrResult] = useState<DegiroOk | null>(null);
  const [ibkrMissingSymbols, setIbkrMissingSymbols] = useState<string[] | null>(
    null,
  );
  const [ibkrAmbiguousSymbols, setIbkrAmbiguousSymbols] = useState<
    string[] | null
  >(null);
  const [ibkrAmbiguousIsins, setIbkrAmbiguousIsins] = useState<string[] | null>(
    null,
  );
  const [ibkrMissingIsins, setIbkrMissingIsins] = useState<string[] | null>(
    null,
  );

  const [seligsonError, setSeligsonError] = useState<string | null>(null);
  const [seligsonResult, setSeligsonResult] = useState<DegiroOk | null>(null);
  const [seligsonMissingFunds, setSeligsonMissingFunds] = useState<
    string[] | null
  >(null);
  const [seligsonAmbiguousFunds, setSeligsonAmbiguousFunds] = useState<
    string[] | null
  >(null);

  const [portfolios, setPortfolios] = useState<PortfolioEntity[]>([]);
  const [importPortfolioId, setImportPortfolioId] = useState<number | null>(
    null,
  );

  useEffect(() => {
    void (async () => {
      try {
        const list = await apiGet<PortfolioEntity[]>("/portfolios");
        setPortfolios(list);
        const stored = readStoredPortfolioId();
        const pick =
          list.find((p) => p.id === stored)?.id ?? list[0]?.id ?? null;
        setImportPortfolioId(pick);
      } catch {
        setPortfolios([]);
      }
    })();
  }, []);

  useEffect(() => {
    if (pending === null) {
      return;
    }
    const next: Record<string, boolean> = {};
    for (const p of pending.proposals) {
      if (isProposalOk(p)) {
        next[p.isin] = true;
      }
    }
    setSelectedIsin(next);
  }, [pending]);

  useEffect(() => {
    if (seligsonPasteOpen) {
      seligsonPasteTextareaRef.current?.focus();
    }
  }, [seligsonPasteOpen]);

  async function onSubmitDegiro(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setPending(null);
    if (!degiroFile) {
      setError("Choose a CSV file first.");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", degiroFile);
      if (importPortfolioId != null) {
        form.append("portfolioId", String(importPortfolioId));
      }
      const data = await apiPostFormData<
        DegiroOk | DegiroNeedsInstruments | { message?: string }
      >("/import/degiro", form);
      if (
        data &&
        typeof data === "object" &&
        "ok" in data &&
        data.ok === false &&
        "needsInstruments" in data &&
        data.needsInstruments === true &&
        "proposals" in data
      ) {
        setPending(data as DegiroNeedsInstruments);
        return;
      }
      if (
        data &&
        typeof data === "object" &&
        "ok" in data &&
        data.ok === true &&
        "processed" in data &&
        "changed" in data &&
        "unchanged" in data
      ) {
        setResult(data as DegiroOk);
        return;
      }
      setError("Unexpected response from server.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onConfirmAddAndImport(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!degiroFile || pending === null) {
      setError("Missing file or proposals.");
      return;
    }
    const toCreate = pending.proposals.filter(
      (p): p is DegiroProposalOk =>
        isProposalOk(p) && selectedIsin[p.isin] === true,
    );
    if (toCreate.length === 0) {
      setError(
        "Select at least one instrument to add, or add instruments manually.",
      );
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", degiroFile);
      if (importPortfolioId != null) {
        form.append("portfolioId", String(importPortfolioId));
      }
      form.append(
        "createInstruments",
        JSON.stringify(
          toCreate.map((p) => ({
            isin: p.isin,
            yahooSymbol: p.yahooSymbol,
            kind: p.kind,
          })),
        ),
      );
      const data = await apiPostFormData<DegiroOk | DegiroNeedsInstruments>(
        "/import/degiro",
        form,
      );
      if (
        data &&
        typeof data === "object" &&
        "ok" in data &&
        data.ok === false &&
        "needsInstruments" in data &&
        data.needsInstruments === true
      ) {
        setPending(data as DegiroNeedsInstruments);
        return;
      }
      if (
        data &&
        typeof data === "object" &&
        "ok" in data &&
        data.ok === true &&
        "processed" in data &&
        "changed" in data &&
        "unchanged" in data
      ) {
        setPending(null);
        setResult(data as DegiroOk);
        return;
      }
      setError("Import did not complete. Check the API response.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onSubmitIbkr(e: FormEvent) {
    e.preventDefault();
    setIbkrError(null);
    setIbkrResult(null);
    setIbkrMissingSymbols(null);
    setIbkrAmbiguousSymbols(null);
    setIbkrAmbiguousIsins(null);
    setIbkrMissingIsins(null);
    if (!ibkrFile) {
      setIbkrError("Choose a CSV file first.");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", ibkrFile);
      if (importPortfolioId != null) {
        form.append("portfolioId", String(importPortfolioId));
      }
      const data = await apiPostFormData<DegiroOk>("/import/ibkr", form);
      if (
        data &&
        typeof data === "object" &&
        "ok" in data &&
        data.ok === true &&
        "processed" in data &&
        "changed" in data &&
        "unchanged" in data
      ) {
        setIbkrResult(data as DegiroOk);
        return;
      }
      setIbkrError("Unexpected response from server.");
    } catch (err) {
      if (
        err instanceof HttpError &&
        err.body !== null &&
        typeof err.body === "object"
      ) {
        const o = err.body as {
          message?: string;
          missingSymbols?: string[];
          ambiguousSymbols?: string[];
          ambiguousIsins?: string[];
          missingIsins?: string[];
        };
        if (o.ambiguousIsins && o.ambiguousIsins.length > 0) {
          setIbkrAmbiguousIsins(o.ambiguousIsins);
          setIbkrError(o.message ?? err.message);
        } else if (o.missingSymbols && o.missingSymbols.length > 0) {
          setIbkrMissingSymbols(o.missingSymbols);
          if (o.missingIsins && o.missingIsins.length > 0) {
            setIbkrMissingIsins(o.missingIsins);
          }
          setIbkrError(o.message ?? err.message);
        } else if (o.ambiguousSymbols && o.ambiguousSymbols.length > 0) {
          setIbkrAmbiguousSymbols(o.ambiguousSymbols);
          setIbkrError(o.message ?? err.message);
        } else {
          setIbkrError(o.message ?? err.message);
        }
      } else {
        setIbkrError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitSeligson(skipMissingInstruments: boolean) {
    setSeligsonError(null);
    setSeligsonResult(null);
    setSeligsonMissingFunds(null);
    setSeligsonAmbiguousFunds(null);
    const fileForUpload =
      seligsonFile ??
      (seligsonPasteText.trim().length > 0
        ? new File([seligsonPasteText], "seligson-paste.tsv", {
            type: "text/tab-separated-values",
          })
        : null);
    if (fileForUpload === null) {
      setSeligsonError("Choose a file or paste export text first.");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", fileForUpload);
      if (importPortfolioId != null) {
        form.append("portfolioId", String(importPortfolioId));
      }
      if (skipMissingInstruments) {
        form.append("skipMissingInstruments", "true");
      }
      const data = await apiPostFormData<DegiroOk>("/import/seligson", form);
      if (
        data &&
        typeof data === "object" &&
        "ok" in data &&
        data.ok === true &&
        "processed" in data &&
        "changed" in data &&
        "unchanged" in data
      ) {
        setSeligsonResult(data as DegiroOk);
        setSeligsonPasteText("");
        setSeligsonPasteOpen(false);
        return;
      }
      setSeligsonError("Unexpected response from server.");
    } catch (err) {
      if (
        err instanceof HttpError &&
        err.body !== null &&
        typeof err.body === "object"
      ) {
        const o = err.body as {
          message?: string;
          missingFundNames?: string[];
          ambiguousFundNames?: string[];
        };
        if (o.missingFundNames && o.missingFundNames.length > 0) {
          setSeligsonMissingFunds(o.missingFundNames);
          setSeligsonError(o.message ?? err.message);
        } else if (o.ambiguousFundNames && o.ambiguousFundNames.length > 0) {
          setSeligsonAmbiguousFunds(o.ambiguousFundNames);
          setSeligsonError(o.message ?? err.message);
        } else {
          setSeligsonError(o.message ?? err.message);
        }
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        const parsed = tryParseImportErrorJson(msg);
        if (parsed?.missingFundNames && parsed.missingFundNames.length > 0) {
          setSeligsonMissingFunds(parsed.missingFundNames);
          setSeligsonError(parsed.message ?? msg);
        } else if (
          parsed?.ambiguousFundNames &&
          parsed.ambiguousFundNames.length > 0
        ) {
          setSeligsonAmbiguousFunds(parsed.ambiguousFundNames);
          setSeligsonError(parsed.message ?? msg);
        } else {
          setSeligsonError(msg);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  function onSubmitSeligson(e: FormEvent) {
    e.preventDefault();
    void submitSeligson(false);
  }

  return (
    <div className="max-w-2xl w-full min-w-0 page-stack">
      <div className="page-header-stack">
        <h1>Import transactions</h1>
        <p className="text-sm text-slate-600">
          Upload broker exports to add or refresh transactions idempotently.
        </p>
      </div>

      {portfolios.length > 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <label className="block text-sm text-slate-700">
            Import into portfolio
            <select
              className="mt-1 block w-full max-w-md border border-slate-300 rounded px-2 py-1.5 text-sm bg-white"
              value={importPortfolioId ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                const id = v === "" ? null : Number.parseInt(v, 10);
                if (id != null && Number.isFinite(id)) {
                  setImportPortfolioId(id);
                  writeStoredPortfolioId(id);
                }
              }}
            >
              {portfolios.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      <section className="page-section rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2>Degiro</h2>
        <p className="text-sm text-slate-600">
          Export <strong className="font-medium">Transactions</strong> from
          Degiro (CSV). Each row must resolve to exactly one instrument (etf,
          stock, or Seligson fund): by{" "}
          <strong className="font-medium">ISIN</strong> in the database, or - if
          ISIN is missing on the instrument - via OpenFIGI to your{" "}
          <strong className="font-medium">Yahoo symbol</strong>. If the CSV
          contains unknown ISINs, we fetch Yahoo details and you can add them in
          one step. Only EUR trades are imported.
        </p>
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={onSubmitDegiro}
        >
          <div className="min-w-0 flex-1">
            <FileBrowseButton
              id="degiro-csv"
              ariaLabel="Degiro CSV file"
              accept=".csv,text/csv"
              file={degiroFile}
              onChange={(ev) => {
                const f = ev.target.files?.[0];
                setDegiroFile(f ?? null);
                setResult(null);
                setPending(null);
                setError(null);
              }}
            />
          </div>
          {degiroFile !== null ? (
            <Button type="submit" disabled={busy}>
              {busy ? "Working…" : "Import"}
            </Button>
          ) : null}
        </form>
        {error !== null ? (
          <ErrorAlert>
            <div className="whitespace-pre-wrap break-words">{error}</div>
          </ErrorAlert>
        ) : null}
        {result !== null ? (
          <p className="text-sm text-emerald-800">
            Processed {result.processed} transaction
            {result.processed === 1 ? "" : "s"}: {result.changed} written to the
            database
            {result.unchanged > 0
              ? `, ${result.unchanged} already up to date`
              : ""}
            .
          </p>
        ) : null}

        {pending !== null ? (
          <div className="page-section rounded-lg border border-amber-200 bg-amber-50/80 p-4 [&_h3]:font-semibold [&_h3]:text-amber-950">
            <h3>Add missing instruments</h3>
            <p className="text-sm text-amber-950/90">
              These ISINs are not in your portfolio yet. We matched them to
              Yahoo Finance. Select which to create, then import the same CSV
              again with those instruments.
            </p>
            <ul className="list-stack">
              {pending.proposals.map((p) => (
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
                      <p className="mt-1 text-red-600">{p.error}</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <form onSubmit={onConfirmAddAndImport}>
              <Button type="submit" disabled={busy}>
                {busy ? "Working…" : "Add selected and import"}
              </Button>
            </form>
          </div>
        ) : null}
      </section>

      <section className="page-section rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2>Interactive Brokers</h2>
        <div className="mb-3 space-y-3 text-sm text-slate-600">
          <p>
            Upload a CSV from an IBKR{" "}
            <strong className="font-medium">Flex Query</strong> (web client
            portal → <em>Performance & Reports</em> → <em>Flex Queries</em>). A
            plain transaction history CSV is not supported.
          </p>
          <div>
            <p className="font-medium text-slate-800">Active Flex Query</p>
            <p className="mt-1">
              Use for importing all{" "}
              <strong className="font-medium">past</strong> trades; does not
              include same-day fills. Includes max 365 days per export — you can
              import multiple exports to cover longer periods. Required columns:{" "}
              <code>
                ClientAccountID, DateTime, Symbol, ISIN, Exchange,
                TransactionType, Quantity, TradePrice, CurrencyPrimary
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
              <strong className="font-medium">today&apos;s</strong> trades not
              yet included in the above Active Flex Query. Required columns:{" "}
              <code>
                ClientAccountID, Date/Time, Symbol, ISIN, Exchange, Buy/Sell,
                Quantity, Price, CurrencyPrimary
              </code>
              .
            </p>
          </div>
          <p>
            Broker name must be <strong className="font-medium">IBKR</strong>.
            Instruments are matched by ISIN when present in the DB, otherwise
            looked up by Yahoo symbol.
          </p>
        </div>
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={onSubmitIbkr}
        >
          <div className="min-w-0 flex-1">
            <FileBrowseButton
              id="ibkr-csv"
              ariaLabel="IBKR CSV file"
              accept=".csv,text/csv"
              file={ibkrFile}
              onChange={(ev) => {
                const f = ev.target.files?.[0];
                setIbkrFile(f ?? null);
                setIbkrResult(null);
                setIbkrError(null);
                setIbkrMissingSymbols(null);
                setIbkrAmbiguousSymbols(null);
                setIbkrAmbiguousIsins(null);
                setIbkrMissingIsins(null);
              }}
            />
          </div>
          {ibkrFile !== null ? (
            <Button type="submit" disabled={busy}>
              {busy ? "Working…" : "Import"}
            </Button>
          ) : null}
        </form>
        {ibkrError !== null ? (
          <ErrorAlert>
            <div className="whitespace-pre-wrap break-words">{ibkrError}</div>
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
            {ibkrAmbiguousSymbols !== null &&
            ibkrAmbiguousSymbols.length > 0 ? (
              <ul className="mt-2 list-disc space-y-0.5 pl-5">
                {ibkrAmbiguousSymbols.map((sym) => (
                  <li key={sym} className="break-words font-mono text-sm">
                    {sym}
                  </li>
                ))}
              </ul>
            ) : null}
          </ErrorAlert>
        ) : null}
        {ibkrResult !== null ? (
          <p className="text-sm text-emerald-800">
            Processed {ibkrResult.processed} transaction
            {ibkrResult.processed === 1 ? "" : "s"}: {ibkrResult.changed}{" "}
            written to the database
            {ibkrResult.unchanged > 0
              ? `, ${ibkrResult.unchanged} already up to date`
              : ""}
            .
          </p>
        ) : null}
      </section>

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
            , copy the full table from the header row through the summary row.
            If needed, change the page size from 25 to all items so nothing is
            missing. Paste it into the field below via{" "}
            <span className="font-medium">Paste here...</span>, or alternatively
            save the same content as a{" "}
            <span className="font-medium">text file</span> and upload it. No
            extra formatting is required — paste as-is.
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
                    setSeligsonFile(f ?? null);
                    if (f != null) {
                      setSeligsonPasteText("");
                      setSeligsonPasteOpen(false);
                    }
                    setSeligsonResult(null);
                    setSeligsonError(null);
                    setSeligsonMissingFunds(null);
                    setSeligsonAmbiguousFunds(null);
                  }}
                />
              </div>
            </div>
            {seligsonFile !== null ||
            (seligsonPasteOpen && seligsonPasteText.trim().length > 0) ? (
              <Button type="submit" disabled={busy}>
              {busy ? "Working…" : "Import"}
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
                  const v = ev.target.value;
                  setSeligsonPasteText(v);
                  if (v.length > 0) {
                    setSeligsonFile(null);
                    if (seligsonFileInputRef.current) {
                      seligsonFileInputRef.current.value = "";
                    }
                  }
                  setSeligsonResult(null);
                  setSeligsonError(null);
                  setSeligsonMissingFunds(null);
                  setSeligsonAmbiguousFunds(null);
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
            <div className="whitespace-pre-wrap break-words">
              {seligsonError}
            </div>
            {seligsonMissingFunds !== null &&
            seligsonMissingFunds.length > 0 ? (
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
            {seligsonMissingFunds !== null &&
            seligsonMissingFunds.length > 0 ? (
              <div className="mt-3">
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    void submitSeligson(true);
                  }}
                >
                  {busy ? "Working…" : "Import anyway"}
                </Button>
              </div>
            ) : null}
          </ErrorAlert>
        ) : null}
        {seligsonResult !== null ? (
          <p className="text-sm text-emerald-800">
            Processed {seligsonResult.processed} transaction
            {seligsonResult.processed === 1 ? "" : "s"}:{" "}
            {seligsonResult.changed} written to the database
            {seligsonResult.unchanged > 0
              ? `, ${seligsonResult.unchanged} already up to date`
              : ""}
            {seligsonResult.skippedRows != null &&
            seligsonResult.skippedRows > 0
              ? `, ${seligsonResult.skippedRows} skipped (no matching instrument)`
              : ""}
            .
          </p>
        ) : null}
      </section>
    </div>
  );
}
