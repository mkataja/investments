import { AsyncLocalStorage } from "node:async_hooks";

type SectorRefreshContext = {
  instrumentId: number;
  displayName: string;
};

export const sectorRefreshStorage =
  new AsyncLocalStorage<SectorRefreshContext>();
