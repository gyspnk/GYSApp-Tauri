const GOOGLE_IDENTITY_SCRIPT = "https://accounts.google.com/gsi/client";

export const EGYS_GOOGLE_CLIENT_ID =
  "748303683851-46ea0qkq8ti4r6lh8ss5aivf60ct71u7.apps.googleusercontent.com";

/** Google rejects an origin that is missing from the OAuth client, and the
 * rejection happens inside Google's own window where this app cannot read it.
 * Only the deployed origin can be assumed registered; a dev origin depends on
 * the console, so the account card asks for guidance there. */
export const EGYS_GOOGLE_PRODUCTION_ORIGIN = "https://gyspnk.github.io";

export function googleOriginNeedsGuidance(origin: string): boolean {
  return origin !== "" && origin !== EGYS_GOOGLE_PRODUCTION_ORIGIN;
}

type GoogleCredentialResponse = { credential: string };
type GoogleIdentity = {
  accounts: {
    id: {
      initialize(options: {
        client_id: string;
        callback: (response: GoogleCredentialResponse) => void | Promise<void>;
        ux_mode: "popup";
        auto_select: false;
      }): void;
      renderButton(
        element: HTMLElement,
        options: {
          theme: "outline";
          size: "large";
          type: "standard" | "icon";
          text: "signin_with";
          shape: "rectangular";
          width: number;
          locale: string;
        },
      ): void;
      cancel(): void;
      /** One Tap: the only Google entry point whose outcome this page can read. */
      prompt?(
        listener?: (notification: {
          isDisplayed?: () => boolean;
          isNotDisplayed?: () => boolean;
          isSkippedMoment?: () => boolean;
          isDismissedMoment?: () => boolean;
        }) => void,
      ): void;
    };
  };
};

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

/** Dispatched on the Identity host when Google refuses to render a control.
 * Google fails silently for an origin or client it does not know, and the
 * transparent host then sits on top of the provider row, so without this signal
 * every press on the row would land on an empty div. */
export const GOOGLE_UNAVAILABLE_EVENT = "gys-google-unavailable";

/** Google renders nothing, or a zero-height iframe, for an origin it refuses;
 * either way the row looks pressable while nothing sits under the pointer. A
 * control only counts when it occupies space. */
function paintedControl(element: HTMLElement): boolean {
  const child = element.firstElementChild as HTMLElement | null;
  if (!child) return false;
  if (typeof child.getBoundingClientRect !== "function") return true;
  const box = child.getBoundingClientRect();
  return box.width >= 24 && box.height >= 24;
}

let googleScriptPromise: Promise<void> | undefined;

function loadGoogleIdentityScript(locale: string): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (googleScriptPromise) return googleScriptPromise;
  if (typeof document === "undefined")
    return Promise.reject(new Error("Google Identity Services is unavailable"));

  googleScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      "script[data-gys-google-identity]",
    );
    const script = existing ?? document.createElement("script");
    const finish = (error?: Error) => {
      clearTimeout(timer);
      script.removeEventListener("load", loaded);
      script.removeEventListener("error", failed);
      if (error) {
        script.remove();
        reject(error);
      } else resolve();
    };
    const loaded = () =>
      finish(
        window.google?.accounts?.id
          ? undefined
          : new Error("Google Identity Services did not initialize"),
      );
    const failed = () =>
      finish(new Error("Google Identity Services failed to load"));
    const timer = setTimeout(
      () => finish(new Error("Google Identity Services timed out")),
      10000,
    );
    script.addEventListener("load", loaded, { once: true });
    script.addEventListener("error", failed, { once: true });
    if (!existing) {
      script.async = true;
      script.defer = true;
      script.src = `${GOOGLE_IDENTITY_SCRIPT}?hl=${encodeURIComponent(locale === "zh" ? "zh_CN" : locale)}`;
      script.dataset.gysGoogleIdentity = "true";
      document.head.appendChild(script);
    }
  }).catch((error) => {
    googleScriptPromise = undefined;
    throw error;
  });
  return googleScriptPromise;
}

