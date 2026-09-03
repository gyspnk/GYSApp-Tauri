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
          text: "signin_with";
          shape: "rectangular";
          width: number;
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

function loadGoogleIdentityScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (googleScriptPromise) return googleScriptPromise;
  if (typeof document === "undefined")
    return Promise.reject(new Error("Google Identity Services is unavailable"));

  googleScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      "script[data-gys-google-identity]",
    );
    const script = existing ?? document.createElement("script");
    const loaded = () => {
      if (window.google?.accounts?.id) resolve();
      else reject(new Error("Google Identity Services did not initialize"));
    };
    script.addEventListener("load", loaded, { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error("Google Identity Services failed to load")),
      { once: true },
    );
    if (!existing) {
      script.async = true;
      script.defer = true;
      script.src = GOOGLE_IDENTITY_SCRIPT;
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
): Promise<() => void> {
  await loadGoogleIdentityScript();
  const google = window.google;
  if (!google?.accounts?.id)
    throw new Error("Google Identity Services is unavailable");
  let active = true;
  google.accounts.id.initialize({
    client_id: clientId,
    callback: (response) => {
      if (active) return onCredential(response.credential);
    },
    ux_mode: "popup",
    auto_select: false,
  });
  google.accounts.id.renderButton(element, {
    theme: "outline",
    size: "large",
    text: "signin_with",
    shape: "rectangular",
    width: 320,
  });
  return () => {
    active = false;
    google.accounts.id.cancel();
    element.replaceChildren();
  };
}
