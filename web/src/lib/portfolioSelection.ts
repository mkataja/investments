const STORAGE_KEY = "investments.selectedPortfolioId";
const COMPARE_STORAGE_KEY = "investments.comparePortfolioId";

export function readStoredPortfolioId(): number | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw == null || raw.trim() === "") {
    return null;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

export function writeStoredPortfolioId(id: number): void {
  localStorage.setItem(STORAGE_KEY, String(id));
}

export function readStoredComparePortfolioId(): number | null {
  const raw = localStorage.getItem(COMPARE_STORAGE_KEY);
  if (raw == null || raw.trim() === "") {
    return null;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

export function writeStoredComparePortfolioId(id: number | null): void {
  if (id == null) {
    localStorage.removeItem(COMPARE_STORAGE_KEY);
  } else {
    localStorage.setItem(COMPARE_STORAGE_KEY, String(id));
  }
}
