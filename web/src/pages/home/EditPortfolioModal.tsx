import { type FormEvent, useEffect, useRef, useState } from "react";
import { apiPatch } from "../../api";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import type { PortfolioEntity } from "./types";

export const PORTFOLIO_EMERGENCY_FUND_NOTE =
  "Emergency fund is the part of your savings you treat as reserved — not as portfolio investments. The asset mix considers only the cash above the emergency fund buffer as cash assets.";

type EditPortfolioModalProps = {
  open: boolean;
  onClose: () => void;
  portfolio: PortfolioEntity | null;
  onSaved: () => void | Promise<void>;
  onError: (message: string | null) => void;
};

export function EditPortfolioModal({
  open,
  onClose,
  portfolio,
  onSaved,
  onError,
}: EditPortfolioModalProps) {
  const [name, setName] = useState("");
  const [emergencyFund, setEmergencyFund] = useState("0");
  const [busy, setBusy] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || portfolio == null) return;
    setName(portfolio.name);
    setEmergencyFund(
      Number.isFinite(portfolio.emergencyFundEur)
        ? String(portfolio.emergencyFundEur)
        : "0",
    );
  }, [open, portfolio]);

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      nameInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (portfolio == null) {
      return;
    }
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      return;
    }
    const efParsed = Number.parseFloat(emergencyFund.trim().replace(",", "."));
    if (!Number.isFinite(efParsed) || efParsed < 0) {
      onError("Emergency fund must be a non-negative number.");
      return;
    }
    setBusy(true);
    onError(null);
    try {
      await apiPatch<PortfolioEntity>(`/portfolios/${portfolio.id}`, {
        name: trimmed,
        emergencyFundEur: efParsed,
      });
      onClose();
      await onSaved();
    } catch (err) {
      onError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Edit portfolio" open={open} onClose={onClose}>
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-3">
        <label className="block text-sm">
          Name
          <input
            ref={nameInputRef}
            className="mt-1 block w-full border border-slate-300 rounded px-2 py-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
          />
        </label>
        <div className="space-y-1">
          <label className="block text-sm">
            Emergency fund (EUR)
            <input
              className="mt-1 block w-full border border-slate-300 rounded px-2 py-1 tabular-nums"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={emergencyFund}
              onChange={(e) => setEmergencyFund(e.target.value)}
            />
          </label>
          <p className="text-sm text-slate-600">
            {PORTFOLIO_EMERGENCY_FUND_NOTE}
          </p>
        </div>
        <Button type="submit" disabled={busy}>
          Save
        </Button>
      </form>
    </Modal>
  );
}
