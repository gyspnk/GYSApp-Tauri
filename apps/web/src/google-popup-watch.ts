/** Google Identity Services opens its consent window with `window.open`. When
 * the browser blocks it the call returns `null` and the button appears to do
 * nothing, which is exactly the failure a reader reports as “login gagal”.
 * Watching the call turns that silence into a message. */
export type GooglePopupWatch = {
  readonly attempted: boolean;
  readonly blocked: boolean;
  restore: () => void;
};

type OpenWindow = Window["open"];

export function watchGooglePopup(target: Window = window): GooglePopupWatch {
  const original: OpenWindow = target.open;
  let attempted = false;
  let blocked = false;
  const patched = function patchedOpen(
    this: Window,
    ...args: Parameters<OpenWindow>
  ) {
    attempted = true;
    const result = original.apply(this, args);
    if (!result) blocked = true;
    return result;
  } as OpenWindow;
  target.open = patched;
  return {
    get attempted() {
      return attempted;
    },
    get blocked() {
      return blocked;
    },
    restore() {
      if (target.open === patched) target.open = original;
    },
  };
}
