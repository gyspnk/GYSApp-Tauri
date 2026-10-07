import { useEffect, useRef, useState } from "react";
import { renderEgysGoogleButton } from "./egys-google.js";
import { GoogleMark } from "./egys-login-methods.js";
import { recordDiagnostic } from "./diagnostics.js";
import { translate, type Locale } from "./i18n.js";

/** Google's own personalized button opens authorization directly from this row. */
export function EgysGoogleButton({
  locale,
  onCredential,
}: {
  locale: Locale;
  onCredential: (credential: string) => void | Promise<void>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [attempt, retry] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  useEffect(() => {
    const controller = new AbortController();
    let cleanup: (() => void) | undefined;
    setStatus("loading");
    void renderEgysGoogleButton(host.current!, onCredential, undefined, {
      locale,
      signal: controller.signal,
    })
      .then((dispose) => {
        if (controller.signal.aborted) dispose();
        else {
          cleanup = dispose;
          setStatus("ready");
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        recordDiagnostic("warn", "egys.google-script", error);
        setStatus("error");
      });
    return () => {
      controller.abort();
      cleanup?.();
    };
  }, [locale, onCredential, attempt]);
  const label = translate(locale, "more.googleLogin");
  return (
    <div
      className="egys-provider egys-provider-google egys-google-control"
      aria-busy={status === "loading"}
    >
      <div
        ref={host}
        className="egys-google-button"
        aria-hidden={status !== "ready"}
        inert={status !== "ready"}
      />
      {status !== "ready" && (
        <button
          type="button"
          className="egys-google-fallback"
          aria-label={label}
          disabled={status === "loading"}
          title={
            status === "error"
              ? translate(locale, "more.googleButtonFailed")
              : label
          }
          onClick={() => retry((value) => value + 1)}
        >
          <GoogleMark />
          <span>Google</span>
        </button>
      )}
      {status === "error" && (
        <span className="sr-only" role="alert">
          {translate(locale, "more.googleButtonFailed")}
        </span>
      )}
    </div>
  );
}
