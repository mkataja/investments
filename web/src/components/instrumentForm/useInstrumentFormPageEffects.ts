import type { CommoditySectorStorage } from "@investments/lib/commodity";
import {
  type CashCurrencyCode,
  DEFAULT_CASH_CURRENCY,
} from "@investments/lib/currencies";
import { sortByTransactionInstrumentSelectLabel } from "@investments/lib/instrumentSelectLabel";
import {
  type MutableRefObject,
  type RefObject,
  useEffect,
  useRef,
} from "react";
import { apiGet } from "../../api/client";
import {
  type SeligsonFundPageCompositePreviewResponse,
  postSeligsonFundPageCompositePreview,
} from "../../api/seligsonFundPageCompositePreview";
import type { InstrumentListItem } from "../../pages/instruments/types";
import { normalizeWwwSeligsonFundPageUrl } from "./instrumentFormPageSeligson";
import type {
  BrokerRow,
  InstrumentDetail,
  InstrumentKind,
  SeligsonCompositeMappedRow,
} from "./types";

export function useLoadBrokersEffect(
  setBrokers: (rows: BrokerRow[]) => void,
  setBrokersLoading: (v: boolean) => void,
  setError: (e: string | null) => void,
) {
  useEffect(() => {
    setBrokersLoading(true);
    void apiGet<BrokerRow[]>("/brokers")
      .then(setBrokers)
      .catch((e) => setError(String(e)))
      .finally(() => setBrokersLoading(false));
  }, [setBrokers, setBrokersLoading, setError]);
}

