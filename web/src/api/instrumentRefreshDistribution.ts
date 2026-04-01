import type {
  InstrumentListItem,
  RefreshDistributionResponse,
} from "../pages/instruments/types";

export type InterpretRefreshDistributionResult =
  | { kind: "skipped"; reason: string }
  | { kind: "merge"; instrument: InstrumentListItem }
  | { kind: "reload" };

export function interpretRefreshDistributionResponse(
  res: RefreshDistributionResponse,
): InterpretRefreshDistributionResult {
  if ("skipped" in res) {
    return { kind: "skipped", reason: res.reason };
  }
  if ("instrument" in res && res.instrument) {
    return { kind: "merge", instrument: res.instrument };
  }
  return { kind: "reload" };
}

export function userMessageForSkippedRefresh(reason: string): string {
  if (reason === "manual") {
    return "This instrument uses a manual distribution cache; automatic refresh is skipped.";
  }
  return `Refresh skipped (${reason}).`;
}

export type RefreshBatchBucket = "ok" | "skipped_manual" | "skipped_other";

/** For refresh-all: count outcome without full row merge. */
export function bucketRefreshBatchResult(
  res: RefreshDistributionResponse,
): RefreshBatchBucket {
  if (!("skipped" in res)) {
    return "ok";
  }
  return res.reason === "manual" ? "skipped_manual" : "skipped_other";
}