export async function renderEgysGoogleButton(
  element: HTMLElement,
  onCredential: (credential: string) => void | Promise<void>,
  clientId = import.meta.env.VITE_EGYS_GOOGLE_CLIENT_ID?.trim() ||
    EGYS_GOOGLE_CLIENT_ID,
  { locale = "id", signal }: { locale?: string; signal?: AbortSignal } = {},
): Promise<() => void> {
  await loadGoogleIdentityScript(locale);
  if (signal?.aborted) return () => {};
  const google = window.google;
  if (!google?.accounts?.id)
    throw new Error("Google Identity Services is unavailable");
  let active = true;
  google.accounts.id.initialize({
    client_id: clientId,
    callback: (response) => {
      if (active && !signal?.aborted) return onCredential(response.credential);
    },
    ux_mode: "popup",
    auto_select: false,
  });
  let lastWidth = 0;
  const render = (): boolean => {
    const width = Math.min(
      400,
      Math.floor(element.getBoundingClientRect().width),
    );
    if (!active || signal?.aborted || width <= 0 || width === lastWidth)
      return true;
    lastWidth = width;
    element.replaceChildren();
    google.accounts.id.renderButton(element, {
      type: width < 200 ? "icon" : "standard",
      theme: "outline",
      size: "large",
      text: "signin_with",
      shape: "rectangular",
      width,
      locale: locale === "zh" ? "zh_CN" : locale,
    });
    // Google answers an unknown origin or client by rendering nothing and
    // logging only in its own console. Report that instead of leaving an empty
    // host on top of the row.
    if (paintedControl(element)) return true;
    lastWidth = 0;
    element.dispatchEvent(new Event(GOOGLE_UNAVAILABLE_EVENT));
    return false;
  };
  if (!render())
    throw new Error("Google Identity Services rendered no sign-in control");
  const observer = new ResizeObserver(() => {
    render();
  });
  observer.observe(element);
  return () => {
    active = false;
    observer.disconnect();
    google.accounts.id.cancel();
    element.replaceChildren();
  };
}

/** The JavaScript origins the Google Identity client must have registered.
 * Google answers `origin_mismatch` (400) from accounts.google.com for any
 * other origin, which the app cannot detect from its own window, so the
 * account card warns before the click instead of after the rejection. */
export const EGYS_GOOGLE_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "https://gyspnk.github.io",
] as const;

export function googleOriginRegistered(origin: string): boolean {
  return (EGYS_GOOGLE_ORIGINS as readonly string[]).includes(origin);
}

/** Whether Google actually showed something after a press. */
export type GooglePressOutcome = "displayed" | "silent";

/**
 * Ask Google to show its account chooser for the press that just happened.
 *
 * The row hands its presses to this instead of to Google's own iframe: a click
 * inside a cross-origin frame never reaches this page, so the iframe flow
 * cannot answer the one question readers actually ask — "did the button do
 * anything?" `prompt` reports through its listener whether a window appeared.
 */
export function pressEgysGoogle(timeoutMs = 2000): Promise<GooglePressOutcome> {
  const askGoogle = window.google?.accounts?.id.prompt;
  if (typeof askGoogle !== "function") return Promise.resolve("silent");
  return new Promise((resolve) => {
    let settled = false;
    const settle = (outcome: GooglePressOutcome) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(outcome);
    };
    const timer = window.setTimeout(() => settle("silent"), timeoutMs);
    try {
      askGoogle((notification) => {
        if (notification.isDisplayed?.() || notification.isDismissedMoment?.())
          settle("displayed");
        else if (
          notification.isNotDisplayed?.() ||
          notification.isSkippedMoment?.()
        )
          settle("silent");
      });
    } catch {
      settle("silent");
    }
  });
}
