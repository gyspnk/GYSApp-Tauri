import { useEffect, useRef, useState } from "react";
import {
  GOOGLE_UNAVAILABLE_EVENT,
  renderEgysGoogleButton,
} from "./egys-google.js";
import { GoogleMark } from "./egys-login-methods.js";
import { recordDiagnostic } from "./diagnostics.js";
import { translate, type Locale } from "./i18n.js";

/** Why Google could not place a control in the row. */
export type GoogleFailure = "unavailable";

/**
 * Google's own button, visible and pressable, so a press opens Google's real
 * sign-in window. One Tap's minimal card is deliberately not used: once it is
 * dismissed it is hard to bring back, which readers read as a dead button.
 */
export function EgysGoogleButton({
  locale,
  onCredential,
  onStatus,
}: {
  locale: Locale;
  onCredential: (credential: string) => void | Promise<void>;
  onStatus?: ((status: "ready" | "error") => void) | undefined;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [attempt, retry] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  useEffect(() => {
    const controller = new AbortController();
    const control = host.current!;
    // A re-render Google refuses (a resize into an unsupported width) must not
    // leave an empty host on top of the row either.
    const unavailable = () => {
      recordDiagnostic("warn", "egys.google-unavailable", {});
      setStatus("error");
    };
    control.addEventListener(GOOGLE_UNAVAILABLE_EVENT, unavailable);
    let cleanup: (() => void) | undefined;
    setStatus("loading");
    void renderEgysGoogleButton(control, onCredential, undefined, {
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
      control.removeEventListener(GOOGLE_UNAVAILABLE_EVENT, unavailable);
      controller.abort();
      cleanup?.();
    };
  }, [locale, onCredential, attempt]);
  useEffect(() => {
    if (status !== "loading") onStatus?.(status);
  }, [status, onStatus]);
  const label = translate(locale, "more.googleLogin");
  return (
    <div
      className="egys-provider egys-provider-google egys-google-control"
      aria-busy={status === "loading"}
    >
      {/* The shared face only paints while Google has nothing to show; once its
          control exists it takes the whole frame and keeps its own name. */}
      <span className="egys-google-face" aria-hidden="true">
        <GoogleMark />
        <span>Google</span>
      </span>
      <div
        ref={host}
        className="egys-google-button"
        inert={status !== "ready"}
      />
      {status !== "ready" && (
        // Never inert: a press while the script is still loading restarts the
        // attempt instead of doing nothing at all.
        <button
          type="button"
          className="egys-google-fallback"
          aria-label={label}
          aria-busy={status === "loading"}
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
      {status === "error" && !onStatus && (
        // The account card renders the same sentence itself, visibly; a second
        // alert there would only duplicate it.
        <span className="sr-only" role="alert">
          {translate(locale, "more.googleButtonFailed")}
        </span>
      )}
    </div>
  );
}
