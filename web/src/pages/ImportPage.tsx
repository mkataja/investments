import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  apiGet,
  apiPostFormData,
  buildDegiroImportFormData,
  buildIbkrImportFormData,
  buildSeligsonImportFormData,
  classifyIbkrImportHttpError,
  classifySeligsonImportHttpError,
  parseDegiroImportResponse,
  parseImportOkResponse,
} from "../api";
import type { PortfolioEntity } from "./home/types";
import { ImportDegiroSection } from "./import/ImportDegiroSection";
import { ImportIbkrSection } from "./import/ImportIbkrSection";
import {
  ImportPortfolioPicker,
  pickInitialImportPortfolioId,
} from "./import/ImportPortfolioPicker";
import { ImportSeligsonSection } from "./import/ImportSeligsonSection";
import {
  type DegiroNeedsInstruments,
  type DegiroOk,
  type DegiroProposalOk,
  isProposalOk,
  tryParseImportErrorJson,
} from "./import/types";

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

  const livePortfolios = useMemo(
    () => portfolios.filter((p) => (p.kind ?? "live") !== "benchmark"),
    [portfolios],
  );

  useEffect(() => {
    void (async () => {
      try {
        const list = await apiGet<PortfolioEntity[]>("/portfolios");
        setPortfolios(list);
        setImportPortfolioId(pickInitialImportPortfolioId(list));
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
      const form = buildDegiroImportFormData({
        file: degiroFile,
        portfolioId: importPortfolioId,
      });
      const data = await apiPostFormData<
        DegiroOk | DegiroNeedsInstruments | { message?: string }
      >("/import/degiro", form);
      const parsed = parseDegiroImportResponse(data);
      if (parsed.outcome === "needsInstruments") {
        setPending(parsed.value);
        return;
      }
      if (parsed.outcome === "ok") {
        setResult(parsed.value);
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
      const form = buildDegiroImportFormData({
        file: degiroFile,
        portfolioId: importPortfolioId,
        createInstruments: toCreate.map((p) => ({
          isin: p.isin,
          yahooSymbol: p.yahooSymbol,
          kind: p.kind,
        })),
      });
      const data = await apiPostFormData<DegiroOk | DegiroNeedsInstruments>(
        "/import/degiro",
        form,
      );
      const parsed = parseDegiroImportResponse(data);
      if (parsed.outcome === "needsInstruments") {
        setPending(parsed.value);
        return;
      }
      if (parsed.outcome === "ok") {
        setPending(null);
        setResult(parsed.value);
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
      const form = buildIbkrImportFormData(ibkrFile, importPortfolioId);
      const data = await apiPostFormData<DegiroOk>("/import/ibkr", form);
      const ok = parseImportOkResponse(data);
      if (ok != null) {
        setIbkrResult(ok);
        return;
      }
      setIbkrError("Unexpected response from server.");
    } catch (err) {
      const classified = classifyIbkrImportHttpError(err);
      if (classified != null) {
        if (classified.kind === "ambiguousIsins") {
          setIbkrAmbiguousIsins(classified.isins);
          setIbkrError(classified.message);
        } else if (classified.kind === "missingSymbols") {
          setIbkrMissingSymbols(classified.symbols);
          if (classified.missingIsins != null) {
            setIbkrMissingIsins(classified.missingIsins);
          }
          setIbkrError(classified.message);
        } else if (classified.kind === "ambiguousSymbols") {
          setIbkrAmbiguousSymbols(classified.symbols);
          setIbkrError(classified.message);
        } else {
          setIbkrError(classified.message);
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
      const form = buildSeligsonImportFormData({
        file: fileForUpload,
        portfolioId: importPortfolioId,
        skipMissingInstruments,
      });
      const data = await apiPostFormData<DegiroOk>("/import/seligson", form);
      const ok = parseImportOkResponse(data);
      if (ok != null) {
        setSeligsonResult(ok);
        setSeligsonPasteText("");
        setSeligsonPasteOpen(false);
        return;
      }
      setSeligsonError("Unexpected response from server.");
    } catch (err) {
      const classified = classifySeligsonImportHttpError(err);
      if (classified != null) {
        if (classified.kind === "missingFunds") {
          setSeligsonMissingFunds(classified.names);
          setSeligsonError(classified.message);
        } else if (classified.kind === "ambiguousFunds") {
          setSeligsonAmbiguousFunds(classified.names);
          setSeligsonError(classified.message);
        } else {
          setSeligsonError(classified.message);
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

      <ImportPortfolioPicker
        portfolios={portfolios}
        livePortfolios={livePortfolios}
        importPortfolioId={importPortfolioId}
        onImportPortfolioIdChange={setImportPortfolioId}
      />

      <ImportDegiroSection
        busy={busy}
        error={error}
        result={result}
        pending={pending}
        degiroFile={degiroFile}
        setDegiroFile={setDegiroFile}
        selectedIsin={selectedIsin}
        setSelectedIsin={setSelectedIsin}
        onSubmitDegiro={onSubmitDegiro}
        onConfirmAddAndImport={onConfirmAddAndImport}
        onDegiroFileChange={() => {
          setResult(null);
          setPending(null);
          setError(null);
        }}
      />

      <ImportIbkrSection
        busy={busy}
        ibkrError={ibkrError}
        ibkrResult={ibkrResult}
        ibkrFile={ibkrFile}
        setIbkrFile={setIbkrFile}
        ibkrMissingSymbols={ibkrMissingSymbols}
        ibkrAmbiguousSymbols={ibkrAmbiguousSymbols}
        ibkrAmbiguousIsins={ibkrAmbiguousIsins}
        ibkrMissingIsins={ibkrMissingIsins}
        onSubmitIbkr={onSubmitIbkr}
        onIbkrFileChange={() => {
          setIbkrResult(null);
          setIbkrError(null);
          setIbkrMissingSymbols(null);
          setIbkrAmbiguousSymbols(null);
          setIbkrAmbiguousIsins(null);
          setIbkrMissingIsins(null);
        }}
      />

      <ImportSeligsonSection
        busy={busy}
        seligsonError={seligsonError}
        seligsonResult={seligsonResult}
        seligsonFile={seligsonFile}
        setSeligsonFile={setSeligsonFile}
        seligsonPasteText={seligsonPasteText}
        seligsonPasteOpen={seligsonPasteOpen}
        setSeligsonPasteOpen={setSeligsonPasteOpen}
        seligsonFileInputRef={seligsonFileInputRef}
        seligsonPasteTextareaRef={seligsonPasteTextareaRef}
        seligsonMissingFunds={seligsonMissingFunds}
        seligsonAmbiguousFunds={seligsonAmbiguousFunds}
        onSubmitSeligson={onSubmitSeligson}
        onSeligsonFilePicked={(file) => {
          if (file != null) {
            setSeligsonPasteText("");
            setSeligsonPasteOpen(false);
          }
          setSeligsonResult(null);
          setSeligsonError(null);
          setSeligsonMissingFunds(null);
          setSeligsonAmbiguousFunds(null);
        }}
        onSeligsonPasteChange={(v) => {
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
        onImportAnyway={() => {
          void submitSeligson(true);
        }}
      />
    </div>
  );
}
