import { type ReactNode, useEffect, useId } from "react";
import { createPortal } from "react-dom";

type ModalProps = {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
};

export function Modal({ title, open, onClose, children }: ModalProps) {
  const titleId = useId();

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

  useEffect(() => {
    if (!open) {
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <dialog
        open
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-50 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg border border-slate-200 bg-white p-4 shadow-lg"
      >
        <div className="modal-stack">
          <div className="flex items-center justify-between gap-3 min-w-0">
            <h2 id={titleId} className="modal-title">
              {title}
            </h2>
            <button type="button" className="modal-close" onClick={onClose}>
              Close
            </button>
          </div>
          {children}
        </div>
      </dialog>
    </div>,
    document.body,
  );
}
