const STORAGE_KEY = "investments.selectedPortfolioId";

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
