import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet } from "../../api/client";
import {
  readStoredComparePortfolioId,
  readStoredPortfolioId,
  writeStoredComparePortfolioId,
  writeStoredPortfolioId,
} from "../../lib/portfolioSelection";
import type {
  AssetMixHistoryPoint,
  HoldingBucketOption,
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
  const [holdingBuckets, setHoldingBuckets] = useState<HoldingBucketOption[]>(
    [],
  );
  /** Names of buckets removed from the DB this session; merged into picker until portfolio change or the name reappears from the API. */
  const [removedBucketNamesCache, setRemovedBucketNamesCache] = useState<
    string[]
  >([]);

  const registerRemovedBucketNames = useCallback((names: string[]) => {
    if (names.length === 0) {
      return;
    }
    setRemovedBucketNamesCache((prev) => {
      const next = new Set([...prev, ...names]);
      return [...next].sort((a, b) => a.localeCompare(b));
    });
  }, []);

  const removedBucketNameHints = useMemo(
    () =>
      removedBucketNamesCache.filter(
        (n) => !holdingBuckets.some((b) => b.name === n),
      ),
    [removedBucketNamesCache, holdingBuckets],
  );

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
        setHoldingBuckets([]);
        return;
      }
      writeStoredPortfolioId(pid);
      const [b, t, inst, p, pCmp, mixHist, hb] = await Promise.all([
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
        apiGet<{ buckets: HoldingBucketOption[] }>("/holding-buckets"),
      ]);
      setBrokers(b);
      setTransactions(t);
      setInstruments(inst);
      setPortfolio(p);
      setComparePortfolio(pCmp);
      setAssetMixHistoryPoints(mixHist.points);
      setHoldingBuckets(hb.buckets);
    } catch (e) {
      setError(String(e));
    }
  }, [selectedPortfolioId, comparePortfolioId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void selectedPortfolioId;
    setRemovedBucketNamesCache([]);
  }, [selectedPortfolioId]);

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
    holdingBuckets,
    removedBucketNameHints,
    registerRemovedBucketNames,
  };
}
