import type { BrokerType } from "@investments/lib/brokerTypes";
import type { HomeBroker } from "../home/types";

export function filterBrokersByType(
  rows: HomeBroker[],
  brokerType: BrokerType,
): HomeBroker[] {
  return rows.filter((b) => b.brokerType === brokerType);
}

function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function scoreNameAgainstHints(name: string, hints: readonly string[]): number {
  const n = normalizeForMatch(name);
  if (n === "") {
    return 0;
  }
  let best = 0;
  for (const h of hints) {
    const hn = normalizeForMatch(h);
    if (hn === "") {
      continue;
    }
    if (n === hn) {
      best = Math.max(best, 100);
      continue;
    }
    if (n.includes(hn)) {
      best = Math.max(best, hn.length >= 5 ? 60 : hn.length >= 3 ? 40 : 20);
      continue;
    }
    const words = n.split(" ");
    if (words.some((w) => w === hn && hn.length >= 2)) {
      best = Math.max(best, 35);
    }
  }
  return best;
}

/** Picks the best-matching broker id for this import flow, or the first row if none score. */
export function pickDefaultImportBrokerId(
  rows: HomeBroker[],
  nameHints: readonly string[],
): number | null {
  if (rows.length === 0) {
    return null;
  }
  const scored = rows.map((b) => ({
    id: b.id,
    score: scoreNameAgainstHints(b.name, nameHints),
  }));
  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.id - b.id;
  });
  const top = scored[0];
  return top?.id ?? rows[0]?.id ?? null;
}

export const IMPORT_DEFAULT_BROKER_HINTS = {
  degiro: ["Degiro", "de giro"],
  ibkr: ["IBKR", "Interactive Brokers", "interactive brokers"],
  seligson: ["Seligson"],
  svea: ["Svea Bank", "Svea", "svea bank"],
} as const;

type SveaCashPickRow = { id: number; cashCurrency: string | null };

/** Prefer EUR, then lowest id (stable default when several cash rows exist). */
export function pickDefaultSveaCashInstrumentId(
  rows: SveaCashPickRow[],
): number | null {
  if (rows.length === 0) {
    return null;
  }
  const eur = rows.filter(
    (r) => (r.cashCurrency?.trim().toUpperCase() ?? "") === "EUR",
  );
  const pool = eur.length > 0 ? eur : rows;
  const first = pool[0];
  if (first === undefined) {
    return null;
  }
  return pool.reduce((min, r) => (r.id < min.id ? r : min), first).id;
}
