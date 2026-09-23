import { useEffect, useRef, type RefObject } from "react";

export const DIALOG_FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "a[href]",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

type FocusTargetRef = { current: HTMLElement | null };

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(DIALOG_FOCUSABLE_SELECTOR),
  ).filter(
    (element) =>
      !element.hidden &&
      element.getClientRects().length > 0 &&
      element.getAttribute("aria-hidden") !== "true",
  );
}

function activeFocusTarget(): HTMLElement | null {
  const active = document.activeElement;
  return active instanceof HTMLElement && active !== document.body
    ? active
    : null;
}

export function rememberDialogOpener(
  openerRef: FocusTargetRef,
  trigger?: HTMLElement | null,
): void {
  openerRef.current = trigger ?? activeFocusTarget();
}

function restoreDialogFocus(
  openerRef: FocusTargetRef,
  fallbackSelector: string,
): void {
  const opener = openerRef.current;
  const fallback = document.querySelector<HTMLElement>(fallbackSelector);
  const target = opener?.isConnected ? opener : fallback;
  target?.focus({ preventScroll: true });
}

export function useDialogFocus({
  open,
  dialogRef,
  openerRef,
  onClose,
  initialFocusSelector,
  fallbackSelector = "#main-content",
}: {
  open: boolean;
  dialogRef: RefObject<HTMLElement | null>;
  openerRef: FocusTargetRef;
  onClose: () => void;
  initialFocusSelector: string;
  fallbackSelector?: string;
}): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const fallbackSelectorRef = useRef(fallbackSelector);
  fallbackSelectorRef.current = fallbackSelector;
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    if (!openerRef.current) openerRef.current = activeFocusTarget();
    wasOpenRef.current = true;

    const focusFrame = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      const initial = dialog.querySelector<HTMLElement>(initialFocusSelector);
      const first = focusableElements(dialog)[0];
      (initial ?? first)?.focus({ preventScroll: true });
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = focusableElements(dialog);
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (
        !event.shiftKey &&
        (active === last || !dialog.contains(active))
      ) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKeyDown);
      // StrictMode replays effects while the dialog is still mounted.
      if (dialogRef.current || !wasOpenRef.current) return;
      wasOpenRef.current = false;
      window.requestAnimationFrame(() =>
        restoreDialogFocus(openerRef, fallbackSelectorRef.current),
      );
    };
  }, [dialogRef, initialFocusSelector, open, openerRef]);
}
