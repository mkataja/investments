import {
  SUPPORTED_CASH_CURRENCY_CODES,
  sortByTransactionInstrumentSelectLabel,
} from "@investments/lib";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  apiGet,
  apiPatch,
  apiPost,
  buildTransactionMutationBody,
} from "../../api";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { classNames } from "../../lib/css";
import {
  formatLocalDateTimeYmdHm,
  parseLocalDateTimeYmdHm,
} from "../../lib/dateTimeFormat";
import { instrumentSelectUiLabel } from "../../lib/instrumentSelectUiLabel";

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
        const sorted = sortByTransactionInstrumentSelectLabel(list);
        setTxnInstruments(sorted);
        if (isInitialEditSync) {
          onError(null);
          return;
        }
        setTxnForm((f) => {
          const keepSelection = sorted.some((i) => i.id === f.instrumentId);
          return {
            ...f,
            instrumentId: keepSelection ? f.instrumentId : 0,
          };
        });
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
      const body = buildTransactionMutationBody({
        portfolioId: effectivePortfolioId,
        brokerId: txnForm.brokerId,
        tradeDateIso: tradeDateParsed.toISOString(),
        instrumentId: txnForm.instrumentId,
        currency: txnForm.currency,
        isCashAccount: isCashTxn,
        side: txnForm.side,
        quantity: txnForm.quantity,
        unitPrice: txnForm.unitPrice,
        unitPriceEur: txnForm.unitPriceEur,
      });
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
            className="form-control"
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
            className="form-control"
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
            className={classNames(
              "form-control",
              (txnInstrumentsLoading || txnInstruments.length === 0) &&
                classNames(
                  "disabled:opacity-80",
                  txnInstrumentsLoading
                    ? "disabled:cursor-wait"
                    : "disabled:cursor-not-allowed",
                ),
            )}
            disabled={txnInstrumentsLoading || txnInstruments.length === 0}
            value={
              txnInstruments.some((i) => i.id === txnForm.instrumentId)
                ? txnForm.instrumentId
                : ""
            }
            onChange={(e) => {
              const v = e.target.value;
              const id = v === "" ? 0 : Number.parseInt(v, 10);
              setTxnForm((f) => ({ ...f, instrumentId: id }));
            }}
          >
            {txnInstrumentsLoading ? (
              <option value="">Loading instruments...</option>
            ) : txnInstruments.length === 0 ? (
              <option value="">No instruments for this broker</option>
            ) : (
              <>
                <option value="" />
                {txnInstruments.map((i) => (
                  <option key={i.id} value={i.id}>
                    {instrumentSelectUiLabel(i)}
                  </option>
                ))}
              </>
            )}
          </select>
        </label>
        <label className="block text-sm">
          {isCashTxn ? "Deposit / withdrawal" : "Side"}
          <select
            className="form-control"
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
                className="form-control"
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
                className="form-control"
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
                className="form-control"
                value={txnForm.quantity}
                onChange={(e) =>
                  setTxnForm({ ...txnForm, quantity: e.target.value })
                }
              />
            </label>
            <label className="block text-sm">
              Unit price
              <input
                className="form-control"
                value={txnForm.unitPrice}
                onChange={(e) =>
                  setTxnForm({ ...txnForm, unitPrice: e.target.value })
                }
              />
            </label>
            <label className="block text-sm">
              Currency
              <input
                className="form-control"
                value={txnForm.currency}
                onChange={(e) =>
                  setTxnForm({ ...txnForm, currency: e.target.value })
                }
              />
            </label>
            <label className="block text-sm">
              Unit price EUR (optional)
              <input
                className="form-control"
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
