import { useRef } from "react";
import { createPortal } from "react-dom";
import { useDialogFocus } from "./dialog-focus.js";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * One destructive decision at a time (UI system, "Dialog & sheet"): focus moves
 * into the dialog, Esc and the backdrop cancel, and the destructive action sits
 * on the right with a label that names its consequence.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  useDialogFocus({
    open,
    dialogRef,
    openerRef,
    onClose: onCancel,
    initialFocusSelector: ".confirm-dialog-cancel",
  });
  if (!open) return null;
  return createPortal(
    <div className="confirm-dialog-backdrop" onClick={onCancel}>
      <div
        ref={dialogRef}
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-dialog-title">{title}</h2>
        <p>{body}</p>
        <div className="confirm-dialog-actions">
          <button
            type="button"
            className="confirm-dialog-cancel"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="confirm-dialog-confirm"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
