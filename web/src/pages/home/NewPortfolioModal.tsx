import {
  type FormEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { apiPost } from "../../api/client";
import { buildCreatePortfolioBody } from "../../api/portfolios";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { parseDecimalInputLoose } from "../../lib/decimalInput";
import {
  PortfolioFormBenchmarkTotalField,
  PortfolioFormDivider,
  PortfolioFormEmergencyFundBlock,
  PortfolioFormNameField,
} from "./PortfolioFormFields";
import type { PortfolioEntity } from "./types";

type NewPortfolioModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (portfolio: PortfolioEntity) => void | Promise<void>;
  onError: (message: string | null) => void;
};

export function NewPortfolioModal({
  open,
  onClose,
  onCreated,
  onError,
}: NewPortfolioModalProps) {
  const [name, setName] = useState("");
  const [emergencyFund, setEmergencyFund] = useState("0");
  const [kind, setKind] = useState<"live" | "benchmark">("live");
  const [benchmarkTotal, setBenchmarkTotal] = useState("10000");
  const [busy, setBusy] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    setName("");
    setEmergencyFund("0");
    setKind("live");
    setBenchmarkTotal("10000");
    setBusy(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      nameInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      return;
    }
    const efParsed =
      kind === "benchmark"
        ? 0
        : Number.parseFloat(emergencyFund.trim().replace(",", "."));
    if (!Number.isFinite(efParsed) || efParsed < 0) {
      onError("Emergency fund must be a non-negative number.");
      return;
    }
    let benchmarkTotalEur: number | undefined;
    if (kind === "benchmark") {
      const bt = Number.parseFloat(benchmarkTotal.trim().replace(",", "."));
      if (!Number.isFinite(bt) || bt <= 0) {
        onError("Total amount must be a positive number.");
        return;
      }
      benchmarkTotalEur = bt;
    }
    setBusy(true);
    onError(null);
    try {
      const row = await apiPost<PortfolioEntity>(
        "/portfolios",
        buildCreatePortfolioBody({
          name: trimmed,
          kind,
          emergencyFundEur: efParsed,
          ...(benchmarkTotalEur != null ? { benchmarkTotalEur } : {}),
        }),
      );
      onClose();
      await onCreated(row);
    } catch (err) {
      onError(String(err));
    } finally {
      setBusy(false);
    }
  }

  const dirty =
    name.trim() !== "" ||
    parseDecimalInputLoose(emergencyFund) !== 0 ||
    kind !== "live";

  return (
    <Modal
      title="New portfolio"
      open={open}
      onClose={onClose}
      confirmBeforeClose={dirty}
    >
      <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-5">
        <PortfolioFormNameField
          name={name}
          onNameChange={setName}
          inputRef={nameInputRef}
        />
        <PortfolioFormDivider />
        <div className="flex flex-col gap-2">
          <label className="block text-sm">
            Type
            <select
              className="mt-1 block w-full border border-slate-300 rounded px-2 py-1 text-sm bg-white"
              value={kind}
              onChange={(e) => {
                const v = e.target.value;
                setKind(v === "benchmark" ? "benchmark" : "live");
              }}
            >
              <option value="live">Live (transactions)</option>
              <option value="benchmark">Benchmark (target weights)</option>
            </select>
          </label>
        </div>
        {kind === "benchmark" ? (
          <>
            <PortfolioFormDivider />
            <PortfolioFormBenchmarkTotalField
              value={benchmarkTotal}
              onChange={setBenchmarkTotal}
            />
          </>
        ) : null}
        {kind === "live" ? (
          <PortfolioFormEmergencyFundBlock
            value={emergencyFund}
            onChange={setEmergencyFund}
          />
        ) : null}
        <PortfolioFormDivider />
        <div>
          <Button type="submit" disabled={busy}>
            Create
          </Button>
        </div>
      </form>
    </Modal>
  );
}
