import { type ReactNode, useEffect } from "react";

type ModalProps = {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
};

export function Modal({ title, open, onClose, children }: ModalProps) {
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <dialog
        open
        aria-labelledby="modal-title"
        className="relative z-50 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg border border-slate-200 bg-white p-4 shadow-lg"
      >
        <div className="modal-stack">
          <div className="flex items-center justify-between gap-3 min-w-0 [&_h2]:mb-0">
            <h2 id="modal-title">{title}</h2>
            <button
              type="button"
              className="text-sm text-emerald-800 hover:underline shrink-0"
              onClick={onClose}
            >
              Close
            </button>
          </div>
          {children}
        </div>
      </dialog>
    </div>
  );
}
