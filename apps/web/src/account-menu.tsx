import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link, useLocation } from "react-router-dom";
import { AccountAvatar } from "./account-avatar.js";
import {
  readCachedEgysProfile,
  subscribeEgysProfile,
  getEgysProfile,
  saveEgysProfile,
  signInEgysWithGoogle,
  signOutEgys,
} from "./egys.js";
import {
  isTauriShell,
  openNativeEgysLogin,
  subscribeNativeEgysLogin,
} from "./native-platform.js";
import { createPlatformServices } from "./platform.js";
import { translate, type Locale } from "./i18n.js";
import { Icon } from "./icons.js";
import { useMenuPresence } from "./use-menu-presence.js";
import "./account-menu.css";

const GoogleButton = lazy(() =>
  import("./egys-google-button.js").then((m) => ({
    default: m.EgysGoogleButton,
  })),
);

export function AccountMenu({ locale }: { locale: Locale }) {
  const [profile, setProfile] = useState(readCachedEgysProfile);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const present = useMenuPresence(open, panel);
  const location = useLocation();
  const native = isTauriShell();
  useEffect(
    () => subscribeEgysProfile(() => setProfile(readCachedEgysProfile())),
    [],
  );
  useEffect(() => {
    setOpen(false);
  }, [location.key]);
  const refreshProfile = useCallback(async () => {
    const next = await getEgysProfile();
    if (!next) throw new Error("Profile unavailable");
    saveEgysProfile(next);
  }, []);
  useEffect(() => {
    if (!native) return;
    return subscribeNativeEgysLogin(() => {
      void refreshProfile().catch(() =>
        setError(translate(locale, "more.profileReadFailed")),
      );
    });
  }, [native, refreshProfile, locale]);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", keyboard);
    };
  }, [open]);
  const run = useCallback(
    async (action: () => Promise<void>) => {
      setBusy(true);
      setError("");
      try {
        await action();
      } catch {
        setError(translate(locale, "more.profileReadFailed"));
      } finally {
        setBusy(false);
      }
    },
    [locale],
  );
  const googleLogin = useCallback(
    (credential: string) =>
      run(async () => {
        await signInEgysWithGoogle(credential);
        await refreshProfile();
      }),
    [run, refreshProfile],
  );
  return (
    <div
      className="account-menu"
      ref={root}
      onBlur={(event) => {
        if (
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget)
        )
          setOpen(false);
      }}
    >
      <button
        ref={trigger}
        className="account-button"
        type="button"
        aria-label={translate(locale, "shell.account")}
        aria-expanded={open}
        aria-controls="header-account-panel"
        onClick={() => setOpen((value) => !value)}
      >
        <AccountAvatar />
      </button>
      {present && (
        <div
          ref={panel}
          id="header-account-panel"
          className="account-popover"
          data-menu-open={open}
          inert={!open}
          role="region"
          aria-label={translate(locale, "more.accountEgys")}
        >
          <div className="account-popover-identity">
            <span className="account-menu-avatar">
              <AccountAvatar />
            </span>
            <div>
              <strong>
                {profile?.displayName ?? translate(locale, "more.accountEgys")}
              </strong>
              <span>
                {profile?.branchName ??
                  profile?.email ??
                  translate(locale, "more.guest")}
              </span>
            </div>
            {profile && <Icon name="checkCircle" size={17} />}
          </div>
          {profile?.branchName && profile.email && (
            <p className="account-popover-email">{profile.email}</p>
          )}
          {!profile && (
            <div className="account-menu-login" aria-busy={busy}>
              {native ? (
                <button
                  className="quiet-button"
                  disabled={busy}
                  onClick={() => void run(openNativeEgysLogin)}
                >
                  {translate(locale, "more.googleLogin")}
                </button>
              ) : (
                <Suspense fallback={<span role="status">Google…</span>}>
                  <GoogleButton locale={locale} onCredential={googleLogin} />
                </Suspense>
              )}
              <Link to="/lainnya?section=account">
                WhatsApp · Apple <Icon name="chevronRight" size={16} />
              </Link>
            </div>
          )}
          <div className="account-popover-actions">
            <Link to="/lainnya?section=account">
              <Icon name="settings" size={18} />
              <span>{translate(locale, "more.accountEgys")}</span>
              <Icon name="chevronRight" size={15} />
            </Link>
            <button
              type="button"
              onClick={() =>
                void run(() =>
                  createPlatformServices().openExternal("https://e.gys.or.id"),
                )
              }
            >
              <Icon name="externalLink" size={18} />
              <span>{translate(locale, "account.openPortal")}</span>
              <Icon name="chevronRight" size={15} />
            </button>
            {profile && (
              <button
                type="button"
                className="account-menu-signout"
                disabled={busy}
                onClick={() => void run(signOutEgys)}
              >
                <Icon name="logout" size={18} />
                <span>{translate(locale, "account.signOut")}</span>
              </button>
            )}
          </div>
          {error && (
            <p className="account-menu-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
