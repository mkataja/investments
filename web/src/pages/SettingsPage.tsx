import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiPatch } from "../api";
import { Button } from "../components/Button";
import { ErrorAlert } from "../components/ErrorAlert";

type SettingsResponse = {
  emergencyFundEur: number;
};

export function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [emergencyFundInput, setEmergencyFundInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setPageError(null);
    setSaved(false);
    try {
      const data = await apiGet<SettingsResponse>("/settings");
      setEmergencyFundInput(
        Number.isFinite(data.emergencyFundEur)
          ? String(data.emergencyFundEur)
          : "0",
      );
    } catch (e) {
      setPageError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!loading) {
      inputRef.current?.focus();
    }
  }, [loading]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaved(false);
    const parsed = Number.parseFloat(
      emergencyFundInput.trim().replace(",", "."),
    );
    if (!Number.isFinite(parsed) || parsed < 0) {
      setFormError("Enter a non-negative number.");
      return;
    }
    try {
      await apiPatch<SettingsResponse>("/settings", {
        emergencyFundEur: parsed,
      });
      setEmergencyFundInput(String(parsed));
      setSaved(true);
    } catch (e) {
      setFormError(String(e));
    }
  }

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-3xl font-semibold text-slate-900">Settings</h1>
      {pageError ? <ErrorAlert message={pageError} /> : null}
      {loading ? (
        <p className="text-slate-600">Loading…</p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label
              htmlFor="emergency-fund-eur"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Emergency fund (EUR)
            </label>
            <input
              ref={inputRef}
              id="emergency-fund-eur"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              value={emergencyFundInput}
              onChange={(ev) => {
                setEmergencyFundInput(ev.target.value);
                setSaved(false);
              }}
            />
          </div>
          {formError ? <ErrorAlert message={formError} /> : null}
          {saved ? <p className="text-sm text-emerald-800">Saved.</p> : null}
          <Button type="submit">Save</Button>
        </form>
      )}
    </div>
  );
}
