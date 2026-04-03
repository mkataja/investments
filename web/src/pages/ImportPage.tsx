import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiPostFormData } from "../api/client";
import {
  buildDegiroImportFormData,
  buildIbkrImportFormData,
  buildSeligsonImportFormData,
  buildSveaImportFormData,
} from "../api/importFormData";
import {
  classifyIbkrImportHttpError,
  classifySeligsonImportHttpError,
} from "../api/importHttpError";
import {
  parseDegiroImportResponse,
  parseImportOkResponse,
} from "../api/importResponses";
import type { HomeBroker, PortfolioEntity } from "./home/types";
import { ImportDegiroSection } from "./import/ImportDegiroSection";
import { ImportIbkrSection } from "./import/ImportIbkrSection";
import {
  ImportPortfolioPicker,
  pickInitialImportPortfolioId,
} from "./import/ImportPortfolioPicker";
import { ImportSeligsonSection } from "./import/ImportSeligsonSection";
import { ImportSveaSection } from "./import/ImportSveaSection";
import {
  IMPORT_DEFAULT_BROKER_HINTS,
  filterBrokersByType,
  pickDefaultImportBrokerId,
  pickDefaultSveaCashInstrumentId,
} from "./import/importBrokerDefaults";
import { pastedTextAsImportFile } from "./import/pastedImportFile";
import {
  type DegiroNeedsInstruments,
  type DegiroOk,
  type DegiroProposalOk,
  isProposalOk,
  tryParseImportErrorJson,
} from "./import/types";
import type { InstrumentListItem } from "./instruments/types";

const CHOOSE_SOURCE_MSG = "Choose a file or paste text first.";

