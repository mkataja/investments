/** Failure stored from the latest IBKR Flex sync run; the fields mirror the IBKR import error body. */
export type IbkrFlexSyncError = {
  message: string;
  queryId?: string;
  errors?: string[];
  missingSymbols?: string[];
  ambiguousSymbols?: string[];
  ambiguousIsins?: string[];
  missingIsins?: string[];
};

export type IbkrFlexSyncStatus = {
  configured: boolean;
  queryIds: string[];
  brokerId: number | null;
  portfolioId: number | null;
  running: boolean;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastError: IbkrFlexSyncError | null;
};
