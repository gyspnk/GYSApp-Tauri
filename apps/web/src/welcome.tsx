import { useCallback, useEffect, useRef } from "react";
import { EgysGoogleButton } from "./egys-google-button.js";
import { translate, type Locale } from "./i18n.js";
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
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  const finish = useCallback(() => onDone(), [onDone]);
  return (
    <main className="welcome-page">
      <section className="welcome-card" aria-labelledby="welcome-title">
        <p className="welcome-mark" aria-hidden="true">
          GYS
        </p>
        <h1 id="welcome-title" ref={headingRef} tabIndex={-1}>
          {translate(locale, "welcome.title")}
        </h1>
        <p className="welcome-body">{translate(locale, "welcome.body")}</p>
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
        <div className="welcome-login">
          <EgysGoogleButton locale={locale} onCredential={onCredential} />
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
