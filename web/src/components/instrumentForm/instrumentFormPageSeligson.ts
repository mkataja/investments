import type { SeligsonCompositeMappedRow } from "./types";

export function normalizeWwwSeligsonFundPageUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (u.hostname !== "www.seligson.fi") {
      return null;
    }
    return u.href;
  } catch {
    return null;
  }
}

export function areCompositeMappingsComplete(
  preview: { rows: { length: number } },
  mapped: SeligsonCompositeMappedRow[],
): boolean {
  if (preview.rows.length === 0) {
    return false;
  }
  if (mapped.length !== preview.rows.length) {
    return false;
  }
  for (let i = 0; i < mapped.length; i++) {
    const m = mapped[i];
    if (m == null) {
      return false;
    }
    const tid = m.targetInstrumentId.trim();
    const pk = m.pseudoKey.trim();
    const idNum = Number.parseInt(tid, 10);
    const hasInst = tid !== "" && Number.isFinite(idNum) && idNum > 0;
    const hasPk = pk !== "";
    if (hasInst === hasPk) {
      return false;
    }
  }
  return true;
}
