const GOOGLE_IDENTITY_SCRIPT = "https://accounts.google.com/gsi/client";

export const EGYS_GOOGLE_CLIENT_ID =
  "748303683851-46ea0qkq8ti4r6lh8ss5aivf60ct71u7.apps.googleusercontent.com";

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
    };
  };
};

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
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
  const render = () => {
    const width = Math.min(
      400,
      Math.floor(element.getBoundingClientRect().width),
    );
    if (!active || signal?.aborted || width <= 0 || width === lastWidth) return;
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
  };
  const observer = new ResizeObserver(render);
  observer.observe(element);
  render();
  return () => {
    active = false;
    observer.disconnect();
    google.accounts.id.cancel();
    element.replaceChildren();
  };
}
