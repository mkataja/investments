import {
  DEFAULT_CASH_CURRENCY,
  SUPPORTED_CASH_CURRENCY_CODES,
  transactionInstrumentSelectLabel,
} from "@investments/lib";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiPatch, apiPost } from "../../api";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import {
  formatLocalDateTimeYmdHm,
  parseLocalDateTimeYmdHm,
} from "../../lib/dateTimeFormat";

type Broker = {
  id: number;
  name: string;
  brokerType: string;
};
type Instrument = {
  id: number;
  kind: string;
  displayName: string;
  yahooSymbol: string | null;
  seligsonFund: { id: number; fid: number; name: string } | null;
  cashCurrency?: string | null;
};

/** Row shape for editing an existing transaction (from GET /transactions). */
export type EditTransactionSource = {
  id: number;
  portfolioId: number;
  brokerId: number;
  tradeDate: string;
  side: string;
  instrumentId: number;
  quantity: string;
  unitPrice: string;
  currency: string;
  unitPriceEur?: string | null;
};

type TxnFormState = {
  brokerId: number;
  tradeDate: string;
  side: "buy" | "sell";
  instrumentId: number;
  quantity: string;
  unitPrice: string;
  currency: string;
  unitPriceEur: string;
};

function buildTxnForm(
  edit: EditTransactionSource | null | undefined,
  brokers: Broker[],
): TxnFormState {
  if (edit) {
    return {
      brokerId: edit.brokerId,
      tradeDate: formatLocalDateTimeYmdHm(new Date(edit.tradeDate)),
      side: edit.side === "sell" ? "sell" : "buy",
      instrumentId: edit.instrumentId,
      quantity: edit.quantity,
      unitPrice: edit.unitPrice,
      currency: edit.currency.trim().toUpperCase(),
      unitPriceEur: edit.unitPriceEur?.trim() ?? "",
    };
  }
  return {
    brokerId: brokers[0]?.id ?? 1,
    tradeDate: formatLocalDateTimeYmdHm(new Date()),
    side: "buy",
    instrumentId: 0,
    quantity: "1",
    unitPrice: "0",
    currency: "EUR",
    unitPriceEur: "",
  };
}

function transactionModalInstrumentLabel(i: Instrument): string {
  return transactionInstrumentSelectLabel({
    kind: i.kind,
    displayName: i.displayName,
    yahooSymbol: i.yahooSymbol,
    seligsonFund: i.seligsonFund ? { name: i.seligsonFund.name } : null,
  });
}

export type NewTransactionModalProps = {
  open: boolean;
  onClose: () => void;
  brokers: Broker[];
  portfolioId: number;
  /** When set, the modal PATCHes this transaction instead of POSTing a new one. */
  editTransaction?: EditTransactionSource | null;
  onTransactionAdded: () => Promise<void>;
  onError: (message: string | null) => void;
};

