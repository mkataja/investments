import { type ReactNode, useCallback, useEffect, useId } from "react";
import { createPortal } from "react-dom";

const CLOSE_CONFIRM_MESSAGE = "Discard changes and close?";

type ModalProps = {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /**
   * When true, Escape, backdrop click, and the Close control ask for confirmation
   * before calling `onClose`. Successful submit flows should call `onClose` from
   * outside this component; those calls are not affected.
   */
  confirmBeforeClose?: boolean;
};

export function Modal({
  title,
  open,
  onClose,
  children,
  confirmBeforeClose = false,
}: ModalProps) {
  const titleId = useId();

  const requestClose = useCallback(() => {
    if (confirmBeforeClose && !window.confirm(CLOSE_CONFIRM_MESSAGE)) {
      return;
    }
    onClose();
  }, [confirmBeforeClose, onClose]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        requestClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, requestClose]);

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
        onClick={requestClose}
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
            <button
              type="button"
              className="modal-close"
              onClick={requestClose}
            >
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
