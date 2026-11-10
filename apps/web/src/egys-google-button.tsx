import { useEffect, useRef, useState } from "react";
import {
  GOOGLE_UNAVAILABLE_EVENT,
  pressEgysGoogle,
  renderEgysGoogleButton,
} from "./egys-google.js";
import { watchGooglePopup } from "./google-popup-watch.js";
import { GoogleMark } from "./egys-login-methods.js";
import { recordDiagnostic } from "./diagnostics.js";
import { translate, type Locale } from "./i18n.js";

/** Why Google could not hand a credential over. The card says which one. */
export type GoogleFailure = "unavailable" | "silent";

/** Google's own personalized button opens authorization directly from this row. */
export function EgysGoogleButton({
  locale,
  onCredential,
  onStatus,
}: {
  locale: Locale;
  onCredential: (credential: string) => void | Promise<void>;
  onStatus?:
    ((status: "ready" | "error", reason?: GoogleFailure) => void) | undefined;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [attempt, retry] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [popupBlocked, setPopupBlocked] = useState(false);
  const [failure, setFailure] = useState<GoogleFailure>("unavailable");
  const [pressing, setPressing] = useState(false);
  /**
   * Every press lands here, never inside Google's iframe: a click in a
   * cross-origin frame is invisible to this page, and that invisibility is
   * exactly what readers described as "the Google button does nothing".
   */
  const press = async () => {
    if (pressing) return;
    setPressing(true);
    const watch = watchGooglePopup();
    try {
      const outcome = await pressEgysGoogle();
      if (watch.blocked) {
        setPopupBlocked(true);
        recordDiagnostic("warn", "egys.google-popup-blocked", {
          attempted: watch.attempted,
        });
      } else if (outcome === "silent" && !watch.opened) {
        // Google accepted the press and showed nothing: the origin or the
        // client is not allowed. Silence is the bug, so say what happened.
        recordDiagnostic("warn", "egys.google-silent-press", {
          attempted: watch.attempted,
        });
        setFailure("silent");
        setStatus("error");
      }
    } finally {
      watch.restore();
      setPressing(false);
    }
  };
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
    if (status === "error") onStatus?.("error", failure);
    else if (status === "ready") onStatus?.("ready");
  }, [status, failure, onStatus]);
  const label = translate(locale, "more.googleLogin");
  return (
    <div
      className="egys-provider egys-provider-google egys-google-control"
      aria-busy={status === "loading"}
    >
      {/* One visual face for every provider. The Google Identity control stays
          on top (transparent) so its own click flow keeps working while the row
          reads as three identical buttons. */}
      <span className="egys-google-face" aria-hidden="true">
        <GoogleMark />
        <span>Google</span>
      </span>
      {/* Hidden from the accessibility tree and the pointer: this page owns the
          press now, and a second "Login dengan Google" control would only make
          the name ambiguous for readers and tests alike. */}
      <div
        ref={host}
        className="egys-google-button"
        aria-hidden="true"
        inert={true}
      />
      {status === "ready" && (
        // The press surface sits above Google's iframe so the click is ours.
        <button
          type="button"
          className="egys-google-press"
          aria-label={label}
          aria-busy={pressing}
          onClick={press}
        />
      )}
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
      {popupBlocked && status !== "loading" && (
        <p className="egys-google-error" role="alert">
          {translate(locale, "more.googlePopupBlocked")}
        </p>
      )}
    </div>
  );
}
