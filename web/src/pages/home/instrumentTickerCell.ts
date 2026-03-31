import { instrumentTickerDisplay } from "@investments/lib";
import type { HomeInstrument } from "./types";

export function buildInstrumentTickerById(
  instruments: HomeInstrument[],
): Map<number, string | null> {
  const m = new Map<number, string | null>();
  for (const i of instruments) {
    m.set(i.id, instrumentTickerDisplay(i));
  }
  return m;
}

export function instrumentTickerCell(
  instrumentId: number,
  instrumentById: Map<number, HomeInstrument>,
  instrumentTickerById: Map<number, string | null>,
): string {
  const inst = instrumentById.get(instrumentId);
  if (inst?.seligsonFund != null) return "-";
  return instrumentTickerById.get(instrumentId) ?? "-";
}
