import { type ReactNode, useCallback, useEffect, useId } from "react";
import { createPortal } from "react-dom";

import { classNames } from "../lib/css";

const CLOSE_CONFIRM_MESSAGE = "Discard changes and close?";

type ModalProps = {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Overrides default `max-w-lg` on the dialog panel (e.g. `max-w-3xl`). */
  dialogClassName?: string;
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
  dialogClassName,
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

  if (!open) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-40 overflow-y-auto overscroll-contain">
      <div className="relative flex min-h-full items-center justify-center p-4">
        <button
          type="button"
          className="absolute inset-0 z-0 bg-black/40"
          aria-label="Close dialog"
          onClick={requestClose}
        />
        <dialog
          open
          aria-modal="true"
          aria-labelledby={titleId}
          className={classNames(
            "relative z-50 w-full max-h-[90vh] overflow-y-auto overscroll-contain rounded-lg border border-slate-200 bg-white p-4 shadow-lg",
            dialogClassName ?? "max-w-lg",
          )}
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
      </div>
    </div>,
    document.body,
  );
}
