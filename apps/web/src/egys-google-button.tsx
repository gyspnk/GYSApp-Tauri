import { useEffect, useRef, useState } from "react";
import {
  GOOGLE_UNAVAILABLE_EVENT,
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
  useEffect(() => {
    // The consent window never opens when the browser blocks popups, and Google
    // gives us no error. Watch our own click and say what happened.
    const watch = watchGooglePopup();
    const control = host.current;
    let timer: number | undefined;
    const onClick = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (watch.opened) return;
        if (watch.blocked) {
          setPopupBlocked(true);
          recordDiagnostic("warn", "egys.google-popup-blocked", {
            attempted: watch.attempted,
          });
          return;
        }
        // Google accepted the press and nothing happened: the origin or the
        // client is not allowed. A pressure that ends in silence is the exact
        // bug readers report as "tombol Google tidak merespons", so say it.
        recordDiagnostic("warn", "egys.google-silent-press", {
          attempted: watch.attempted,
        });
        setFailure("silent");
        setStatus("error");
      }, 1500);
    };
    control?.addEventListener("click", onClick, true);
    return () => {
      window.clearTimeout(timer);
      control?.removeEventListener("click", onClick, true);
      watch.restore();
    };
  }, []);
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
