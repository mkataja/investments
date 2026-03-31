import { normLabel } from "@investments/db";

export type InstrumentMatchCandidate = {
  id: number;
  /** Best-effort strings to match against (display name, Yahoo symbol, Seligson fund name). */
  labels: string[];
};

export function scoreInstrumentLabelMatch(
  query: string,
  candidate: string,
): number {
  const q = normLabel(query.trim());
  const c = normLabel(candidate.trim());
  if (!q || !c) {
    return 0;
  }
  if (q === c) {
    return 1000;
  }
  if (c.includes(q) || q.includes(c)) {
    return 500;
  }
  const qt = q.split(/\s+/).filter((x) => x.length > 2);
  if (qt.length === 0) {
    return 0;
  }
  const ct = new Set(c.split(/\s+/));
  let overlap = 0;
  for (const t of qt) {
    if (ct.has(t)) {
      overlap++;
    }
  }
  return overlap * 80;
}

const SUGGEST_THRESHOLD = 120;

export function suggestBestInstrumentId(
  label: string,
  candidates: InstrumentMatchCandidate[],
): number | null {
  let bestId: number | null = null;
  let bestScore = 0;
  for (const cand of candidates) {
    for (const l of cand.labels) {
      const s = scoreInstrumentLabelMatch(label, l);
      if (s > bestScore) {
        bestScore = s;
        bestId = cand.id;
      }
    }
  }
  return bestScore >= SUGGEST_THRESHOLD ? bestId : null;
}

/** Heuristic: map “Käteinen” / cash lines to pseudo `cash`. */
export function suggestPseudoKeyForLabel(rawLabel: string): "cash" | null {
  const t = normLabel(rawLabel).toLowerCase();
  if (t === "käteinen" || t === "kateinen" || t === "cash") {
    return "cash";
  }
  return null;
}