export function NewTransactionModal({
  open,
  onClose,
  brokers,
  portfolioId,
  editTransaction,
  onTransactionAdded,
  onError,
}: NewTransactionModalProps) {
  const brokersSortedByName = useMemo(
    () =>
      [...brokers].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      ),
    [brokers],
  );
  const [txnForm, setTxnForm] = useState(() =>
    buildTxnForm(editTransaction, brokersSortedByName),
  );
  const [txnInstruments, setTxnInstruments] = useState<Instrument[]>([]);
  const [txnInstrumentsLoading, setTxnInstrumentsLoading] = useState(false);
  const brokerSelectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    setTxnInstrumentsLoading(true);
    setTxnInstruments([]);
    const brokerIdForFetch =
      editTransaction != null && editTransaction.brokerId === txnForm.brokerId
        ? editTransaction.brokerId
        : txnForm.brokerId;
    const isInitialEditSync =
      editTransaction != null &&
      editTransaction.brokerId === brokerIdForFetch &&
      editTransaction.brokerId === txnForm.brokerId;
    void (async () => {
      try {
        const list = await apiGet<Instrument[]>(
          `/instruments?brokerId=${brokerIdForFetch}`,
        );
        if (cancelled) {
          return;
        }
        const sorted = [...list].sort((a, b) =>
          transactionModalInstrumentLabel(a).localeCompare(
            transactionModalInstrumentLabel(b),
            undefined,
            { sensitivity: "base" },
          ),
        );
        setTxnInstruments(sorted);
        if (isInitialEditSync) {
          onError(null);
          return;
        }
        const first = sorted[0];
        const firstIsCash = first?.kind === "cash_account";
        setTxnForm((f) => ({
          ...f,
          instrumentId: first?.id ?? 0,
          quantity: firstIsCash ? "" : "1",
          unitPrice: firstIsCash ? "1" : "0",
          currency: firstIsCash
            ? (first?.cashCurrency?.trim().toUpperCase() ??
              DEFAULT_CASH_CURRENCY)
            : "EUR",
          side: "buy",
          unitPriceEur: "",
        }));
        onError(null);
      } catch (e) {
        if (!cancelled) {
          onError(String(e));
        }
      } finally {
        if (!cancelled) {
          setTxnInstrumentsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, txnForm.brokerId, editTransaction, onError]);

  const selectedTxnInstrument = useMemo(
    () => txnInstruments.find((i) => i.id === txnForm.instrumentId),
    [txnInstruments, txnForm.instrumentId],
  );
  const isCashTxn = selectedTxnInstrument?.kind === "cash_account";
  const cashSumValid = useMemo(() => {
    if (!isCashTxn) return true;
    const s = Number.parseFloat(txnForm.quantity.replace(",", "."));
    return Number.isFinite(s) && s > 0;
  }, [isCashTxn, txnForm.quantity]);

  useEffect(() => {
    if (!open) {
      return;
    }
    brokerSelectRef.current?.focus();
  }, [open]);

  async function submitTransaction(e: React.FormEvent) {
    e.preventDefault();
    const effectivePortfolioId = editTransaction?.portfolioId ?? portfolioId;
    if (effectivePortfolioId < 1) {
      onError("Select a portfolio first.");
      return;
    }
    if (txnForm.instrumentId < 1 || txnInstruments.length === 0) {
      return;
    }
    if (isCashTxn && !cashSumValid) {
      return;
    }
    onError(null);
    const tradeDateParsed = parseLocalDateTimeYmdHm(txnForm.tradeDate);
    if (!tradeDateParsed) {
      onError("Date and time must be YYYY-MM-DD HH:mm");
      return;
    }
    try {
      const body: Record<string, unknown> = {
        portfolioId: effectivePortfolioId,
        brokerId: txnForm.brokerId,
        tradeDate: tradeDateParsed.toISOString(),
        instrumentId: txnForm.instrumentId,
        currency: txnForm.currency.trim().toUpperCase(),
      };
      if (isCashTxn) {
        const sum = Number.parseFloat(txnForm.quantity.replace(",", "."));
        body.side = txnForm.side;
        body.quantity = String(sum);
        body.unitPrice = "1";
      } else {
        body.side = txnForm.side;
        body.quantity = txnForm.quantity;
        body.unitPrice = txnForm.unitPrice;
        if (txnForm.unitPriceEur) {
          body.unitPriceEur = txnForm.unitPriceEur;
        }
      }
      if (editTransaction) {
        await apiPatch(`/transactions/${editTransaction.id}`, body);
      } else {
        await apiPost("/transactions", body);
      }
      await onTransactionAdded();
      onClose();
    } catch (err) {
      onError(String(err));
    }
  }

  const isEdit = editTransaction != null;

  return (
    <Modal
      title={isEdit ? "Edit transaction" : "New transaction"}
      open={open}
      onClose={onClose}
      confirmBeforeClose
    >
      <form onSubmit={(e) => void submitTransaction(e)} className="form-stack">
        <label className="block text-sm">
          Broker
          <select
            ref={brokerSelectRef}
            className="mt-1 block w-full border rounded px-2 py-1"
            value={txnForm.brokerId}
            onChange={(e) =>
              setTxnForm({
                ...txnForm,
                brokerId: Number.parseInt(e.target.value, 10),
              })
            }
          >
            {brokersSortedByName.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Date and time
          <input
            type="text"
            className="mt-1 block w-full border rounded px-2 py-1"
            autoComplete="off"
            placeholder="YYYY-MM-DD HH:mm"
            value={txnForm.tradeDate}
            onChange={(e) =>
              setTxnForm({ ...txnForm, tradeDate: e.target.value })
            }
          />
        </label>
        <label className="block text-sm">
          {isCashTxn ? "Cash account" : "Instrument"}
          <select
            className="mt-1 block w-full border rounded px-2 py-1"
            disabled={txnInstrumentsLoading || txnInstruments.length === 0}
            value={
              txnInstruments.some((i) => i.id === txnForm.instrumentId)
                ? txnForm.instrumentId
                : ""
            }
            onChange={(e) => {
              const id = Number.parseInt(e.target.value, 10);
              const inst = txnInstruments.find((i) => i.id === id);
              const isCash = inst?.kind === "cash_account";
              setTxnForm((f) => ({
                ...f,
                instrumentId: id,
                quantity: isCash ? "" : "1",
                unitPrice: isCash ? "1" : f.unitPrice,
                currency: isCash
                  ? (inst?.cashCurrency?.trim().toUpperCase() ??
                    DEFAULT_CASH_CURRENCY)
                  : f.currency,
                side: "buy",
              }));
            }}
          >
            {txnInstrumentsLoading ? (
              <option value="">Loading instruments…</option>
            ) : txnInstruments.length === 0 ? (
              <option value="">No instruments for this broker</option>
            ) : (
              txnInstruments.map((i) => (
                <option key={i.id} value={i.id}>
                  {transactionModalInstrumentLabel(i)}
                </option>
              ))
            )}
          </select>
        </label>
        <label className="block text-sm">
          {isCashTxn ? "Deposit / withdrawal" : "Side"}
          <select
            className="mt-1 block w-full border rounded px-2 py-1"
            value={
              isCashTxn
                ? txnForm.side === "buy"
                  ? "deposit"
                  : "withdrawal"
                : txnForm.side
            }
            onChange={(e) => {
              const v = e.target.value;
              if (isCashTxn) {
                setTxnForm({
                  ...txnForm,
                  side: v === "deposit" ? "buy" : "sell",
                });
              } else {
                setTxnForm({
                  ...txnForm,
                  side: v as "buy" | "sell",
                });
              }
            }}
          >
            {isCashTxn ? (
              <>
                <option value="deposit">deposit</option>
                <option value="withdrawal">withdrawal</option>
              </>
            ) : (
              <>
                <option value="buy">buy</option>
                <option value="sell">sell</option>
              </>
            )}
          </select>
        </label>
        {isCashTxn ? (
          <>
            <label className="block text-sm">
              Sum
              <input
                className="mt-1 block w-full border rounded px-2 py-1"
                inputMode="decimal"
                value={txnForm.quantity}
                onChange={(e) =>
                  setTxnForm({ ...txnForm, quantity: e.target.value })
                }
              />
            </label>
            <label className="block text-sm">
              Currency
              <select
                className="mt-1 block w-full border rounded px-2 py-1"
                value={txnForm.currency}
                onChange={(e) =>
                  setTxnForm({ ...txnForm, currency: e.target.value })
                }
              >
                {SUPPORTED_CASH_CURRENCY_CODES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <>
            <label className="block text-sm">
              Quantity
              <input
                className="mt-1 block w-full border rounded px-2 py-1"
                value={txnForm.quantity}
                onChange={(e) =>
                  setTxnForm({ ...txnForm, quantity: e.target.value })
                }
              />
            </label>
            <label className="block text-sm">
              Unit price
              <input
                className="mt-1 block w-full border rounded px-2 py-1"
                value={txnForm.unitPrice}
                onChange={(e) =>
                  setTxnForm({ ...txnForm, unitPrice: e.target.value })
                }
              />
            </label>
            <label className="block text-sm">
              Currency
              <input
                className="mt-1 block w-full border rounded px-2 py-1"
                value={txnForm.currency}
                onChange={(e) =>
                  setTxnForm({ ...txnForm, currency: e.target.value })
                }
              />
            </label>
            <label className="block text-sm">
              Unit price EUR (optional)
              <input
                className="mt-1 block w-full border rounded px-2 py-1"
                value={txnForm.unitPriceEur}
                onChange={(e) =>
                  setTxnForm({ ...txnForm, unitPriceEur: e.target.value })
                }
              />
            </label>
          </>
        )}
        <Button
          type="submit"
          disabled={
            txnInstrumentsLoading ||
            txnInstruments.length === 0 ||
            txnForm.instrumentId < 1 ||
            (isCashTxn && !cashSumValid)
          }
        >
          {isEdit ? "Save" : "Add transaction"}
        </Button>
      </form>
    </Modal>
  );
}
