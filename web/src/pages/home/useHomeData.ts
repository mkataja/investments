import { useCallback, useEffect, useState } from "react";
import { apiGet } from "../../api/client";
import {
  readStoredComparePortfolioId,
  readStoredPortfolioId,
  writeStoredComparePortfolioId,
  writeStoredPortfolioId,
} from "../../lib/portfolioSelection";
import type {
  AssetMixHistoryPoint,
  HomeBroker,
  HomeInstrument,
  HomeTransaction,
  PortfolioDistributions,
  PortfolioEntity,
} from "./types";

export function useHomeData() {
  const [brokers, setBrokers] = useState<HomeBroker[]>([]);
  const [transactions, setTransactions] = useState<HomeTransaction[]>([]);
  const [instruments, setInstruments] = useState<HomeInstrument[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioDistributions | null>(
    null,
  );
  const [comparePortfolio, setComparePortfolio] =
    useState<PortfolioDistributions | null>(null);
  const [assetMixHistoryPoints, setAssetMixHistoryPoints] = useState<
    AssetMixHistoryPoint[]
  >([]);
  const [portfolioEntities, setPortfolioEntities] = useState<PortfolioEntity[]>(
    [],
  );
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<number | null>(
    null,
  );
  const [comparePortfolioId, setComparePortfolioId] = useState<number | null>(
    () => readStoredComparePortfolioId(),
  );
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const plist = await apiGet<PortfolioEntity[]>("/portfolios");
      setPortfolioEntities(plist);
      const stored = readStoredPortfolioId();
      let pid = selectedPortfolioId;
      if (pid == null || !plist.some((x) => x.id === pid)) {
        pid = plist.find((x) => x.id === stored)?.id ?? plist[0]?.id ?? null;
      }
      if (pid !== selectedPortfolioId) {
        setSelectedPortfolioId(pid);
        return;
      }
      let cmpId = comparePortfolioId;
      if (pid == null) {
        cmpId = null;
        if (comparePortfolioId != null) {
          writeStoredComparePortfolioId(null);
        }
      } else if (
        cmpId != null &&
        (cmpId === pid || !plist.some((x) => x.id === cmpId))
      ) {
        cmpId = null;
        writeStoredComparePortfolioId(null);
      }
      if (cmpId !== comparePortfolioId) {
        setComparePortfolioId(cmpId);
        return;
      }
      if (pid == null) {
        setBrokers([]);
        setTransactions([]);
        setInstruments([]);
        setPortfolio(null);
        setComparePortfolio(null);
        setAssetMixHistoryPoints([]);
        return;
      }
      writeStoredPortfolioId(pid);
      const [b, t, inst, p, pCmp, mixHist] = await Promise.all([
        apiGet<HomeBroker[]>("/brokers"),
        apiGet<HomeTransaction[]>(`/transactions?portfolioId=${pid}`),
        apiGet<HomeInstrument[]>("/instruments"),
        apiGet<PortfolioDistributions>(
          `/portfolio/distributions?portfolioId=${pid}`,
        ),
        cmpId != null
          ? apiGet<PortfolioDistributions>(
              `/portfolio/distributions?portfolioId=${cmpId}`,
            )
          : Promise.resolve(null),
        apiGet<{ points: AssetMixHistoryPoint[] }>(
          `/portfolio/asset-mix-history?portfolioId=${pid}`,
        ),
      ]);
      setBrokers(b);
      setTransactions(t);
      setInstruments(inst);
      setPortfolio(p);
      setComparePortfolio(pCmp);
      setAssetMixHistoryPoints(mixHist.points);
    } catch (e) {
      setError(String(e));
    }
  }, [selectedPortfolioId, comparePortfolioId]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    brokers,
    transactions,
    instruments,
    assetMixHistoryPoints,
    portfolio,
    comparePortfolio,
    setComparePortfolio,
    portfolioEntities,
    setPortfolioEntities,
    selectedPortfolioId,
    setSelectedPortfolioId,
    comparePortfolioId,
    setComparePortfolioId,
    error,
    setError,
    load,
  };
}