export function ImportPage() {
  const [degiroFile, setDegiroFile] = useState<File | null>(null);
  const [degiroPasteText, setDegiroPasteText] = useState("");
  const [degiroPasteOpen, setDegiroPasteOpen] = useState(false);
  const degiroFileInputRef = useRef<HTMLInputElement>(null);

  const [seligsonFile, setSeligsonFile] = useState<File | null>(null);
  const [seligsonPasteText, setSeligsonPasteText] = useState("");
  const [seligsonPasteOpen, setSeligsonPasteOpen] = useState(false);
  const seligsonFileInputRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DegiroOk | null>(null);
  const [pending, setPending] = useState<DegiroNeedsInstruments | null>(null);
  const [selectedIsin, setSelectedIsin] = useState<Record<string, boolean>>({});

  const [ibkrFile, setIbkrFile] = useState<File | null>(null);
  const [ibkrPasteText, setIbkrPasteText] = useState("");
  const [ibkrPasteOpen, setIbkrPasteOpen] = useState(false);
  const ibkrFileInputRef = useRef<HTMLInputElement>(null);

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

  const [sveaFile, setSveaFile] = useState<File | null>(null);
  const [sveaPasteText, setSveaPasteText] = useState("");
  const [sveaPasteOpen, setSveaPasteOpen] = useState(false);
  const sveaFileInputRef = useRef<HTMLInputElement>(null);
  const [sveaError, setSveaError] = useState<string | null>(null);
  const [sveaResult, setSveaResult] = useState<DegiroOk | null>(null);

  const [portfolios, setPortfolios] = useState<PortfolioEntity[]>([]);
  const [importPortfolioId, setImportPortfolioId] = useState<number | null>(
    null,
  );
  const [deleteAllOldDegiro, setDeleteAllOldDegiro] = useState(false);
  const [deleteAllOldIbkr, setDeleteAllOldIbkr] = useState(false);
  const [deleteAllOldSeligson, setDeleteAllOldSeligson] = useState(false);
  const [deleteAllOldSvea, setDeleteAllOldSvea] = useState(false);

  const [brokers, setBrokers] = useState<HomeBroker[]>([]);

  const [degiroBrokerId, setDegiroBrokerId] = useState<number | null>(null);
  const [ibkrBrokerId, setIbkrBrokerId] = useState<number | null>(null);
  const [seligsonBrokerId, setSeligsonBrokerId] = useState<number | null>(null);
  const [sveaBrokerId, setSveaBrokerId] = useState<number | null>(null);
  const [sveaCashAccounts, setSveaCashAccounts] = useState<
    InstrumentListItem[]
  >([]);
  const [sveaCashAccountsLoading, setSveaCashAccountsLoading] = useState(false);
  const [sveaCashInstrumentId, setSveaCashInstrumentId] = useState<
    number | null
  >(null);

  const livePortfolios = useMemo(
    () => portfolios.filter((p) => (p.kind ?? "live") !== "benchmark"),
    [portfolios],
  );

  const exchangeBrokers = useMemo(
    () => filterBrokersByType(brokers, "exchange"),
    [brokers],
  );
  const seligsonBrokers = useMemo(
    () => filterBrokersByType(brokers, "seligson"),
    [brokers],
  );
  const cashBrokers = useMemo(
    () => filterBrokersByType(brokers, "cash_account"),
    [brokers],
  );

  useEffect(() => {
    void (async () => {
      const [portfoliosRes, brokersRes] = await Promise.allSettled([
        apiGet<PortfolioEntity[]>("/portfolios"),
        apiGet<HomeBroker[]>("/brokers"),
      ]);
      if (portfoliosRes.status === "fulfilled") {
        const list = portfoliosRes.value;
        setPortfolios(list);
        setImportPortfolioId(pickInitialImportPortfolioId(list));
      } else {
        setPortfolios([]);
      }
      if (brokersRes.status === "fulfilled") {
        setBrokers(brokersRes.value);
      } else {
        setBrokers([]);
      }
    })();
  }, []);

  useEffect(() => {
    setDegiroBrokerId((prev) => {
      if (exchangeBrokers.length === 0) {
        return null;
      }
      if (prev != null && exchangeBrokers.some((b) => b.id === prev)) {
        return prev;
      }
      return pickDefaultImportBrokerId(
        exchangeBrokers,
        IMPORT_DEFAULT_BROKER_HINTS.degiro,
      );
    });
    setIbkrBrokerId((prev) => {
      if (exchangeBrokers.length === 0) {
        return null;
      }
      if (prev != null && exchangeBrokers.some((b) => b.id === prev)) {
        return prev;
      }
      return pickDefaultImportBrokerId(
        exchangeBrokers,
        IMPORT_DEFAULT_BROKER_HINTS.ibkr,
      );
    });
    setSeligsonBrokerId((prev) => {
      if (seligsonBrokers.length === 0) {
        return null;
      }
      if (prev != null && seligsonBrokers.some((b) => b.id === prev)) {
        return prev;
      }
      return pickDefaultImportBrokerId(
        seligsonBrokers,
        IMPORT_DEFAULT_BROKER_HINTS.seligson,
      );
    });
    setSveaBrokerId((prev) => {
      if (cashBrokers.length === 0) {
        return null;
      }
      if (prev != null && cashBrokers.some((b) => b.id === prev)) {
        return prev;
      }
      return pickDefaultImportBrokerId(
        cashBrokers,
        IMPORT_DEFAULT_BROKER_HINTS.svea,
      );
    });
  }, [exchangeBrokers, seligsonBrokers, cashBrokers]);

  useEffect(() => {
    if (sveaBrokerId == null) {
      setSveaCashAccounts([]);
      setSveaCashInstrumentId(null);
      setSveaCashAccountsLoading(false);
      return;
    }
    setSveaCashAccountsLoading(true);
    let cancelled = false;
    void apiGet<InstrumentListItem[]>(`/instruments?brokerId=${sveaBrokerId}`)
      .then((list) => {
        if (cancelled) {
          return;
        }
        const cash = list.filter((i) => i.kind === "cash_account");
        setSveaCashAccounts(cash);
        setSveaCashInstrumentId((prev) => {
          if (prev != null && cash.some((c) => c.id === prev)) {
            return prev;
          }
          return pickDefaultSveaCashInstrumentId(cash);
        });
      })
      .catch(() => {
        if (!cancelled) {
          setSveaCashAccounts([]);
          setSveaCashInstrumentId(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSveaCashAccountsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sveaBrokerId]);

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

  function resolveDegiroUpload(): File | null {
    return (
      degiroFile ??
      (degiroPasteText.trim().length > 0
        ? pastedTextAsImportFile(
            degiroPasteText,
            "degiro-paste.csv",
            "text/csv",
          )
        : null)
    );
  }

  function resolveIbkrUpload(): File | null {
    return (
      ibkrFile ??
      (ibkrPasteText.trim().length > 0
        ? pastedTextAsImportFile(ibkrPasteText, "ibkr-paste.csv", "text/csv")
        : null)
    );
  }

  function resolveSveaUpload(): File | null {
    return (
      sveaFile ??
      (sveaPasteText.trim().length > 0
        ? pastedTextAsImportFile(sveaPasteText, "svea-paste.txt", "text/plain")
        : null)
    );
  }

  async function onSubmitDegiro(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setPending(null);
    const upload = resolveDegiroUpload();
    if (upload === null) {
      setError(CHOOSE_SOURCE_MSG);
      return;
    }
    setBusy(true);
    try {
      const form = buildDegiroImportFormData({
        file: upload,
        portfolioId: importPortfolioId,
        brokerId: degiroBrokerId,
        deleteAllOld: deleteAllOldDegiro,
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
        setDegiroPasteText("");
        setDegiroPasteOpen(false);
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
    const upload = resolveDegiroUpload();
    if (upload === null || pending === null) {
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
        file: upload,
        portfolioId: importPortfolioId,
        brokerId: degiroBrokerId,
        createInstruments: toCreate.map((p) => ({
          isin: p.isin,
          yahooSymbol: p.yahooSymbol,
          kind: p.kind,
        })),
        deleteAllOld: deleteAllOldDegiro,
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
        setDegiroPasteText("");
        setDegiroPasteOpen(false);
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
    const upload = resolveIbkrUpload();
    if (upload === null) {
      setIbkrError(CHOOSE_SOURCE_MSG);
      return;
    }
    setBusy(true);
    try {
      const form = buildIbkrImportFormData({
        file: upload,
        portfolioId: importPortfolioId,
        brokerId: ibkrBrokerId,
        deleteAllOld: deleteAllOldIbkr,
      });
      const data = await apiPostFormData<DegiroOk>("/import/ibkr", form);
      const ok = parseImportOkResponse(data);
      if (ok != null) {
        setIbkrResult(ok);
        setIbkrPasteText("");
        setIbkrPasteOpen(false);
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
        ? pastedTextAsImportFile(
            seligsonPasteText,
            "seligson-paste.tsv",
            "text/tab-separated-values",
          )
        : null);
    if (fileForUpload === null) {
      setSeligsonError(CHOOSE_SOURCE_MSG);
      return;
    }
    setBusy(true);
    try {
      const form = buildSeligsonImportFormData({
        file: fileForUpload,
        portfolioId: importPortfolioId,
        brokerId: seligsonBrokerId,
        skipMissingInstruments,
        deleteAllOld: deleteAllOldSeligson,
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

  async function onSubmitSvea(e: FormEvent) {
    e.preventDefault();
    setSveaError(null);
    setSveaResult(null);
    const upload = resolveSveaUpload();
    if (upload === null) {
      setSveaError(CHOOSE_SOURCE_MSG);
      return;
    }
    setBusy(true);
    try {
      const form = buildSveaImportFormData({
        file: upload,
        portfolioId: importPortfolioId,
        brokerId: sveaBrokerId,
        instrumentId: sveaCashInstrumentId,
        deleteAllOld: deleteAllOldSvea,
      });
      const data = await apiPostFormData<DegiroOk>("/import/svea", form);
      const ok = parseImportOkResponse(data);
      if (ok != null) {
        setSveaResult(ok);
        setSveaPasteText("");
        setSveaPasteOpen(false);
        return;
      }
      setSveaError("Unexpected response from server.");
    } catch (err) {
      setSveaError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl w-full min-w-0 page-stack">
      <div className="page-header-stack">
        <h1>Import transactions</h1>
        <p>
          Upload broker exports to add or refresh transactions. The import is
          idempotent - importing the same data multiple times will not create
          duplicates.
        </p>
        <p>
          Before importing any transactions on an instrument, the instrument
          needs to be added to the database from the <em>Instruments</em> page.
        </p>
      </div>

      <ImportPortfolioPicker
        portfolios={portfolios}
        livePortfolios={livePortfolios}
        importPortfolioId={importPortfolioId}
        onImportPortfolioIdChange={setImportPortfolioId}
      />

      <ImportDegiroSection
        importBrokers={exchangeBrokers}
        importBrokerId={degiroBrokerId}
        onImportBrokerIdChange={setDegiroBrokerId}
        busy={busy}
        error={error}
        result={result}
        pending={pending}
        degiroFile={degiroFile}
        onDegiroFileChange={(file) => {
          setDegiroFile(file);
          if (file != null) {
            setDegiroPasteText("");
            setDegiroPasteOpen(false);
          }
          setResult(null);
          setPending(null);
          setError(null);
        }}
        degiroPasteText={degiroPasteText}
        degiroPasteOpen={degiroPasteOpen}
        onDegiroPasteOpenToggle={() => {
          setDegiroPasteOpen((o) => !o);
        }}
        onDegiroPasteChange={(v) => {
          setDegiroPasteText(v);
          if (v.length > 0) {
            setDegiroFile(null);
            if (degiroFileInputRef.current) {
              degiroFileInputRef.current.value = "";
            }
          }
          setResult(null);
          setPending(null);
          setError(null);
        }}
        degiroFileInputRef={degiroFileInputRef}
        selectedIsin={selectedIsin}
        setSelectedIsin={setSelectedIsin}
        onSubmitDegiro={onSubmitDegiro}
        onConfirmAddAndImport={onConfirmAddAndImport}
        deleteAllOld={deleteAllOldDegiro}
        onDeleteAllOldChange={setDeleteAllOldDegiro}
      />

      <ImportIbkrSection
        importBrokers={exchangeBrokers}
        importBrokerId={ibkrBrokerId}
        onImportBrokerIdChange={setIbkrBrokerId}
        busy={busy}
        ibkrError={ibkrError}
        ibkrResult={ibkrResult}
        ibkrFile={ibkrFile}
        onIbkrFileChange={(file) => {
          setIbkrFile(file);
          if (file != null) {
            setIbkrPasteText("");
            setIbkrPasteOpen(false);
          }
          setIbkrResult(null);
          setIbkrError(null);
          setIbkrMissingSymbols(null);
          setIbkrAmbiguousSymbols(null);
          setIbkrAmbiguousIsins(null);
          setIbkrMissingIsins(null);
        }}
        ibkrPasteText={ibkrPasteText}
        ibkrPasteOpen={ibkrPasteOpen}
        onIbkrPasteOpenToggle={() => {
          setIbkrPasteOpen((o) => !o);
        }}
        onIbkrPasteChange={(v) => {
          setIbkrPasteText(v);
          if (v.length > 0) {
            setIbkrFile(null);
            if (ibkrFileInputRef.current) {
              ibkrFileInputRef.current.value = "";
            }
          }
          setIbkrResult(null);
          setIbkrError(null);
          setIbkrMissingSymbols(null);
          setIbkrAmbiguousSymbols(null);
          setIbkrAmbiguousIsins(null);
          setIbkrMissingIsins(null);
        }}
        ibkrFileInputRef={ibkrFileInputRef}
        ibkrMissingSymbols={ibkrMissingSymbols}
        ibkrAmbiguousSymbols={ibkrAmbiguousSymbols}
        ibkrAmbiguousIsins={ibkrAmbiguousIsins}
        ibkrMissingIsins={ibkrMissingIsins}
        onSubmitIbkr={onSubmitIbkr}
        deleteAllOld={deleteAllOldIbkr}
        onDeleteAllOldChange={setDeleteAllOldIbkr}
      />

      <ImportSeligsonSection
        importBrokers={seligsonBrokers}
        importBrokerId={seligsonBrokerId}
        onImportBrokerIdChange={setSeligsonBrokerId}
        busy={busy}
        seligsonError={seligsonError}
        seligsonResult={seligsonResult}
        seligsonFile={seligsonFile}
        onSeligsonFileChange={(file) => {
          setSeligsonFile(file);
          if (file != null) {
            setSeligsonPasteText("");
            setSeligsonPasteOpen(false);
          }
          setSeligsonResult(null);
          setSeligsonError(null);
          setSeligsonMissingFunds(null);
          setSeligsonAmbiguousFunds(null);
        }}
        seligsonPasteText={seligsonPasteText}
        seligsonPasteOpen={seligsonPasteOpen}
        onSeligsonPasteOpenToggle={() => {
          setSeligsonPasteOpen((o) => !o);
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
        seligsonFileInputRef={seligsonFileInputRef}
        seligsonMissingFunds={seligsonMissingFunds}
        seligsonAmbiguousFunds={seligsonAmbiguousFunds}
        onSubmitSeligson={onSubmitSeligson}
        onImportAnyway={() => {
          void submitSeligson(true);
        }}
        deleteAllOld={deleteAllOldSeligson}
        onDeleteAllOldChange={setDeleteAllOldSeligson}
      />

      <ImportSveaSection
        importBrokers={cashBrokers}
        importBrokerId={sveaBrokerId}
        onImportBrokerIdChange={setSveaBrokerId}
        sveaCashAccounts={sveaCashAccounts}
        sveaCashAccountsLoading={sveaCashAccountsLoading}
        sveaCashInstrumentId={sveaCashInstrumentId}
        onSveaCashInstrumentIdChange={setSveaCashInstrumentId}
        busy={busy}
        sveaError={sveaError}
        sveaResult={sveaResult}
        sveaFile={sveaFile}
        onSveaFileChange={(file) => {
          setSveaFile(file);
          if (file != null) {
            setSveaPasteText("");
            setSveaPasteOpen(false);
          }
          setSveaResult(null);
          setSveaError(null);
        }}
        sveaPasteText={sveaPasteText}
        sveaPasteOpen={sveaPasteOpen}
        onSveaPasteOpenToggle={() => {
          setSveaPasteOpen((o) => !o);
        }}
        onSveaPasteChange={(v) => {
          setSveaPasteText(v);
          if (v.length > 0) {
            setSveaFile(null);
            if (sveaFileInputRef.current) {
              sveaFileInputRef.current.value = "";
            }
          }
          setSveaResult(null);
          setSveaError(null);
        }}
        sveaFileInputRef={sveaFileInputRef}
        onSubmitSvea={onSubmitSvea}
        deleteAllOld={deleteAllOldSvea}
        onDeleteAllOldChange={setDeleteAllOldSvea}
      />
    </div>
  );
}