export function useCompositeInstrumentOptionsEffect(
  mode: "new" | "edit",
  kind: InstrumentKind | null,
  setSeligsonCompositeInstrumentOptions: (list: InstrumentListItem[]) => void,
  setSeligsonCompositeInstrumentOptionsLoading: (v: boolean) => void,
  setSeligsonCompositeInstrumentOptionsError: (e: string | null) => void,
) {
  useEffect(() => {
    if (mode !== "new" || kind !== "custom") {
      setSeligsonCompositeInstrumentOptions([]);
      setSeligsonCompositeInstrumentOptionsLoading(false);
      setSeligsonCompositeInstrumentOptionsError(null);
      return;
    }
    let cancelled = false;
    setSeligsonCompositeInstrumentOptionsLoading(true);
    setSeligsonCompositeInstrumentOptionsError(null);
    void apiGet<InstrumentListItem[]>("/instruments")
      .then((list) => {
        if (cancelled) {
          return;
        }
        setSeligsonCompositeInstrumentOptions(
          sortByTransactionInstrumentSelectLabel(list),
        );
      })
      .catch((e) => {
        if (!cancelled) {
          setSeligsonCompositeInstrumentOptions([]);
          setSeligsonCompositeInstrumentOptionsError(
            e instanceof Error ? e.message : String(e),
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSeligsonCompositeInstrumentOptionsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    mode,
    kind,
    setSeligsonCompositeInstrumentOptions,
    setSeligsonCompositeInstrumentOptionsLoading,
    setSeligsonCompositeInstrumentOptionsError,
  ]);
}

export function useEditInstrumentLoadEffect(
  mode: "new" | "edit",
  editInstrumentId: number | null,
  setError: (e: string | null) => void,
  setInitial: (row: InstrumentDetail | null) => void,
  setCashDisplayName: (s: string) => void,
  setCashBrokerId: (id: number | "") => void,
  setCashCurrency: (c: CashCurrencyCode) => void,
  setCashGeoKey: (s: string) => void,
  setHoldingsDistributionUrl: (s: string) => void,
  setProviderBreakdownDataUrl: (s: string) => void,
  setCommoditySector: (s: CommoditySectorStorage) => void,
  setCommodityCountryIso: (s: string) => void,
) {
  useEffect(() => {
    if (mode !== "edit" || editInstrumentId == null) {
      return;
    }
    setError(null);
    void apiGet<InstrumentDetail>(`/instruments/${editInstrumentId}`)
      .then((row) => {
        setInitial(row);
        if (row.kind === "cash_account") {
          setCashDisplayName(row.displayName);
          setCashBrokerId(row.brokerId ?? "");
          setCashCurrency(
            (row.cashCurrency as CashCurrencyCode) ?? DEFAULT_CASH_CURRENCY,
          );
          setCashGeoKey(row.cashGeoKey ?? "");
        }
        if (row.kind === "etf" || row.kind === "stock") {
          setHoldingsDistributionUrl(row.holdingsDistributionUrl ?? "");
          setProviderBreakdownDataUrl(row.providerBreakdownDataUrl ?? "");
        }
        if (row.kind === "commodity") {
          const s = row.commoditySector;
          setCommoditySector(
            s === "silver" || s === "other" || s === "gold" ? s : "gold",
          );
          setCommodityCountryIso(row.commodityCountryIso ?? "");
        }
      })
      .catch((e) => setError(String(e)));
  }, [
    mode,
    editInstrumentId,
    setError,
    setInitial,
    setCashDisplayName,
    setCashBrokerId,
    setCashCurrency,
    setCashGeoKey,
    setHoldingsDistributionUrl,
    setProviderBreakdownDataUrl,
    setCommoditySector,
    setCommodityCountryIso,
  ]);
}

export function useKindFocusEffect(
  mode: "new" | "edit",
  kind: InstrumentKind | null,
  yahooSymbolInputRef: RefObject<HTMLInputElement | null>,
  seligsonFundPageUrlInputRef: RefObject<HTMLInputElement | null>,
  cashDisplayNameInputRef: RefObject<HTMLInputElement | null>,
) {
  useEffect(() => {
    if (mode !== "new") {
      return;
    }
    if (kind === "etf" || kind === "stock") {
      yahooSymbolInputRef.current?.focus();
    } else if (kind === "custom") {
      seligsonFundPageUrlInputRef.current?.focus();
    } else if (kind === "commodity") {
      yahooSymbolInputRef.current?.focus();
    } else if (kind === "cash_account") {
      cashDisplayNameInputRef.current?.focus();
    }
  }, [
    mode,
    kind,
    yahooSymbolInputRef,
    seligsonFundPageUrlInputRef,
    cashDisplayNameInputRef,
  ]);
}

export function useDefaultSeligsonBrokerEffect(
  mode: "new" | "edit",
  kind: InstrumentKind | null,
  brokers: BrokerRow[],
  customBrokerId: number | "",
  setCustomBrokerId: (id: number | "") => void,
) {
  useEffect(() => {
    if (mode !== "new") {
      return;
    }
    const seligsonBrokers = brokers.filter((b) => b.brokerType === "seligson");
    const first = seligsonBrokers[0];
    if (kind === "custom" && first != null && customBrokerId === "") {
      setCustomBrokerId(first.id);
    }
  }, [mode, kind, brokers, customBrokerId, setCustomBrokerId]);
}

export function useSeligsonCompositePreviewEffect(
  mode: "new" | "edit",
  kind: InstrumentKind | null,
  seligsonFundPageUrl: string,
  seligsonFundPageUrlRef: MutableRefObject<string>,
  setSeligsonCompositePreview: (
    v: SeligsonFundPageCompositePreviewResponse | null,
  ) => void,
  setSeligsonCompositePreviewError: (e: string | null) => void,
  setSeligsonCompositeMappedRows: (rows: SeligsonCompositeMappedRow[]) => void,
  setSeligsonCompositePreviewLoading: (v: boolean) => void,
) {
  useEffect(() => {
    if (mode !== "new" || kind !== "custom") {
      setSeligsonCompositePreview(null);
      setSeligsonCompositePreviewError(null);
      setSeligsonCompositeMappedRows([]);
      setSeligsonCompositePreviewLoading(false);
      return;
    }
    const raw = seligsonFundPageUrl.trim();
    if (raw === "") {
      setSeligsonCompositePreview(null);
      setSeligsonCompositePreviewError(null);
      setSeligsonCompositeMappedRows([]);
      setSeligsonCompositePreviewLoading(false);
      return;
    }
    let fundPageUrl: string;
    try {
      const u = new URL(raw);
      if (u.hostname !== "www.seligson.fi") {
        setSeligsonCompositePreview(null);
        setSeligsonCompositePreviewError(null);
        setSeligsonCompositeMappedRows([]);
        setSeligsonCompositePreviewLoading(false);
        return;
      }
      fundPageUrl = u.href;
    } catch {
      setSeligsonCompositePreview(null);
      setSeligsonCompositePreviewError(null);
      setSeligsonCompositeMappedRows([]);
      setSeligsonCompositePreviewLoading(false);
      return;
    }

    setSeligsonCompositePreviewLoading(true);
    setSeligsonCompositePreviewError(null);
    setSeligsonCompositePreview(null);
    setSeligsonCompositeMappedRows([]);

    let cancelled = false;
    const handle = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await postSeligsonFundPageCompositePreview(fundPageUrl);
          if (cancelled) {
            return;
          }
          const stillCurrent = normalizeWwwSeligsonFundPageUrl(
            seligsonFundPageUrlRef.current,
          );
          if (stillCurrent == null || stillCurrent !== fundPageUrl) {
            return;
          }
          setSeligsonCompositePreview(res);
          if (res.composite === true) {
            setSeligsonCompositeMappedRows(
              res.rows.map((r) => ({
                targetInstrumentId:
                  r.suggestedInstrumentId != null
                    ? String(r.suggestedInstrumentId)
                    : "",
                pseudoKey: r.suggestedPseudoKey ?? "",
              })),
            );
          } else {
            setSeligsonCompositeMappedRows([]);
          }
        } catch (err) {
          if (!cancelled) {
            setSeligsonCompositePreview(null);
            setSeligsonCompositeMappedRows([]);
            setSeligsonCompositePreviewError(
              err instanceof Error ? err.message : String(err),
            );
          }
        } finally {
          if (!cancelled) {
            setSeligsonCompositePreviewLoading(false);
          }
        }
      })();
    }, 900);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [
    mode,
    kind,
    seligsonFundPageUrl,
    seligsonFundPageUrlRef,
    setSeligsonCompositePreview,
    setSeligsonCompositePreviewError,
    setSeligsonCompositeMappedRows,
    setSeligsonCompositePreviewLoading,
  ]);
}

