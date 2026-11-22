import { useCallback, useEffect, useRef, useState } from "react";
import { getEgysProfile, saveEgysProfile } from "./egys.js";
import { EgysGoogleButton } from "./egys-google-button.js";
import { GoogleMark } from "./egys-login-methods.js";
import { translate, type Locale } from "./i18n.js";
import {
  isTauriShell,
  openNativeEgysLogin,
  subscribeNativeEgysLogin,
} from "./native-platform.js";
import { useReadinessMarker } from "./readiness.js";
import { Select } from "./select.js";

type WelcomeProps = {
  locale: Locale;
  setLocale: (value: Locale) => void;
  onDone: () => void;
  /** The account card's Google flow, reused so there is one login path. */
  onCredential: (credential: string) => Promise<void>;
};

/**
 * First-run screen: greeting, language, an optional sign-in, and a skip that
 * leaves the app fully usable without an account. It renders before the shell
 * so a new device never lands in the middle of the reader.
 */
export function WelcomePage({
  locale,
  setLocale,
  onDone,
  onCredential,
}: WelcomeProps) {
  useReadinessMarker("gys-welcome-ready");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const completedRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const native = isTauriShell();
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  const completeOnce = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onDone();
  }, [onDone]);
  const runAuth = useCallback(
    async (action: () => Promise<void>) => {
      setBusy(true);
      setError("");
      setNotice("");
      try {
        await action();
      } catch (err) {
        setError(
          err instanceof Error && err.message.trim()
            ? err.message
            : translate(locale, "more.profileReadFailed"),
        );
      } finally {
        setBusy(false);
      }
    },
    [locale],
  );
  useEffect(() => {
    if (!native) return;
    return subscribeNativeEgysLogin(() => {
      void runAuth(async () => {
        const profile = await getEgysProfile();
        if (!profile)
          throw new Error(translate(locale, "more.profileReadFailed"));
        saveEgysProfile(profile);
        completeOnce();
      });
    });
  }, [native, runAuth, locale, completeOnce]);
  const handleCredential = useCallback(
    (credential: string) =>
      runAuth(async () => {
        await onCredential(credential);
        completeOnce();
      }),
    [runAuth, onCredential, completeOnce],
  );
  const openNativeLogin = useCallback(async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await openNativeEgysLogin();
      setNotice(translate(locale, "more.nativeLoginOpened"));
    } catch {
      setError(translate(locale, "more.nativeLoginFailed"));
    } finally {
      setBusy(false);
    }
  }, [locale]);
  const clearMessages = useCallback(() => {
    setError("");
    setNotice("");
  }, []);
  const finish = useCallback(() => completeOnce(), [completeOnce]);
  return (
    <main className="welcome-page">
      <section className="welcome-card" aria-labelledby="welcome-title">
        <div className="welcome-copy">
          <p className="welcome-mark">
            <img
              src={`${import.meta.env.BASE_URL}assets/gys-logo.png`}
              alt="Gereja Yesus Sejati"
              width={220}
              height={28}
            />
          </p>
          <h1 id="welcome-title" ref={headingRef} tabIndex={-1}>
            {translate(locale, "welcome.title")}
          </h1>
          <p className="welcome-body">{translate(locale, "welcome.body")}</p>
        </div>
        <div className="welcome-language">
          <Select
            value={locale}
            onChange={setLocale}
            className="welcome-language-select"
            animated
            label={translate(locale, "welcome.language")}
            options={[
              { value: "id", label: "Bahasa Indonesia" },
              { value: "en", label: "English" },
              { value: "zh", label: "中文" },
            ]}
          />
        </div>
        <div className="welcome-login" aria-busy={busy}>
          {native ? (
            <button
              type="button"
              className="egys-provider egys-provider-google"
              disabled={busy}
              aria-label={translate(locale, "more.googleLogin")}
              onClick={() => void openNativeLogin()}
            >
              <GoogleMark />
              <span>Google</span>
            </button>
          ) : (
            <EgysGoogleButton
              locale={locale}
              onCredential={handleCredential}
              onPress={clearMessages}
            />
          )}
          {notice && !error && (
            <p className="egys-google-press-status" role="status">
              {notice}
            </p>
          )}
          {error && (
            <p
              className="egys-google-press-status egys-google-error"
              role="alert"
            >
              {error}
            </p>
          )}
          <p className="welcome-hint">
            {translate(locale, "welcome.loginHint")}
          </p>
        </div>
        <button type="button" className="welcome-skip" onClick={finish}>
          {translate(locale, "welcome.skip")}
        </button>
      </section>
    </main>
  );
}
