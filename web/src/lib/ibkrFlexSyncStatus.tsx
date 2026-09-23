import type { IbkrFlexSyncStatus } from "@investments/lib/ibkrFlexSync";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { apiGet } from "../api/client";

const POLL_INTERVAL_MS = 60 * 1000;

type IbkrFlexSyncStatusContextValue = {
  status: IbkrFlexSyncStatus | null;
  setStatus: (status: IbkrFlexSyncStatus) => void;
  reload: () => Promise<void>;
};

const IbkrFlexSyncStatusContext =
  createContext<IbkrFlexSyncStatusContextValue | null>(null);

/** Polls the IBKR Flex sync status so the app notices failures of the API's hourly sync. */
export function IbkrFlexSyncStatusProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [status, setStatus] = useState<IbkrFlexSyncStatus | null>(null);

  const reload = useCallback(async () => {
    try {
      setStatus(await apiGet<IbkrFlexSyncStatus>("/import/ibkr/flex"));
    } catch {
      // The banner and the import page keep the last known status.
    }
  }, []);

  useEffect(() => {
    void reload();
    const id = setInterval(() => {
      void reload();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [reload]);

  const value = useMemo(
    () => ({ status, setStatus, reload }),
    [status, reload],
  );
  return (
    <IbkrFlexSyncStatusContext.Provider value={value}>
      {children}
    </IbkrFlexSyncStatusContext.Provider>
  );
}

export function useIbkrFlexSyncStatus(): IbkrFlexSyncStatusContextValue {
  const ctx = useContext(IbkrFlexSyncStatusContext);
  if (ctx == null) {
    throw new Error(
      "useIbkrFlexSyncStatus must be used inside IbkrFlexSyncStatusProvider",
    );
  }
  return ctx;
}