export function useCashDisplayNameSyncFromBrokerEffect(
  mode: "new" | "edit",
  kind: InstrumentKind | null,
  cashBrokerId: number | "",
  brokers: BrokerRow[],
  cashDisplayName: string,
  setCashDisplayName: (s: string) => void,
) {
  const prevCashBrokerIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (mode !== "new") {
      prevCashBrokerIdRef.current = null;
      return;
    }
    if (kind !== "cash_account") {
      prevCashBrokerIdRef.current = null;
      return;
    }
    if (cashBrokerId === "" || typeof cashBrokerId !== "number") {
      return;
    }
    const broker = brokers.find(
      (b) => b.id === cashBrokerId && b.brokerType === "cash_account",
    );
    if (!broker) {
      return;
    }
    const prevId = prevCashBrokerIdRef.current;
    if (prevId === cashBrokerId) {
      return;
    }
    const prevBroker =
      prevId != null ? brokers.find((b) => b.id === prevId) : null;
    const shouldSync =
      cashDisplayName === "" ||
      (prevBroker != null && cashDisplayName === prevBroker.name);
    if (shouldSync) {
      setCashDisplayName(broker.name);
    }
    prevCashBrokerIdRef.current = cashBrokerId;
  }, [mode, kind, cashBrokerId, brokers, cashDisplayName, setCashDisplayName]);
}

export function useDefaultCashBrokerEffect(
  mode: "new" | "edit",
  kind: InstrumentKind | null,
  brokers: BrokerRow[],
  cashBrokerId: number | "",
  setCashBrokerId: (id: number | "") => void,
) {
  useEffect(() => {
    if (mode !== "new") {
      return;
    }
    const cashBrokers = brokers.filter((b) => b.brokerType === "cash_account");
    const first = cashBrokers[0];
    if (kind === "cash_account" && first != null && cashBrokerId === "") {
      setCashBrokerId(first.id);
    }
  }, [mode, kind, brokers, cashBrokerId, setCashBrokerId]);
}
