import {
  BROKER_TYPES,
  BROKER_TYPE_DISPLAY,
  type BrokerType,
} from "@investments/db";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost } from "../api";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";

type BrokerRow = {
  id: number;
  code: string;
  name: string;
  brokerType: BrokerType;
};

export function BrokersPage() {
  const [rows, setRows] = useState<BrokerRow[]>([]);
  const [pageError, setPageError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  /** `null` = add mode; otherwise editing that id */
  const [editingId, setEditingId] = useState<number | null>(null);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [brokerType, setBrokerType] = useState<BrokerType>("exchange");

  const nameInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setPageError(null);
    try {
      const data = await apiGet<BrokerRow[]>("/brokers");
      setRows(data);
    } catch (e) {
      setPageError(String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (modalOpen) {
      nameInputRef.current?.focus();
    }
  }, [modalOpen]);

  function openAddModal() {
    setEditingId(null);
    setName("");
    setCode("");
    setBrokerType("exchange");
    setFormError(null);
    setModalOpen(true);
  }

  function startEdit(row: BrokerRow) {
    setEditingId(row.id);
    setName(row.name);
    setCode(row.code);
    setBrokerType(row.brokerType);
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
    setName("");
    setCode("");
    setBrokerType("exchange");
    setFormError(null);
  }

  async function submitModal(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const n = name.trim();
    if (!n) {
      setFormError("Name is required.");
      return;
    }
    try {
      if (editingId == null) {
        await apiPost<BrokerRow>("/brokers", {
          name: n,
          ...(code.trim() ? { code: code.trim() } : {}),
          brokerType,
        });
      } else {
        await apiPatch<BrokerRow>(`/brokers/${editingId}`, {
          name: n,
          code: code.trim(),
          brokerType,
        });
      }
      closeModal();
      await load();
    } catch (err) {
      setFormError(String(err));
    }
  }

  async function remove(id: number) {
    if (
      !window.confirm(
        "Delete this broker? This is only allowed when it has no transactions.",
      )
    ) {
      return;
    }
    setPageError(null);
    try {
      await apiDelete(`/brokers/${id}`);
      await load();
    } catch (err) {
      setPageError(String(err));
    }
  }

  return (
    <div className="w-full min-w-0 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold text-slate-900">Brokers</h1>
        <Button type="button" onClick={() => openAddModal()}>
          Add broker
        </Button>
      </header>

      <p className="text-sm text-slate-600 max-w-2xl">
        Code is optional; if omitted, a code is derived from the name. Types
        control which instruments you can trade at each broker (exchange =
        Yahoo-backed equities, Seligson = mutual fund integration, cash account
        = bank-style cash positions).
      </p>

      {pageError ? (
        <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded px-3 py-2">
          {pageError}
        </p>
      ) : null}

      <Modal
        title={editingId == null ? "Add broker" : "Edit broker"}
        open={modalOpen}
        onClose={closeModal}
      >
        <form onSubmit={(e) => void submitModal(e)} className="space-y-3">
          {formError ? (
            <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded px-3 py-2">
              {formError}
            </p>
          ) : null}
          <label className="block text-sm">
            Name
            <input
              ref={nameInputRef}
              className="mt-1 block w-full border rounded px-2 py-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <label className="block text-sm">
            Code <span className="text-slate-500 font-normal">(optional)</span>
            <input
              className="mt-1 block w-full border rounded px-2 py-1 font-mono"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Leave empty to derive from name"
            />
          </label>
          <label className="block text-sm">
            Type
            <select
              className="mt-1 block w-full border rounded px-2 py-1"
              value={brokerType}
              onChange={(e) => setBrokerType(e.target.value as BrokerType)}
            >
              {BROKER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {BROKER_TYPE_DISPLAY[t]}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="submit">
              {editingId == null ? "Add broker" : "Save changes"}
            </Button>
            <button
              type="button"
              className="text-sm text-slate-700 underline"
              onClick={() => closeModal()}
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-slate-800">All brokers</h2>
        <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left">
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Code</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium w-40">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100">
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2 font-mono">{r.code}</td>
                  <td className="px-3 py-2">
                    {BROKER_TYPE_DISPLAY[r.brokerType]}
                  </td>
                  <td className="px-3 py-2 space-x-3 whitespace-nowrap">
                    <button
                      type="button"
                      className="text-emerald-800 underline text-sm"
                      onClick={() => startEdit(r)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="text-red-700 underline text-sm"
                      onClick={() => void remove(r.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
