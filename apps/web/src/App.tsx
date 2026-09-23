import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ErrorInfo,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type ReactNode,
} from "react";
import {
  BrowserRouter,
  Link,
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { DESTINATIONS, type Destination } from "./navigation.js";
import { translate, type Locale } from "./i18n.js";
import {
  fetchSauh,
  getCachedSauh,
  selectTodaySauh,
  subscribeSauh,
} from "./sauh.js";
import {
  fetchSuara,
  fetchSuaraSnapshot,
  getCachedSuara,
  subscribeSuara,
} from "./suara.js";
import {
  fetchLiteratureCatalog,
  literatureCategoryLabels,
  subscribeLiterature,
} from "./literature-catalog.js";
import {
  SpeechEnginePreferenceSchema,
  type LiteratureItem,
} from "@gys/contracts";
import { LazyImage } from "./lazy-image.js";
import { midiPlayer } from "./midi-player.js";
import {
  installMidiQueueCoordinator,
  playMidiPlaylistItem,
  playNextMidiPlaylistItem,
  playPreviousMidiPlaylistItem,
} from "./midi-queue.js";
import { installMediaSessionBridge } from "./media-session.js";
import { speechPlayer } from "./speech-player.js";
import {
  getCustomEdgeEndpoint,
  isEdgeSpeechConfigured,
  setCustomEdgeEndpoint,
} from "./edge-speech.js";
import {
  getMidiPlaylist,
  subscribeMidiPlaylist,
  applyAutoNextMode,
  getAutoNextMode,
} from "./midi-playlist.js";
import { chordKeyName, transposeBetweenKeys } from "./chord-viewer.js";
import { Select } from "./select.js";
import { recordDiagnostic } from "./diagnostics.js";
import { GM_INSTRUMENTS, midiInstrumentLabel } from "./midi-instruments.js";
import {
  getActivity,
  subscribeActivity,
  type ActivityState,
} from "./history.js";
import { installHeadphoneDisconnectGuard } from "./headphone-guard.js";
import { useScreenWakeLock } from "./wake-lock.js";
import { getShellSettingsStorage } from "./platform.js";
import {
  readShellSettings,
  writeShellSettings,
  type ShellTheme,
} from "./settings.js";
import { Icon } from "./icons.js";
import { UiPreferencesPanel } from "./ui-preferences-panel.js";
import { useBibleHeaderState } from "./bible-header-store.js";
import {
  readSidebarCollapsed,
  writeSidebarCollapsed,
} from "./shell-preferences.js";

const BiblePage = lazy(() =>
  import("./bible.js").then(({ BiblePage: Page }) => ({ default: Page })),
);
const KidungPage = lazy(() =>
  import("./kidung.js").then(({ KidungPage: Page }) => ({ default: Page })),
);
const FaithPage = lazy(() =>
  import("./faith.js").then(({ FaithPage: Page }) => ({ default: Page })),
);
const LiteraturePage = lazy(() =>
  import("./literature.js").then(({ LiteraturePage: Page }) => ({
    default: Page,
  })),
);
const LiteratureDetailPage = lazy(() =>
  import("./literature.js").then(({ LiteratureDetailPage: Page }) => ({
    default: Page,
  })),
);
const SauhPage = lazy(() =>
  import("./online-content.js").then(({ SauhPage: Page }) => ({
    default: Page,
  })),
);
const SuaraPage = lazy(() =>
  import("./online-content.js").then(({ SuaraPage: Page }) => ({
    default: Page,
  })),
);
const SuaraDetailPage = lazy(() =>
  import("./online-content.js").then(({ SuaraDetailPage: Page }) => ({
    default: Page,
  })),
);
const MorePage = lazy(() =>
  import("./more.js").then(({ MorePage: Page }) => ({ default: Page })),
);
const GlobalSearch = lazy(() =>
  import("./global-search.js").then(({ GlobalSearch: Search }) => ({
    default: Search,
  })),
);

type Theme = ShellTheme;

async function handleHardRefresh() {
  try {
    if ("caches" in window) {
      const keys = await window.caches.keys();
      await Promise.all(keys.map((key) => window.caches.delete(key)));
    }
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((reg) => reg.unregister()));
    }
    window.sessionStorage.clear();
  } catch {
    // ignore purge error
  }
  window.location.reload();
}

function getActiveLocale(): Locale {
  const storage = getShellSettingsStorage();
  if (storage) return readShellSettings(storage).locale;
  const documentLocale =
    typeof document === "undefined" ? "" : document.documentElement.lang;
  return documentLocale === "en" || documentLocale === "zh"
    ? documentLocale
    : "id";
}

class AppErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  public override state: { failed: boolean } = { failed: false };
  public static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  public override componentDidCatch(error: Error, info: ErrorInfo): void {
    recordDiagnostic("error", "react-error-boundary", error);
    console.error("GYSApp shell error", error, info);
  }
  public override render(): ReactNode {
    if (this.state.failed)
      return (
        <main
          className="error-state route-recovery"
          aria-live="assertive"
          data-testid="app-error-boundary"
        >
          <div className="route-recovery-mark" aria-hidden="true">
            <Icon name="book" size={27} />
          </div>
          <h1>{translate(getActiveLocale(), "shell.appErrorTitle")}</h1>
          <p>{translate(getActiveLocale(), "shell.appErrorBody")}</p>
          <button
            className="primary-button"
            type="button"
            autoFocus
            onClick={() => void handleHardRefresh()}
          >
            {translate(getActiveLocale(), "shell.reload")}
          </button>
        </main>
      );
    return this.props.children;
  }
}

type NonReaderRouteId =
  "home" | "sauh" | "suara" | "faith" | "literature" | "more";

function getNonReaderRouteId(pathname: string): NonReaderRouteId {
  if (pathname === "/sauh") return "sauh";
  if (pathname.startsWith("/suara")) return "suara";
  if (pathname === "/iman") return "faith";
  if (pathname.startsWith("/literatur")) return "literature";
  if (pathname === "/lainnya") return "more";
  return "home";
}

function getRouteTitleKey(pathname: string): string {
  if (pathname === "/") return "home.title";
  if (pathname === "/sauh") return "home.sauh";
  if (pathname.startsWith("/suara")) return "home.testimony";
  if (pathname === "/bible") return "page.bibleTitle";
  if (pathname.startsWith("/kidung")) return "page.kidungTitle";
  if (pathname === "/iman") return "nav.iman";
  if (pathname.startsWith("/literatur")) return "literature.title";
  if (pathname === "/lainnya") return "page.moreTitle";
  return "shell.routeOpening";
}

function NonReaderRouteLoading({
  locale,
  pathname,
}: {
  locale: Locale;
  pathname: string;
}) {
  const routeId = getNonReaderRouteId(pathname);
  const title = translate(locale, getRouteTitleKey(pathname));
  return (
    <div
      className={`route-loading non-reader-route-loading is-${routeId}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={translate(locale, "shell.routeLoading", { title })}
      data-testid="non-reader-route-loading"
      data-route={routeId}
    >
      <span className="route-loading-label">
        {translate(locale, "shell.routeLoading", { title })}
      </span>
      <div className="route-loading-heading" aria-hidden="true">
        <span className="route-loading-kicker" />
        <span className="route-loading-title" />
      </div>
      <div className="route-loading-grid" aria-hidden="true">
        <div className="route-loading-card is-feature">
          <span className="route-loading-media" />
          <span className="route-loading-line is-title" />
          <span className="route-loading-line" />
          <span className="route-loading-line is-medium" />
        </div>
        <div className="route-loading-card is-stack">
          <span className="route-loading-line is-short" />
          <span className="route-loading-line" />
          <span className="route-loading-line is-medium" />
          <span className="route-loading-line" />
          <span className="route-loading-line is-short" />
        </div>
        <div className="route-loading-card is-list">
          <span className="route-loading-line is-title" />
          <span className="route-loading-line" />
          <span className="route-loading-line is-medium" />
          <span className="route-loading-line" />
        </div>
      </div>
    </div>
  );
}

function RouteRecovery({
  locale,
  onRetry,
}: {
  locale: Locale;
  onRetry: () => void;
}) {
  return (
    <section
      className="route-recovery"
      role="alert"
      aria-live="assertive"
      data-testid="route-recovery"
    >
      <div className="route-recovery-mark" aria-hidden="true">
        <Icon name="book" size={25} />
      </div>
      <h1>{translate(locale, "shell.routeErrorTitle")}</h1>
      <p>{translate(locale, "shell.routeErrorBody")}</p>
      <button className="primary-button" type="button" onClick={onRetry}>
        {translate(locale, "shell.routeRetry")}
      </button>
    </section>
  );
}

function NotFoundPage({ locale }: { locale: Locale }) {
  return (
    <section
      className="route-recovery not-found-page"
      role="status"
      aria-live="polite"
      aria-labelledby="not-found-title"
      data-testid="not-found-page"
    >
      <div className="route-recovery-mark" aria-hidden="true">
        <Icon name="book" size={25} />
      </div>
      <h1 id="not-found-title">{translate(locale, "shell.notFoundTitle")}</h1>
      <p>{translate(locale, "shell.notFoundBody")}</p>
      <Link className="primary-button" to="/">
        {translate(locale, "shell.notFoundHome")}
      </Link>
    </section>
  );
}

class RouteErrorBoundary extends Component<
  { children: ReactNode; locale: Locale },
  { error: Error | null }
> {
  public override state: { error: Error | null } = { error: null };

  public static getDerivedStateFromError(error: Error): {
    error: Error;
  } {
    return { error };
  }

  public override componentDidCatch(error: Error, info: ErrorInfo): void {
    recordDiagnostic("error", "route-error-boundary", error);
    console.error("GYSApp route error", error, info);
  }

  public override render(): ReactNode {
    if (this.state.error) {
      return (
        <RouteRecovery
          locale={this.props.locale}
          onRetry={() => window.location.reload()}
        />
      );
    }
    return this.props.children;
  }
}

function useAppSettings() {
  const storage = getShellSettingsStorage();
  const [settings, setSettings] = useState(() => readShellSettings(storage));
  useEffect(() => {
    writeShellSettings(settings, storage);
    document.documentElement.lang = settings.locale;
  }, [settings, storage]);
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);
  const setLocale = useCallback((locale: Locale) => {
    setSettings((current) => ({ ...current, locale }));
  }, []);
  const setTheme = useCallback((theme: Theme) => {
    setSettings((current) => ({ ...current, theme }));
  }, []);
  return {
    locale: settings.locale,
    setLocale,
    theme: settings.theme,
    setTheme,
  };
}

function Navigation({ locale }: { locale: Locale }) {
  const location = useLocation();
  const navRef = useRef<HTMLElement>(null);
  const itemsRef = useRef<Map<string, HTMLAnchorElement>>(new Map());
  const [indicatorStyle, setIndicatorStyle] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
    opacity: number;
  }>({ top: 0, left: 0, width: 0, height: 0, opacity: 0 });

  const activePath = useMemo(() => {
    const matched = DESTINATIONS.find((destination) =>
      destination.path === "/"
        ? location.pathname === "/"
        : location.pathname === destination.path ||
          location.pathname.startsWith(`${destination.path}/`),
    );
    return matched?.path ?? "/";
  }, [location.pathname]);

  const updateIndicator = useCallback(() => {
    if (!navRef.current || !activePath) {
      setIndicatorStyle((prev) => ({ ...prev, opacity: 0 }));
      return;
    }
    const activeEl = itemsRef.current.get(activePath);
    if (!activeEl) {
      setIndicatorStyle((prev) => ({ ...prev, opacity: 0 }));
      return;
    }
    const navRect = navRef.current.getBoundingClientRect();
    const itemRect = activeEl.getBoundingClientRect();
    setIndicatorStyle({
      top: itemRect.top - navRect.top,
      left: itemRect.left - navRect.left,
      width: itemRect.width,
      height: itemRect.height,
      opacity: 1,
    });
  }, [activePath]);

  useLayoutEffect(() => {
    updateIndicator();
  }, [updateIndicator]);

  useEffect(() => {
    const handleResize = () => updateIndicator();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [updateIndicator]);

  useEffect(() => {
    const nav = navRef.current;
    const activeEl = activePath ? itemsRef.current.get(activePath) : undefined;
    if (!nav || !activeEl || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateIndicator);
    observer.observe(nav);
    observer.observe(activeEl);
    return () => observer.disconnect();
  }, [activePath, updateIndicator]);

  return (
    <nav
      ref={navRef}
      className="primary-nav"
      aria-label={translate(locale, "shell.navigation")}
    >
      <div
        className="nav-active-indicator"
        aria-hidden="true"
        style={{
          transform: `translate3d(${indicatorStyle.left}px, ${indicatorStyle.top}px, 0)`,
          width: `${indicatorStyle.width}px`,
          height: `${indicatorStyle.height}px`,
          opacity: indicatorStyle.opacity,
        }}
      />
      {DESTINATIONS.map((destination) => (
        <NavLink
          key={destination.path}
          ref={(el) => {
            if (el) itemsRef.current.set(destination.path, el);
            else itemsRef.current.delete(destination.path);
          }}
          to={destination.path}
          end={destination.path === "/"}
          className={({ isActive }) =>
            `nav-item${isActive ? " is-active" : ""}`
          }
          aria-label={translate(locale, destination.labelKey)}
          title={translate(locale, destination.labelKey)}
          data-nav-label={translate(locale, destination.labelKey)}
        >
          <Icon name={destination.icon} />
          <span className="nav-copy">
            <strong>{translate(locale, destination.labelKey)}</strong>
            <small>{translate(locale, destination.descriptionKey)}</small>
          </span>
        </NavLink>
      ))}
    </nav>
  );
}

function Header({
  locale,
  setLocale,
  theme,
  setTheme,
  online,
  onOpenSearch,
  searchTriggerRef,
  pathname,
  onFocusPageSearch,
}: {
  locale: Locale;
  setLocale: (value: Locale) => void;
  theme: Theme;
  setTheme: (value: Theme) => void;
  online: boolean;
  onOpenSearch: () => void;
  searchTriggerRef: RefObject<HTMLButtonElement | null>;
  pathname: string;
  onFocusPageSearch: () => void;
}) {
  const isBibleRoute = pathname === "/bible";
  const bibleHeader = useBibleHeaderState();
  const [hamburgerOpen, setHamburgerOpen] = useState(false);
  const hamburgerRef = useRef<HTMLDivElement>(null);

  const midiSnapshot = useSyncExternalStore(
    midiPlayer.subscribe,
    midiPlayer.snapshot,
    midiPlayer.snapshot,
  );
  const midiPlaylist = useSyncExternalStore(
    subscribeMidiPlaylist,
    getMidiPlaylist,
    getMidiPlaylist,
  );
  const isMidiPlaying = midiSnapshot.status === "playing";
  const queuedMidiItem =
    midiPlaylist.items[midiPlaylist.currentIndex] ?? midiPlaylist.items[0];

  const speechSnapshot = useSyncExternalStore(
    speechPlayer.subscribe,
    speechPlayer.snapshot,
    speechPlayer.snapshot,
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        hamburgerRef.current &&
        !hamburgerRef.current.contains(event.target as Node)
      ) {
        setHamburgerOpen(false);
      }
    };
    if (hamburgerOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [hamburgerOpen]);

  const handleToggleMidi = () => {
    if (isMidiPlaying) {
      void midiPlayer.pause().catch(() => undefined);
    } else if (midiSnapshot.songId) {
      void midiPlayer.play().catch(() => undefined);
    } else if (queuedMidiItem) {
      void playMidiPlaylistItem(queuedMidiItem.songId).catch((error) =>
        recordDiagnostic("warn", "midi.header-play", error),
      );
    }
  };

  if (isBibleRoute) {
    return (
      <header className="topbar is-reader-context">
        <div className="reader-context-bar">
          <div className="reader-context-left">
            {isBibleRoute && bibleHeader?.active ? (
              <>
                <button
                  className="reader-context-book-picker quick-nav-handle"
                  type="button"
                  onClick={(event) =>
                    bibleHeader.onOpenPicker(event.currentTarget)
                  }
                  onPointerDown={bibleHeader.startQuickNav}
                  onKeyDown={bibleHeader.quickNavKeyDown}
                  role="button"
                  tabIndex={0}
                  aria-label={translate(locale, "bible.bookPickerAria")}
                  title={translate(locale, "bible.pickBookChapter")}
                >
                  <Icon name="book" size={15} />
                  <strong className="picker-book-title">
                    {bibleHeader.bookName} {bibleHeader.chapter}
                  </strong>
                  <span className="picker-chevron">
                    <Icon name="chevronDown" size={12} />
                  </span>
                </button>

                <div className="reader-version-select-wrap">
                  <Select
                    value={bibleHeader.versionCode}
                    onChange={bibleHeader.onSelectVersion}
                    className="topbar-select reader-context-select version-select"
                    label={translate(
                      locale,
                      bibleHeader.splitView
                        ? "bible.versionOne"
                        : "bible.version",
                    )}
                    options={bibleHeader.versionOptions}
                  />
                  {bibleHeader.splitView &&
                    bibleHeader.secondaryVersionCode &&
                    bibleHeader.onSelectSecondaryVersion && (
                      <Select
                        value={bibleHeader.secondaryVersionCode}
                        onChange={bibleHeader.onSelectSecondaryVersion}
                        className="topbar-select reader-context-select version-select secondary-version-select"
                        label={translate(locale, "bible.versionTwo")}
                        options={bibleHeader.versionOptions}
                      />
                    )}
                </div>
              </>
            ) : (
              <div className="reader-context-title">
                <span>
                  {isBibleRoute
                    ? translate(locale, "bible.reading")
                    : "Kidung Rohani"}
                </span>
                <strong>{isBibleRoute ? "Alkitab" : "Kidung"}</strong>
              </div>
            )}
          </div>

          <div className="reader-context-actions">
            {isBibleRoute && bibleHeader?.active ? (
              <>
                {bibleHeader.speechAvailable && (
                  <button
                    className={`reader-context-button reader-speech-btn${bibleHeader.speaking ? " is-speaking" : ""}`}
                    type="button"
                    onClick={bibleHeader.onToggleSpeech}
                    aria-label={
                      bibleHeader.speechStatus === "paused"
                        ? translate(locale, "bible.resumeReading")
                        : bibleHeader.speechStatus === "speaking"
                          ? translate(locale, "bible.pauseReading")
                          : bibleHeader.speaking
                            ? translate(locale, "bible.stopReading")
                            : translate(locale, "bible.readAloud")
                    }
                    title={translate(
                      locale,
                      bibleHeader.speaking
                        ? "bible.stopChapter"
                        : "bible.readChapter",
                    )}
                  >
                    <Icon
                      name={
                        bibleHeader.speechStatus === "speaking"
                          ? "pause"
                          : bibleHeader.speechStatus === "paused"
                            ? "play"
                            : bibleHeader.speaking
                              ? "stop"
                              : "play"
                      }
                      size={15}
                    />
                  </button>
                )}

                {/* Hamburger menu di paling kanan */}
                <div className="reader-hamburger-wrapper" ref={hamburgerRef}>
                  <button
                    className={`reader-context-button reader-hamburger-btn${hamburgerOpen ? " is-active" : ""}`}
                    type="button"
                    aria-expanded={hamburgerOpen}
                    aria-label={translate(locale, "bible.menu")}
                    title={translate(locale, "bible.menu")}
                    onClick={() => setHamburgerOpen((v) => !v)}
                  >
                    <span className="hamburger-icon" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                  </button>
                  {hamburgerOpen && (
                    <>
                      <div
                        className="reader-hamburger-backdrop"
                        onClick={() => setHamburgerOpen(false)}
                        aria-hidden="true"
                      />
                      <div
                        className="reader-hamburger-drawer"
                        role="dialog"
                        aria-label={translate(locale, "bible.menuTitle")}
                      >
                        <div className="hamburger-drawer-header">
                          <div className="hamburger-drawer-title">
                            <Icon name="book" size={16} />
                            <strong>
                              {translate(locale, "bible.menuTitle")}
                            </strong>
                          </div>
                          <button
                            className="hamburger-drawer-close"
                            type="button"
                            onClick={() => setHamburgerOpen(false)}
                            aria-label={translate(locale, "bible.closeMenu")}
                            title={translate(locale, "bible.closeMenu")}
                          >
                            ✕
                          </button>
                        </div>

                        <div className="hamburger-drawer-body">
                          {/* Section 1: Typography */}
                          <div className="hamburger-card">
                            <div className="hamburger-card-header">
                              <span className="hamburger-section-label">
                                {translate(locale, "bible.textSize")}
                              </span>
                              <span className="hamburger-size-badge">
                                {bibleHeader.fontSize}px
                              </span>
                            </div>
                            <div className="hamburger-typography-stepper">
                              <button
                                type="button"
                                className="typography-step-btn"
                                onClick={bibleHeader.onDecreaseFontSize}
                                disabled={
                                  bibleHeader.fontSize <=
                                  bibleHeader.minFontSize
                                }
                                aria-label={translate(
                                  locale,
                                  "bible.decreaseText",
                                )}
                              >
                                <span className="step-label">A−</span>
                                <small>
                                  {translate(locale, "bible.small")}
                                </small>
                              </button>
                              <div className="typography-size-indicator">
                                <strong>{bibleHeader.fontSize}</strong>
                                <small>pt</small>
                              </div>
                              <button
                                type="button"
                                className="typography-step-btn"
                                onClick={bibleHeader.onIncreaseFontSize}
                                disabled={
                                  bibleHeader.fontSize >=
                                  bibleHeader.maxFontSize
                                }
                                aria-label={translate(
                                  locale,
                                  "bible.increaseText",
                                )}
                              >
                                <span className="step-label">A+</span>
                                <small>
                                  {translate(locale, "bible.large")}
                                </small>
                              </button>
                            </div>
                          </div>

                          {/* Section 2: Mode Tampilan */}
                          <div className="hamburger-section">
                            <span className="hamburger-section-label">
                              {translate(locale, "bible.viewMode")}
                            </span>
                            <div className="hamburger-group">
                              <button
                                className={`hamburger-item${bibleHeader.splitView ? " is-active" : ""}`}
                                type="button"
                                onClick={() => {
                                  bibleHeader.onToggleSplitView();
                                }}
                              >
                                <div className="hamburger-item-icon">
                                  <Icon name="columns" size={16} />
                                </div>
                                <div className="hamburger-item-text">
                                  <strong>
                                    {translate(locale, "bible.splitView")}
                                  </strong>
                                  <small>
                                    {translate(locale, "bible.splitViewHint")}
                                  </small>
                                </div>
                                <div
                                  className={`hamburger-switch ${bibleHeader.splitView ? "is-on" : ""}`}
                                >
                                  <span className="switch-thumb" />
                                </div>
                              </button>

                              {bibleHeader.splitView && (
                                <button
                                  className={`hamburger-item${bibleHeader.syncScroll ? " is-active" : ""}`}
                                  type="button"
                                  onClick={() =>
                                    bibleHeader.onToggleSyncScroll()
                                  }
                                >
                                  <div className="hamburger-item-icon">
                                    <Icon name="arrow" size={16} />
                                  </div>
                                  <div className="hamburger-item-text">
                                    <strong>
                                      {translate(locale, "bible.syncScroll")}
                                    </strong>
                                    <small>
                                      {translate(
                                        locale,
                                        "bible.syncScrollHint",
                                      )}
                                    </small>
                                  </div>
                                  <div
                                    className={`hamburger-switch ${bibleHeader.syncScroll ? "is-on" : ""}`}
                                  >
                                    <span className="switch-thumb" />
                                  </div>
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Section 3: Audio Alkitab Suara */}
                          <div className="hamburger-section">
                            <span className="hamburger-section-label">
                              {translate(locale, "bible.audioBible")}
                            </span>
                            <div className="hamburger-group">
                              <button
                                className={`hamburger-item${speechSnapshot.playerOpen || bibleHeader.speaking ? " is-active" : ""}`}
                                type="button"
                                disabled={!bibleHeader.speechAvailable}
                                onClick={() => {
                                  bibleHeader.onToggleSpeech();
                                  setHamburgerOpen(false);
                                }}
                              >
                                <div className="hamburger-item-icon">
                                  <Icon
                                    name={
                                      speechSnapshot.playerOpen ||
                                      bibleHeader.speaking
                                        ? "bible"
                                        : "play"
                                    }
                                    size={16}
                                  />
                                </div>
                                <div className="hamburger-item-text">
                                  <strong>
                                    {translate(locale, "bible.audioPlayer")}
                                  </strong>
                                  <small>
                                    {speechSnapshot.playerOpen ||
                                    bibleHeader.speaking
                                      ? translate(locale, "bible.audioActive")
                                      : translate(
                                          locale,
                                          "bible.showAudioPlayer",
                                        )}
                                  </small>
                                </div>
                                <span
                                  className={`hamburger-badge ${speechSnapshot.playerOpen || bibleHeader.speaking ? "is-playing" : ""}`}
                                >
                                  {speechSnapshot.playerOpen ||
                                  bibleHeader.speaking
                                    ? translate(locale, "bible.active")
                                    : translate(
                                        locale,
                                        "bible.showAudioPlayer",
                                      )}
                                </span>
                              </button>

                              <button
                                className={`hamburger-item speech-settings-toggle${bibleHeader.speechControlsOpen ? " is-active" : ""}`}
                                type="button"
                                aria-expanded={bibleHeader.speechControlsOpen}
                                onClick={bibleHeader.onToggleSpeechControls}
                              >
                                <div className="hamburger-item-icon">
                                  <Icon name="settings" size={16} />
                                </div>
                                <div className="hamburger-item-text">
                                  <strong>
                                    {translate(locale, "bible.audioSettings")}
                                  </strong>
                                  <small>
                                    {bibleHeader.speechControlsOpen
                                      ? translate(
                                          locale,
                                          "bible.closeAudioOptions",
                                        )
                                      : translate(
                                          locale,
                                          "bible.configureAudio",
                                        )}
                                  </small>
                                </div>
                                <div className="hamburger-expand-badge">
                                  <Icon
                                    name={
                                      bibleHeader.speechControlsOpen
                                        ? "chevronUp"
                                        : "chevronDown"
                                    }
                                    size={15}
                                  />
                                </div>
                              </button>
                            </div>

                            {/* Pengaturan Detail Alkitab Suara */}
                            {bibleHeader.speechControlsOpen && (
                              <div className="drawer-speech-card">
                                <label className="drawer-speech-row">
                                  <span>
                                    {translate(locale, "bible.engine")}
                                  </span>
                                  <select
                                    className="drawer-speech-select"
                                    value={speechSnapshot.engine}
                                    onChange={(event) =>
                                      speechPlayer.setEngine(
                                        SpeechEnginePreferenceSchema.parse(
                                          event.target.value,
                                        ),
                                      )
                                    }
                                  >
                                    <option
                                      value="edge"
                                      disabled={!isEdgeSpeechConfigured()}
                                    >
                                      Edge TTS
                                    </option>
                                    <option value="local">
                                      {translate(locale, "bible.localTts")}
                                    </option>
                                  </select>
                                </label>

                                <label className="drawer-speech-row">
                                  <span>
                                    {translate(locale, "bible.voice")}
                                  </span>
                                  <select
                                    className="drawer-speech-select"
                                    value={
                                      speechSnapshot.voices.some(
                                        (v) => v.id === speechSnapshot.voiceId,
                                      )
                                        ? speechSnapshot.voiceId
                                        : ""
                                    }
                                    onChange={(e) =>
                                      speechPlayer.setVoice(e.target.value)
                                    }
                                  >
                                    <option value="">
                                      {translate(locale, "bible.defaultVoice")}
                                    </option>
                                    {(speechSnapshot.engine === "edge"
                                      ? (speechSnapshot.edgeVoices ?? [])
                                      : speechSnapshot.voices.filter((voice) =>
                                          speechSnapshot.engine === "local"
                                            ? voice.local
                                            : true,
                                        )
                                    ).map((voice) => (
                                      <option value={voice.id} key={voice.id}>
                                        {voice.name}
                                      </option>
                                    ))}
                                  </select>
                                  {speechSnapshot.engine === "edge" &&
                                    !isEdgeSpeechConfigured() && (
                                      <small className="drawer-speech-hint">
                                        {translate(locale, "bible.edgeHint")}
                                      </small>
                                    )}
                                </label>

                                {speechSnapshot.engine === "edge" && (
                                  <label className="drawer-speech-row">
                                    <span className="drawer-speech-label">
                                      {translate(
                                        locale,
                                        "bible.gatewayEndpoint",
                                      )}{" "}
                                      ({translate(locale, "bible.optional")})
                                    </span>
                                    <input
                                      type="url"
                                      className="drawer-speech-input"
                                      placeholder={translate(
                                        locale,
                                        "bible.edgeEndpointPlaceholder",
                                      )}
                                      defaultValue={getCustomEdgeEndpoint()}
                                      onBlur={(e) => {
                                        setCustomEdgeEndpoint(e.target.value);
                                        void speechPlayer.loadVoices();
                                      }}
                                    />
                                  </label>
                                )}

                                <div className="drawer-speech-row">
                                  <div className="drawer-speech-row-header">
                                    <span className="drawer-speech-label">
                                      {translate(locale, "bible.readingSpeed")}
                                    </span>
                                    <span className="drawer-speech-val">
                                      {speechSnapshot.rate.toFixed(1)}×
                                    </span>
                                  </div>
                                  <input
                                    type="range"
                                    className="drawer-speech-range"
                                    aria-label={translate(
                                      locale,
                                      "bible.voiceRate",
                                    )}
                                    min="0.5"
                                    max="2"
                                    step="0.1"
                                    value={speechSnapshot.rate}
                                    onChange={(e) =>
                                      speechPlayer.setRate(
                                        Number(e.target.value),
                                      )
                                    }
                                  />
                                </div>

                                <div className="drawer-speech-row">
                                  <div className="drawer-speech-row-header">
                                    <span className="drawer-speech-label">
                                      {translate(locale, "bible.readingPitch")}
                                    </span>
                                    <span className="drawer-speech-val">
                                      {speechSnapshot.pitch.toFixed(1)}×
                                    </span>
                                  </div>
                                  <input
                                    type="range"
                                    className="drawer-speech-range"
                                    aria-label={translate(
                                      locale,
                                      "bible.voicePitch",
                                    )}
                                    min="0.5"
                                    max="2"
                                    step="0.1"
                                    value={speechSnapshot.pitch}
                                    onChange={(e) =>
                                      speechPlayer.setPitch(
                                        Number(e.target.value),
                                      )
                                    }
                                  />
                                </div>

                                <div className="drawer-speech-row">
                                  <div className="drawer-speech-row-header">
                                    <span className="drawer-speech-label">
                                      {translate(locale, "bible.volume")}
                                    </span>
                                    <span className="drawer-speech-val">
                                      {Math.round(speechSnapshot.volume * 100)}%
                                    </span>
                                  </div>
                                  <input
                                    type="range"
                                    className="drawer-speech-range"
                                    aria-label={translate(
                                      locale,
                                      "bible.voiceVolume",
                                    )}
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    value={speechSnapshot.volume}
                                    onChange={(e) =>
                                      speechPlayer.setVolume(
                                        Number(e.target.value),
                                      )
                                    }
                                  />
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Section 4: Tampilan & Bahasa */}
                          <div className="hamburger-section">
                            <span className="hamburger-section-label">
                              {translate(locale, "more.appearance")}
                            </span>
                            <div
                              className="hamburger-group"
                              style={{
                                padding: "12px 14px",
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr",
                                gap: "10px",
                              }}
                            >
                              <Select
                                value={locale}
                                onChange={setLocale}
                                className="topbar-select"
                                label={translate(locale, "shell.language")}
                                options={[
                                  { value: "id", label: "ID" },
                                  { value: "en", label: "EN" },
                                  { value: "zh", label: "中文" },
                                ]}
                              />
                              <Select
                                value={theme}
                                onChange={setTheme}
                                className="topbar-select theme-select"
                                label={translate(locale, "shell.theme")}
                                options={[
                                  {
                                    value: "system",
                                    label: translate(locale, "theme.system"),
                                    shortLabel: "",
                                    icon: "system",
                                  },
                                  {
                                    value: "light",
                                    label: translate(locale, "theme.light"),
                                    shortLabel: "",
                                    icon: "sun",
                                  },
                                  {
                                    value: "dark",
                                    label: translate(locale, "theme.dark"),
                                    shortLabel: "",
                                    icon: "moon",
                                  },
                                  {
                                    value: "amoled",
                                    label: translate(locale, "theme.amoled"),
                                    shortLabel: "",
                                    icon: "amoled",
                                  },
                                  {
                                    value: "sepia",
                                    label: translate(locale, "theme.sepia"),
                                    shortLabel: "",
                                    icon: "sepia",
                                  },
                                ]}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : (
              <>
                {isBibleRoute ? (
                  <button
                    className="reader-context-button"
                    type="button"
                    onClick={onFocusPageSearch}
                    aria-label={
                      isBibleRoute
                        ? translate(locale, "bible.searchVerses")
                        : "Buka pencarian lagu"
                    }
                  >
                    <Icon name="search" size={15} />
                  </button>
                ) : null}
                <button
                  className={`reader-context-button reader-midi-btn${isMidiPlaying ? " is-active" : ""}`}
                  type="button"
                  onClick={handleToggleMidi}
                  aria-label={translate(locale, "bible.musicPlayer")}
                  title={translate(locale, "bible.musicPlayer")}
                >
                  <Icon name="music" size={15} />
                </button>
              </>
            )}
          </div>

          {!isBibleRoute && (
            <div className="reader-context-settings">
              <Select
                value={locale}
                onChange={setLocale}
                className="topbar-select reader-context-select"
                label={translate(locale, "shell.language")}
                options={[
                  { value: "id", label: "ID" },
                  { value: "en", label: "EN" },
                  { value: "zh", label: "中文" },
                ]}
              />
              <Select
                value={theme}
                onChange={setTheme}
                className="topbar-select reader-context-select theme-select"
                label={translate(locale, "shell.theme")}
                options={[
                  {
                    value: "system",
                    label: translate(locale, "shell.themeSystem"),
                    shortLabel: "",
                    icon: "system",
                  },
                  {
                    value: "light",
                    label: translate(locale, "shell.themeLight"),
                    shortLabel: "",
                    icon: "sun",
                  },
                  {
                    value: "dark",
                    label: translate(locale, "shell.themeDark"),
                    shortLabel: "",
                    icon: "moon",
                  },
                  {
                    value: "amoled",
                    label: translate(locale, "shell.themeAmoled"),
                    shortLabel: "",
                    icon: "amoled",
                  },
                  {
                    value: "sepia",
                    label: translate(locale, "shell.themeSepia"),
                    shortLabel: "",
                    icon: "sepia",
                  },
                ]}
              />
            </div>
          )}
        </div>
      </header>
    );
  }

  return (
    <header className="topbar">
      <Link
        className="brand brand-mark"
        to="/"
        aria-label="Gereja Yesus Sejati"
      >
        <img
          src={`${import.meta.env.BASE_URL}assets/gys-logo.png`}
          alt="Gereja Yesus Sejati"
        />
      </Link>
      <div className="topbar-actions">
        <button
          ref={searchTriggerRef}
          className="search-trigger"
          type="button"
          onClick={onOpenSearch}
          aria-label={translate(locale, "shell.searchAll")}
        >
          <Icon name="search" size={18} />
          <span>{translate(locale, "shell.search")}</span>
          <kbd>⌘K</kbd>
        </button>
        <span
          className={`connection-status ${online ? "is-online" : "is-offline"}`}
          aria-live="polite"
        >
          <i aria-hidden="true" />
          {translate(locale, online ? "shell.online" : "shell.offline")}
        </span>
        <Select
          value={locale}
          onChange={setLocale}
          className="topbar-select"
          label={translate(locale, "shell.language")}
          options={[
            { value: "id", label: "ID" },
            { value: "en", label: "EN" },
            { value: "zh", label: "中文" },
          ]}
        />
        <Select
          value={theme}
          onChange={setTheme}
          className="topbar-select theme-select"
          label={translate(locale, "shell.theme")}
          options={[
            {
              value: "system",
              label: translate(locale, "shell.themeSystem"),
              shortLabel: "",
              icon: "system",
            },
            {
              value: "light",
              label: translate(locale, "shell.themeLight"),
              shortLabel: "",
              icon: "sun",
            },
            {
              value: "dark",
              label: translate(locale, "shell.themeDark"),
              shortLabel: "",
              icon: "moon",
            },
            {
              value: "amoled",
              label: translate(locale, "shell.themeAmoled"),
              shortLabel: "",
              icon: "amoled",
            },
            {
              value: "sepia",
              label: translate(locale, "shell.themeSepia"),
              shortLabel: "",
              icon: "sepia",
            },
          ]}
        />
        <Link
          className="account-button"
          to="/lainnya"
          aria-label={translate(locale, "shell.account")}
        >
          <Icon name="person" size={18} />
        </Link>
      </div>
    </header>
  );
}

function MediaSurface({ locale }: { locale: Locale }) {
  const navigate = useNavigate();
  const snapshot = useSyncExternalStore(
    midiPlayer.subscribe,
    midiPlayer.snapshot,
    midiPlayer.snapshot,
  );
  const speechSnapshot = useSyncExternalStore(
    speechPlayer.subscribe,
    speechPlayer.snapshot,
    speechPlayer.snapshot,
  );
  const playlist = useSyncExternalStore(
    subscribeMidiPlaylist,
    getMidiPlaylist,
    getMidiPlaylist,
  );
  const midiHasSession = Boolean(snapshot.songId && snapshot.status !== "idle");
  const speechHasSession =
    (speechSnapshot.total > 0 && speechSnapshot.status !== "idle") ||
    speechSnapshot.playerOpen;
  type MediaKind = "midi" | "speech";
  const [activeMediaKind, setActiveMediaKind] = useState<MediaKind | undefined>(
    () => (speechHasSession ? "speech" : midiHasSession ? "midi" : undefined),
  );
  const previousMediaRef = useRef({
    midiSongId: snapshot.songId,
    midiStatus: snapshot.status,
    speechStatus: speechSnapshot.status,
    speechPlayerOpen: Boolean(speechSnapshot.playerOpen),
    speechContextPath: speechSnapshot.context?.path,
  });
  useEffect(() => {
    const previous = previousMediaRef.current;
    const speechStarted =
      ((speechSnapshot.status === "loading" ||
        speechSnapshot.status === "speaking") &&
        speechSnapshot.status !== previous.speechStatus) ||
      (Boolean(speechSnapshot.playerOpen) && !previous.speechPlayerOpen) ||
      (speechHasSession &&
        speechSnapshot.context?.path !== previous.speechContextPath);
    const midiStarted =
      snapshot.songId !== previous.midiSongId ||
      ((snapshot.status === "loading" || snapshot.status === "playing") &&
        snapshot.status !== previous.midiStatus);

    previousMediaRef.current = {
      midiSongId: snapshot.songId,
      midiStatus: snapshot.status,
      speechStatus: speechSnapshot.status,
      speechPlayerOpen: Boolean(speechSnapshot.playerOpen),
      speechContextPath: speechSnapshot.context?.path,
    };

    if (speechStarted) setActiveMediaKind("speech");
    else if (midiStarted) setActiveMediaKind("midi");
  }, [
    snapshot.songId,
    snapshot.status,
    speechHasSession,
    speechSnapshot.context?.path,
    speechSnapshot.playerOpen,
    speechSnapshot.status,
  ]);
  useEffect(() => {
    setActiveMediaKind((current) => {
      if (current === "speech" && !speechHasSession)
        return midiHasSession ? "midi" : undefined;
      if (current === "midi" && !midiHasSession)
        return speechHasSession ? "speech" : undefined;
      if (!current)
        return speechHasSession
          ? "speech"
          : midiHasSession
            ? "midi"
            : undefined;
      return current;
    });
  }, [midiHasSession, speechHasSession]);
  const speechActive = activeMediaKind === "speech";
  const isKidungMedia = activeMediaKind === "midi";
  const hasMediaSession = speechActive ? speechHasSession : midiHasSession;
  const latestMidiRef = useRef(snapshot);
  const latestSpeechRef = useRef(speechSnapshot);
  const latestMediaKindRef = useRef(activeMediaKind);
  latestMidiRef.current = snapshot;
  latestSpeechRef.current = speechSnapshot;
  latestMediaKindRef.current = activeMediaKind;
  const previousMidiStatusRef = useRef(snapshot.status);
  useEffect(() => {
    const previousStatus = previousMidiStatusRef.current;
    previousMidiStatusRef.current = snapshot.status;
    if (
      previousStatus !== snapshot.status &&
      (snapshot.status === "loading" || snapshot.status === "playing")
    ) {
      void speechPlayer.pause().catch(() => undefined);
    }
  }, [snapshot.status]);
  // gyschordweb mini-player parity: key/accidental mirror the hymn transpose
  // state; the displayed key is derived from the current transpose offset.
  const [keyAccidental, setKeyAccidental] = useState<"sharp" | "flat">(
    () =>
      (localStorage.getItem("gys-hymn-accidental") as "sharp" | "flat") ??
      "sharp",
  );
  useEffect(() => {
    localStorage.setItem("gys-hymn-accidental", keyAccidental);
  }, [keyAccidental]);
  const [keyMenuOpen, setKeyMenuOpen] = useState(false);
  const [tempoOpen, setTempoOpen] = useState(false);
  const midiLoopMode = getAutoNextMode();
  const cycleLoopMode = () => {
    const order: Array<"off" | "one" | "all"> = ["off", "one", "all"];
    let current: "off" | "one" | "all" = "off";
    if (midiLoopMode === "off") current = "off";
    else if (midiLoopMode === "one") current = "one";
    else if (midiLoopMode === "all") current = "all";
    const next = order[(order.indexOf(current) + 1) % order.length] ?? "off";
    applyAutoNextMode(next);
  };
  const loopLabel = {
    off: translate(locale, "media.loopOff"),
    one: translate(locale, "media.loopOne"),
    all: translate(locale, "media.loopAll"),
    number: translate(locale, "media.loopNumber"),
    playlist: translate(locale, "media.loopPlaylist"),
    "shuffle-all": translate(locale, "media.loopShuffleAll"),
    "shuffle-playlist": translate(locale, "media.loopShufflePlaylist"),
  }[midiLoopMode];
  const loopBadge =
    midiLoopMode === "off" ? "0" : midiLoopMode === "one" ? "1" : "∞";
  // Key index from the current transpose offset, matching the hymn viewer.
  const keyIndex = ((snapshot.transpose % 12) + 12) % 12;
  // gyschordweb mini-player subtitle: shows the effective auto-next mode and
  // the next song when known.
  const autoNextSubtitle = (() => {
    if (midiLoopMode === "one")
      return translate(locale, "media.singleLoopMode");
    if (midiLoopMode === "off") return translate(locale, "media.loopModeOff");
    const currentIndex = playlist.items.findIndex(
      (entry) => entry.songId === snapshot.songId,
    );
    if (midiLoopMode === "shuffle-all")
      return currentIndex >= 0
        ? translate(locale, "media.shuffleAllSongs")
        : translate(locale, "media.shuffleAll");
    if (midiLoopMode === "shuffle-playlist")
      return translate(locale, "media.shufflePlaylist");
    if (midiLoopMode === "playlist") {
      if (currentIndex >= 0 && currentIndex < playlist.items.length - 1)
        return translate(locale, "media.playlistNext", {
          title: playlist.items[currentIndex + 1]?.title ?? "",
        });
      return currentIndex >= 0
        ? translate(locale, "media.playlistFinished")
        : translate(locale, "media.autoNextPlaylist");
    }
    if (currentIndex >= 0 && currentIndex < playlist.items.length - 1)
      return translate(locale, "media.nextTitle", {
        title: playlist.items[currentIndex + 1]?.title ?? "",
      });
    return currentIndex >= 0
      ? translate(locale, "media.endOfList")
      : translate(locale, "media.queueEmpty");
  })();
  // gyschordweb mini-player lyrics toggle: jump into the hymn text view.
  const openHymnLyrics = () => {
    if (mediaPath) navigate(mediaPath);
  };
  const mediaTitle = speechActive
    ? (speechSnapshot.context?.label ??
      translate(locale, "media.bibleVerse", {
        current: Math.max(1, speechSnapshot.currentIndex + 1),
        total: speechSnapshot.total,
      }))
    : (snapshot.title ?? snapshot.songId);
  const mediaPath = speechActive
    ? speechSnapshot.context?.path
    : snapshot.songId
      ? `/kidung/${encodeURIComponent(snapshot.songId)}`
      : undefined;
  const speechProviderLabel =
    speechSnapshot.providerId === "edge-compatibility"
      ? "Edge TTS"
      : speechSnapshot.providerId === "browser-system"
        ? speechSnapshot.offline
          ? translate(locale, "media.localTts")
          : translate(locale, "media.systemTts")
        : speechSnapshot.engine === "edge"
          ? "Edge TTS"
          : speechSnapshot.engine === "local"
            ? translate(locale, "media.localTts")
            : translate(locale, "media.speechBible");
  const dragRef = useRef<
    | {
        pointerId: number;
        startX: number;
        startY: number;
        originLeft: number;
        originTop: number;
      }
    | undefined
  >(undefined);
  const [dragging, setDragging] = useState(false);
  const [position, setPosition] = useState<
    { left: number; top: number } | undefined
  >(() => {
    try {
      const stored = JSON.parse(
        localStorage.getItem("gys-media-position-v1") ?? "null",
      ) as { left?: unknown; top?: unknown } | null;
      return typeof stored?.left === "number" && typeof stored.top === "number"
        ? { left: stored.left, top: stored.top }
        : undefined;
    } catch {
      return undefined;
    }
  });
  const [minimized, setMinimized] = useState(
    () => localStorage.getItem("gys-media-minimized") === "1",
  );
  useEffect(() => {
    const syncPreference = () =>
      setMinimized(localStorage.getItem("gys-media-minimized") === "1");
    window.addEventListener("gys-media-preference-change", syncPreference);
    return () =>
      window.removeEventListener("gys-media-preference-change", syncPreference);
  }, []);
  useEffect(() => {
    localStorage.setItem("gys-media-minimized", minimized ? "1" : "0");
  }, [minimized]);
  useEffect(() => {
    if (!position) return;
    localStorage.setItem("gys-media-position-v1", JSON.stringify(position));
  }, [position]);
  useEffect(() => {
    let frame = 0;
    const clampPosition = () => {
      setPosition((current) => {
        if (!current) return current;
        const surface = document.querySelector<HTMLElement>(".media-surface");
        const width = surface?.getBoundingClientRect().width ?? 0;
        const height = surface?.getBoundingClientRect().height ?? 0;
        const maxLeft = Math.max(8, window.innerWidth - width - 8);
        const maxTop = Math.max(8, window.innerHeight - height - 8);
        return {
          left: Math.max(8, Math.min(current.left, maxLeft)),
          top: Math.max(8, Math.min(current.top, maxTop)),
        };
      });
    };
    const onResize = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(clampPosition);
    };
    window.addEventListener("resize", onResize);
    onResize();
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
    };
  }, []);
  useEffect(() => {
    // A minimized player is shorter than the expanded surface. Re-clamp after
    // either state changes so a saved desktop position cannot put controls
    // below the viewport on a phone or after an orientation change.
    const frame = window.requestAnimationFrame(() => {
      setPosition((current) => {
        if (!current) return current;
        const surface = document.querySelector<HTMLElement>(".media-surface");
        const width = surface?.getBoundingClientRect().width ?? 0;
        const height = surface?.getBoundingClientRect().height ?? 0;
        return {
          left: Math.max(
            8,
            Math.min(current.left, window.innerWidth - width - 8),
          ),
          top: Math.max(
            8,
            Math.min(current.top, window.innerHeight - height - 8),
          ),
        };
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [minimized, snapshot.songId, speechActive]);
  useEffect(() => {
    if (!hasMediaSession || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: mediaTitle ?? "GYS",
      artist: "Gereja Yesus Sejati",
      album: speechActive ? "Alkitab TB" : "Kidung Rohani",
    });
    const handlers: Array<
      [
        MediaSessionAction,
        (details?: MediaSessionActionDetails) => void | Promise<void>,
      ]
    > = [
      [
        "play",
        () => {
          const speech = latestSpeechRef.current;
          if (latestMediaKindRef.current === "speech")
            return speech.status === "error"
              ? speechPlayer.stop()
              : speechPlayer.resume();
          void speechPlayer.pause();
          return midiPlayer.play().catch(() => undefined);
        },
      ],
      [
        "pause",
        () =>
          latestMediaKindRef.current === "speech"
            ? speechPlayer.pause()
            : midiPlayer.pause().catch(() => undefined),
      ],
      [
        "stop",
        () =>
          latestMediaKindRef.current === "speech"
            ? speechPlayer.stop()
            : midiPlayer.stop().catch(() => undefined),
      ],
      [
        "seekbackward",
        () => {
          const midi = latestMidiRef.current;
          return latestMediaKindRef.current === "speech"
            ? speechPlayer.stop()
            : midiPlayer.seek(Math.max(0, midi.position - 10));
        },
      ],
      [
        "seekforward",
        () => {
          const midi = latestMidiRef.current;
          return latestMediaKindRef.current === "speech"
            ? speechPlayer.stop()
            : midiPlayer.seek(Math.min(midi.duration, midi.position + 10));
        },
      ],
      [
        "seekto",
        (details) => {
          const midi = latestMidiRef.current;
          return latestMediaKindRef.current === "speech"
            ? speechPlayer.stop()
            : midiPlayer.seek(details?.seekTime ?? midi.position);
        },
      ],
    ];
    for (const [action, handler] of handlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Safari exposes the Media Session object but not every action.
      }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {
          /* unsupported action */
        }
      }
    };
  }, [hasMediaSession, mediaTitle, speechActive]);
  if (!hasMediaSession) return null;
  const playing = speechActive
    ? speechSnapshot.status === "speaking"
    : snapshot.status === "playing";
  const currentPlaylistIndex = playlist.items.findIndex(
    (item) => item.songId === snapshot.songId,
  );
  const canPlayPrevious = currentPlaylistIndex > 0;
  const canPlayNext =
    currentPlaylistIndex >= 0 &&
    currentPlaylistIndex < playlist.items.length - 1;
  const togglePlayback = () => {
    if (speechActive) {
      if (speechSnapshot.status === "error") {
        void speechPlayer.stop();
      } else if (playing) {
        void speechPlayer.pause();
      } else if (speechSnapshot.status === "paused") {
        void speechPlayer.resume();
      } else {
        void speechPlayer.play();
      }
      return;
    }
    if (!playing) void speechPlayer.pause();
    void (playing ? midiPlayer.pause() : midiPlayer.play()).catch(
      () => undefined,
    );
  };
  const beginDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (window.matchMedia("(max-width: 959px)").matches) return;
    const surface = event.currentTarget.closest<HTMLElement>(".media-surface");
    if (!surface) return;
    const rect = surface.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originLeft: rect.left,
      originTop: rect.top,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };
  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const surface = event.currentTarget.closest<HTMLElement>(".media-surface");
    if (!surface) return;
    const left = drag.originLeft + event.clientX - drag.startX;
    const top = drag.originTop + event.clientY - drag.startY;
    setPosition({
      left: Math.max(
        8,
        Math.min(left, window.innerWidth - surface.offsetWidth - 8),
      ),
      top: Math.max(
        8,
        Math.min(top, window.innerHeight - surface.offsetHeight - 8),
      ),
    });
  };
  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = undefined;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const moveByKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (window.matchMedia("(max-width: 959px)").matches) return;
    const directionByKey: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const direction = directionByKey[event.key];
    if (!direction) return;
    const surface = event.currentTarget.closest<HTMLElement>(".media-surface");
    if (!surface) return;
    event.preventDefault();
    const step = event.shiftKey ? 48 : 16;
    const rect = surface.getBoundingClientRect();
    const left = (position?.left ?? rect.left) + direction[0] * step;
    const top = (position?.top ?? rect.top) + direction[1] * step;
    setPosition({
      left: Math.max(8, Math.min(left, window.innerWidth - rect.width - 8)),
      top: Math.max(8, Math.min(top, window.innerHeight - rect.height - 8)),
    });
  };
  const midiAdvancedControls = (
    <>
      <div className="media-midi-actions">
        <button
          className="media-control media-loop-control"
          type="button"
          onClick={cycleLoopMode}
          aria-pressed={midiLoopMode !== "off"}
          aria-label={translate(locale, "media.loopControl", {
            mode: loopLabel,
          })}
          title={translate(locale, "media.loopTitle", { mode: loopLabel })}
        >
          <Icon name="repeat" size={16} />
          <small aria-hidden="true">{loopBadge}</small>
        </button>
        <div className="media-key-control">
          <button
            className="media-control"
            type="button"
            onClick={() => setKeyMenuOpen((open) => !open)}
            aria-expanded={keyMenuOpen}
            aria-haspopup="listbox"
            aria-label={translate(locale, "media.keySelect")}
            title={translate(locale, "media.keySelect")}
          >
            {chordKeyName(keyIndex, keyAccidental)}
          </button>
          {keyMenuOpen && (
            <div
              className="media-key-dropdown"
              role="listbox"
              aria-label={translate(locale, "media.keyLabel")}
            >
              {Array.from({ length: 12 }, (_, value) => (
                <button
                  key={value}
                  type="button"
                  role="option"
                  aria-selected={value === keyIndex}
                  className={value === keyIndex ? "is-selected" : undefined}
                  onClick={() => {
                    void midiPlayer
                      .setTranspose(transposeBetweenKeys(keyIndex, value))
                      .catch(() => undefined);
                    setKeyMenuOpen(false);
                  }}
                >
                  {chordKeyName(value, keyAccidental)}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          className="media-control"
          type="button"
          onClick={() =>
            setKeyAccidental((current) =>
              current === "sharp" ? "flat" : "sharp",
            )
          }
          aria-label={translate(locale, "media.notation")}
          aria-pressed={keyAccidental === "flat"}
          title={
            keyAccidental === "sharp"
              ? translate(locale, "media.notationSharp")
              : translate(locale, "media.notationFlat")
          }
        >
          {keyAccidental === "sharp" ? "♯" : "♭"}
        </button>
        <div className="media-transpose">
          <button
            type="button"
            onClick={() => void midiPlayer.setTranspose(snapshot.transpose - 1)}
            aria-label={translate(locale, "media.transposeDown")}
          >
            −
          </button>
          <strong>
            {snapshot.transpose > 0
              ? `+${snapshot.transpose}`
              : snapshot.transpose}
          </strong>
          <button
            type="button"
            onClick={() => void midiPlayer.setTranspose(snapshot.transpose + 1)}
            aria-label={translate(locale, "media.transposeUp")}
          >
            +
          </button>
        </div>
        <button
          className="media-control"
          type="button"
          onClick={openHymnLyrics}
          aria-label={translate(locale, "media.lyrics")}
          title={translate(locale, "media.lyrics")}
        >
          <Icon name="menuBook" size={16} />
        </button>
      </div>
      <div className="media-tempo-control">
        <button
          type="button"
          className="media-tempo-toggle"
          onClick={() => setTempoOpen((open) => !open)}
          aria-expanded={tempoOpen}
          aria-haspopup="dialog"
          aria-label={translate(locale, "media.tempoControl")}
          title={translate(locale, "media.tempoControl")}
        >
          <Icon name="tune" size={14} />
          <strong>{snapshot.tempo}</strong>
          <small>BPM</small>
        </button>
        {tempoOpen && (
          <div
            className="media-tempo-popover"
            role="dialog"
            aria-label={translate(locale, "media.tempoDialog")}
          >
            <input
              aria-label={translate(locale, "media.tempoInput")}
              type="range"
              min="30"
              max="220"
              step="1"
              value={snapshot.tempo}
              onChange={(event) =>
                void midiPlayer.setTempo(Number(event.target.value))
              }
            />
            <span>{snapshot.tempo} BPM</span>
          </div>
        )}
      </div>
      <label className="media-instrument-control">
        <span>{translate(locale, "media.instrument")}</span>
        <select
          aria-label={translate(locale, "media.instrumentMidi")}
          value={snapshot.instrument}
          onChange={(event) =>
            void midiPlayer
              .setInstrument(Number(event.target.value))
              .catch(() => undefined)
          }
        >
          <option value={-1}>{midiInstrumentLabel(-1)}</option>
          {GM_INSTRUMENTS.map((name, program) => (
            <option key={program} value={program}>
              {String(program + 1).padStart(3, "0")} · {name}
            </option>
          ))}
        </select>
      </label>
    </>
  );
  return (
    <aside
      className={`media-surface${minimized ? " is-minimized" : ""}${isKidungMedia ? " is-kidung-media" : ""}${speechActive ? " is-speech-media" : ""}${position ? " has-custom-position" : ""}${dragging ? " is-dragging" : ""}`}
      data-backend={
        speechActive
          ? (speechSnapshot.providerId ?? "speech")
          : snapshot.backend
      }
      style={
        position
          ? {
              left: position.left,
              top: position.top,
              right: "auto",
              bottom: "auto",
            }
          : undefined
      }
      aria-label={translate(locale, "shell.media")}
    >
      <div
        className="media-art media-drag-handle"
        title={translate(locale, "media.dragHandle")}
        aria-label={translate(locale, "media.dragHandle")}
        role="button"
        tabIndex={0}
        aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
        onPointerDown={beginDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={moveByKeyboard}
      >
        <Icon name={speechActive ? "bible" : "music"} size={19} />
      </div>
      {minimized && (
        <button
          className="media-mini-context"
          type="button"
          onClick={() => mediaPath && navigate(mediaPath)}
          disabled={!mediaPath}
          aria-label={translate(locale, "media.openSource", {
            title: mediaTitle ?? translate(locale, "media.source"),
          })}
        >
          <strong>{mediaTitle ?? translate(locale, "media.mediaGys")}</strong>
          <small>
            {speechActive
              ? `${Math.max(1, speechSnapshot.currentIndex + 1)}/${speechSnapshot.total}`
              : `${formatDuration(snapshot.position)} / ${formatDuration(snapshot.duration)}`}
          </small>
        </button>
      )}
      <div className="media-main">
        <div className="media-meta">
          {isKidungMedia ? (
            <div className="media-meta-top">
              <small>MIDI</small>
              <button
                className="media-queue-badge"
                type="button"
                onClick={() => navigate("/kidung?section=playlist")}
                aria-label={`${translate(locale, "media.queueOpen")}${playlist.items.length ? ` · ${translate(locale, "media.queueSongCount", { count: playlist.items.length })}` : ""}`}
                title={`${translate(locale, "media.queueTitle")}${playlist.items.length ? ` · ${playlist.items.length}` : ""}`}
              >
                <Icon name="queueMusic" size={14} />
                <span aria-hidden="true">{playlist.items.length}</span>
              </button>
            </div>
          ) : (
            <small>
              {speechActive
                ? `${speechProviderLabel}${speechSnapshot.activeLanguageTag ? ` · ${speechSnapshot.activeLanguageTag}` : ""}`
                : snapshot.status === "loading"
                  ? translate(locale, "media.loadingMidi", {
                      percent: snapshot.loadingProgress,
                    })
                  : snapshot.backend === "fluidsynth"
                    ? translate(locale, "media.soundfont", {
                        soundfont: snapshot.soundfont ?? "FluidSynth",
                      })
                    : translate(locale, "shell.media")}
              {!speechActive && playlist.items.length > 0
                ? ` · ${translate(locale, "media.queueCount", { count: playlist.items.length })}`
                : ""}
            </small>
          )}
          {mediaPath ? (
            <button
              className="media-context-link"
              type="button"
              onClick={() => navigate(mediaPath)}
              title={translate(locale, "media.openSource", {
                title: mediaTitle ?? translate(locale, "media.source"),
              })}
              aria-label={translate(locale, "media.openSource", {
                title: mediaTitle ?? translate(locale, "media.source"),
              })}
            >
              <strong>{mediaTitle}</strong>
            </button>
          ) : (
            <strong>{mediaTitle}</strong>
          )}
          {!isKidungMedia && (
            <span>
              {speechActive
                ? speechSnapshot.status === "error"
                  ? (speechSnapshot.error ??
                    translate(locale, "media.speechError"))
                  : speechSnapshot.currentIndex >= 0
                    ? translate(locale, "media.speechVerse", {
                        current: speechSnapshot.currentIndex + 1,
                        total: speechSnapshot.total,
                      })
                    : translate(locale, "media.speechReady")
                : `${formatDuration(snapshot.position)} / ${formatDuration(snapshot.duration)}`}
            </span>
          )}
          {!speechActive && !isKidungMedia && (
            <small className="media-autonext-subtitle">
              {autoNextSubtitle}
            </small>
          )}
        </div>
        {speechActive ? (
          <div
            className="speech-progress-track"
            aria-label={translate(locale, "media.speechProgress")}
          >
            <div
              className="speech-progress-fill"
              style={{
                width: `${Math.min(100, Math.max(0, ((speechSnapshot.currentIndex + 1) / Math.max(1, speechSnapshot.total)) * 100))}%`,
              }}
            />
          </div>
        ) : !isKidungMedia ? (
          <label className="media-progress">
            <span className="sr-only">
              {translate(locale, "media.positionMidi")}
            </span>
            <input
              type="range"
              min="0"
              max={Math.max(0.01, snapshot.duration)}
              step="0.1"
              value={Math.min(snapshot.duration, snapshot.position)}
              onChange={(event) =>
                void midiPlayer
                  .seek(Number(event.target.value))
                  .catch(() => undefined)
              }
            />
          </label>
        ) : null}
        {!minimized &&
          !isKidungMedia &&
          !speechActive &&
          playlist.items.length > 0 && (
            <div
              className="media-queue-controls"
              aria-label={translate(locale, "media.queueTitle")}
            >
              <button
                className="media-control"
                type="button"
                onClick={() =>
                  void playPreviousMidiPlaylistItem().catch(() => undefined)
                }
                aria-label={translate(locale, "media.previousSong")}
              >
                <Icon name="skipPrevious" size={17} />
              </button>
              <button
                className="media-control"
                type="button"
                onClick={() =>
                  void playNextMidiPlaylistItem().catch(() => undefined)
                }
                aria-label={translate(locale, "media.nextSong")}
              >
                <Icon name="skipNext" size={17} />
              </button>
            </div>
          )}
        {!minimized && (
          <div className="media-adjustments">
            <label className="media-volume-control">
              <span>{translate(locale, "media.volumeShort")}</span>
              <input
                aria-label={translate(
                  locale,
                  speechActive ? "media.volumeSpeech" : "media.volumeMidi",
                )}
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={speechActive ? speechSnapshot.volume : snapshot.volume}
                onChange={(event) =>
                  speechActive
                    ? speechPlayer.setVolume(Number(event.target.value))
                    : void midiPlayer.setVolume(Number(event.target.value))
                }
              />
            </label>
            {speechActive ? (
              <label className="media-speech-rate-control">
                <span>{translate(locale, "media.speed")}</span>
                <select
                  aria-label={translate(locale, "media.speedSpeech")}
                  value={speechSnapshot.rate}
                  onChange={(e) => speechPlayer.setRate(Number(e.target.value))}
                >
                  <option value={0.75}>0.75x</option>
                  <option value={0.9}>0.9x</option>
                  <option value={1.0}>1.0x</option>
                  <option value={1.25}>1.25x</option>
                  <option value={1.5}>1.5x</option>
                </select>
              </label>
            ) : (
              <>
                {!isKidungMedia && (
                  <div className="media-kicker" aria-hidden="true">
                    <span className="media-status-dot" />
                    <span>{translate(locale, "media.midiQueue")}</span>
                  </div>
                )}
                <div className="media-seek-time">
                  <span>{formatDuration(snapshot.position)}</span>
                  <span className="sr-only">
                    {translate(locale, "media.positionMidi")}
                  </span>
                  <input
                    aria-label={translate(locale, "media.positionMidi")}
                    type="range"
                    min="0"
                    max={Math.max(0.01, snapshot.duration)}
                    step="0.1"
                    value={Math.min(snapshot.duration, snapshot.position)}
                    onChange={(event) =>
                      void midiPlayer
                        .seek(Number(event.target.value))
                        .catch(() => undefined)
                    }
                  />
                  <span>{formatDuration(snapshot.duration)}</span>
                </div>
                {isKidungMedia ? (
                  <details className="media-advanced-controls">
                    <summary className="media-advanced-summary">
                      <span>{translate(locale, "media.advanced")}</span>
                      <small>
                        {chordKeyName(keyIndex, keyAccidental)} ·{" "}
                        {snapshot.tempo} BPM
                      </small>
                    </summary>
                    <div className="media-advanced-panel">
                      {midiAdvancedControls}
                    </div>
                  </details>
                ) : (
                  midiAdvancedControls
                )}
              </>
            )}
          </div>
        )}
      </div>
      {!minimized ? (
        <div
          className="media-transport-controls"
          aria-label={translate(
            locale,
            speechActive ? "media.controlsSpeech" : "media.controlsMidi",
          )}
        >
          <button
            className="media-control media-secondary-control media-previous-control"
            type="button"
            onClick={() =>
              speechActive
                ? void speechPlayer.previous().catch(() => undefined)
                : void playPreviousMidiPlaylistItem().catch(() => undefined)
            }
            aria-label={translate(
              locale,
              speechActive ? "media.previousVerse" : "media.previousSong",
            )}
            disabled={
              speechActive ? speechSnapshot.currentIndex <= 0 : !canPlayPrevious
            }
          >
            <Icon name="skipPrevious" size={17} />
          </button>
          <button
            className="media-control media-primary-control"
            type="button"
            onClick={togglePlayback}
            aria-label={
              playing
                ? translate(locale, "shell.pause")
                : translate(locale, "shell.play")
            }
          >
            <Icon name={playing ? "pause" : "play"} size={18} />
          </button>
          <button
            className="media-control media-secondary-control media-next-control"
            type="button"
            onClick={() =>
              speechActive
                ? void speechPlayer.next().catch(() => undefined)
                : void playNextMidiPlaylistItem().catch(() => undefined)
            }
            aria-label={translate(
              locale,
              speechActive ? "media.nextVerse" : "media.nextSong",
            )}
            disabled={
              speechActive
                ? speechSnapshot.currentIndex < 0 ||
                  speechSnapshot.currentIndex >= speechSnapshot.total - 1
                : !canPlayNext
            }
          >
            <Icon name="skipNext" size={17} />
          </button>
        </div>
      ) : (
        <button
          className="media-control"
          type="button"
          onClick={togglePlayback}
          aria-label={
            playing
              ? translate(locale, "shell.pause")
              : translate(locale, "shell.play")
          }
        >
          <Icon name={playing ? "pause" : "play"} size={18} />
        </button>
      )}
      {!minimized && (
        <>
          <button
            className="media-control media-secondary-control media-stop-control"
            type="button"
            onClick={() =>
              void (speechActive ? speechPlayer.stop() : midiPlayer.stop())
            }
            aria-label={translate(
              locale,
              speechActive ? "media.stopSpeech" : "media.stopMidi",
            )}
          >
            <Icon name="stop" size={16} />
          </button>
          <button
            className="media-control media-secondary-control media-mute-control"
            type="button"
            onClick={() =>
              speechActive
                ? speechPlayer.setVolume(speechSnapshot.volume > 0 ? 0 : 1)
                : midiPlayer.setMuted(!snapshot.muted)
            }
            aria-label={
              speechActive
                ? speechSnapshot.volume > 0
                  ? translate(locale, "media.muteSpeech")
                  : translate(locale, "media.unmuteSpeech")
                : snapshot.muted
                  ? translate(locale, "media.unmuteMidi")
                  : translate(locale, "media.muteMidi")
            }
            aria-pressed={
              speechActive ? speechSnapshot.volume === 0 : snapshot.muted
            }
          >
            <Icon
              name={
                speechActive
                  ? speechSnapshot.volume === 0
                    ? "volumeOff"
                    : "volume"
                  : snapshot.muted
                    ? "volumeOff"
                    : "volume"
              }
              size={16}
            />
          </button>
        </>
      )}
      {speechActive && !minimized && (
        <button
          className="media-minimize media-close-button"
          type="button"
          onClick={() => speechPlayer.togglePlayer(false)}
          aria-label={translate(locale, "media.closePlayer")}
          title={translate(locale, "media.closePlayerTitle")}
        >
          <Icon name="cross" size={16} />
        </button>
      )}
      <button
        className="media-minimize"
        type="button"
        onClick={() => setMinimized((value) => !value)}
        aria-label={translate(
          locale,
          minimized ? "media.restore" : "media.minimize",
        )}
      >
        <Icon name={minimized ? "chevronUp" : "chevronDown"} size={16} />
      </button>
    </aside>
  );
}

function formatDuration(value: number): string {
  const seconds = Math.max(0, Math.floor(value));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function Shell({
  locale,
  setLocale,
  theme,
  setTheme,
}: ReturnType<typeof useAppSettings>) {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>
    readSidebarCollapsed(
      typeof window === "undefined" ? undefined : window.localStorage,
    ),
  );
  useEffect(() => {
    writeSidebarCollapsed(
      typeof window === "undefined" ? undefined : window.localStorage,
      sidebarCollapsed,
    );
  }, [sidebarCollapsed]);
  const location = useLocation();
  const isReaderRoute =
    location.pathname === "/bible" ||
    location.pathname === "/kidung" ||
    location.pathname.startsWith("/kidung/");
  const midiSnapshot = useSyncExternalStore(
    midiPlayer.subscribe,
    midiPlayer.snapshot,
  );
  const speechSnapshot = useSyncExternalStore(
    speechPlayer.subscribe,
    speechPlayer.snapshot,
  );
  const isAudioPlaying =
    midiSnapshot.status === "playing" || speechSnapshot.status === "speaking";
  useScreenWakeLock(location.pathname, isAudioPlaying);

  const openSearch = useCallback(() => setSearchOpen(true), []);
  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    window.requestAnimationFrame(() =>
      searchTriggerRef.current?.focus({ preventScroll: true }),
    );
  }, []);
  const focusPageSearch = useCallback(() => {
    const selector =
      location.pathname === "/bible"
        ? "#bible-query"
        : ".hymn-page .hymn-catalog-controls input";
    const input = document.querySelector<HTMLInputElement>(selector);
    if (!input) return;
    input.scrollIntoView({ behavior: "smooth", block: "center" });
    input.focus({ preventScroll: true });
  }, [location.pathname]);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (
        event.key === "/" &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(
          (event.target as HTMLElement | null)?.tagName ?? "",
        )
      ) {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);
  return (
    <div className={`app-frame${isReaderRoute ? " is-reader-route" : ""}`}>
      <a className="skip-link" href="#main-content">
        {translate(locale, "shell.skipContent")}
      </a>
      <Header
        {...{ locale, setLocale, theme, setTheme, online }}
        onOpenSearch={openSearch}
        searchTriggerRef={searchTriggerRef}
        pathname={location.pathname}
        onFocusPageSearch={focusPageSearch}
      />
      <div
        className={`workspace${sidebarCollapsed ? " is-sidebar-collapsed" : ""}`}
      >
        <aside className="navigation-shell">
          <button
            className="sidebar-collapse-toggle"
            type="button"
            onClick={() => setSidebarCollapsed((current) => !current)}
            aria-expanded={!sidebarCollapsed}
            aria-label={
              sidebarCollapsed
                ? translate(locale, "shell.expandNavigation")
                : translate(locale, "shell.collapseNavigation")
            }
            title={
              sidebarCollapsed
                ? translate(locale, "shell.expandNavigation")
                : translate(locale, "shell.collapseNavigation")
            }
          >
            <Icon
              name={sidebarCollapsed ? "chevronRight" : "chevronLeft"}
              size={15}
            />
          </button>
          <Navigation locale={locale} />
        </aside>
        <main className="main-content" id="main-content" tabIndex={-1}>
          <div
            className="route-view"
            key={`${location.pathname}${location.search}`}
          >
            <RouteErrorBoundary locale={locale}>
              <Suspense
                fallback={
                  isReaderRoute ? (
                    <div
                      className="reader-route-loading route-loading"
                      role="status"
                      aria-live="polite"
                      aria-busy="true"
                    >
                      <span className="reader-route-loading-label">
                        {translate(locale, "bible.routeLoading", {
                          title: translate(
                            locale,
                            location.pathname === "/bible"
                              ? "page.bibleTitle"
                              : "page.kidungTitle",
                          ),
                        })}
                      </span>
                      <div
                        className="reader-route-loading-toolbar"
                        aria-hidden="true"
                      >
                        <span className="reader-route-loading-control is-wide" />
                        <span className="reader-route-loading-control" />
                        <span className="reader-route-loading-control" />
                      </div>
                      <div
                        className="reader-route-loading-surface"
                        aria-hidden="true"
                      >
                        <div className="reader-route-loading-pane">
                          <span className="reader-route-loading-line is-kicker" />
                          <span className="reader-route-loading-line is-title" />
                          <span className="reader-route-loading-line" />
                          <span className="reader-route-loading-line is-short" />
                          <span className="reader-route-loading-line" />
                          <span className="reader-route-loading-line is-medium" />
                        </div>
                        <div className="reader-route-loading-pane">
                          <span className="reader-route-loading-line is-kicker" />
                          <span className="reader-route-loading-line is-title" />
                          <span className="reader-route-loading-line" />
                          <span className="reader-route-loading-line is-short" />
                          <span className="reader-route-loading-line" />
                          <span className="reader-route-loading-line is-medium" />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <NonReaderRouteLoading
                      locale={locale}
                      pathname={location.pathname}
                    />
                  )
                }
              >
                <Outlet
                  context={{
                    locale,
                    theme,
                    setLocale,
                    setTheme,
                  }}
                />
              </Suspense>
            </RouteErrorBoundary>
          </div>
        </main>
      </div>
      <MediaSurface locale={locale} />
      {searchOpen ? (
        <Suspense fallback={null}>
          <GlobalSearch
            locale={locale}
            open
            onClose={closeSearch}
            returnFocusRef={searchTriggerRef}
          />
        </Suspense>
      ) : null}
      <UiPreferencesPanel locale={locale} />
    </div>
  );
}

function SauhSkeleton({ locale }: { locale: Locale }) {
  return (
    <div
      className="sauh-skeleton"
      role="status"
      aria-live="polite"
      data-testid="home-sauh-skeleton"
    >
      <span className="sauh-skeleton-spinner" aria-hidden="true" />
      <span className="sauh-skeleton-loading-text">
        {translate(locale, "home.loadingSauh")}
      </span>
    </div>
  );
}

function HomePage({ locale }: { locale: Locale }) {
  const [sauh, setSauh] = useState<Awaited<ReturnType<typeof fetchSauh>>>(
    () => {
      const cached = getCachedSauh();
      return cached ? selectTodaySauh(cached) : [];
    },
  );
  const [suara, setSuara] = useState<Awaited<ReturnType<typeof fetchSuara>>>(
    () => {
      return getCachedSuara() ?? [];
    },
  );
  const [sauhStatus, setSauhStatus] = useState<"loading" | "ready" | "error">(
    () => (sauh.length ? "ready" : "loading"),
  );
  const [suaraStatus, setSuaraStatus] = useState<"loading" | "ready" | "error">(
    () => {
      const cached = getCachedSuara();
      return cached && cached.length ? "ready" : "loading";
    },
  );
  const [activity, setActivity] = useState<ActivityState>(() => getActivity());
  useEffect(() => subscribeActivity(() => setActivity(getActivity())), []);
  useEffect(
    () =>
      subscribeSauh((items) => {
        const todays = selectTodaySauh(items);
        setSauh(todays);
        setSauhStatus(todays.length > 0 ? "ready" : "error");
      }),
    [],
  );
  // Suara Sejati & Literatur refresh incrementally: cached lists stay
  // painted while upstream additions are merged in place.
  useEffect(
    () =>
      subscribeSuara((posts) => {
        if (!posts.length) return;
        setSuara(posts);
        setSuaraStatus("ready");
      }),
    [],
  );
  useEffect(
    () =>
      subscribeLiterature((items) => {
        if (!items.length) return;
        setLiterature(items);
        setLiteratureStatus("ready");
      }),
    [],
  );
  const hasActivity = Boolean(activity.bible || activity.hymn);
  // An outdated snapshot must not trigger an endless revalidation loop
  // (forced re-fetch -> setSauh -> effect -> fetch again): throttle at most
  // one network re-check per minute.
  const lastForcedSauhAtRef = useRef(0);
  const refreshTodaySauh = useCallback(() => {
    const now = Date.now();
    if (now - lastForcedSauhAtRef.current < 60_000) return;
    lastForcedSauhAtRef.current = now;
    void fetchSauh(undefined, true)
      .then((items) => {
        if (items.length) setSauh(items);
      })
      .catch(() => undefined);
  }, []);
  const loadSauh = useCallback((signal?: AbortSignal) => {
    const cached = getCachedSauh();
    if (!cached || !selectTodaySauh(cached).length) {
      setSauh([]);
      setSauhStatus("loading");
    }
    void fetchSauh(signal)
      .then((items) => {
        if (signal?.aborted) return;
        const todays = selectTodaySauh(items);
        setSauh(todays);
        setSauhStatus(todays.length > 0 ? "ready" : "error");
      })
      .catch(() => {
        if (!signal?.aborted) setSauhStatus("error");
      });
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    loadSauh(controller.signal);
    return () => controller.abort();
  }, [loadSauh]);
  const loadSuara = useCallback((signal?: AbortSignal) => {
    const cached = getCachedSuara();
    if (!cached || !cached.length) setSuaraStatus("loading");
    void (async () => {
      let displayedSnapshot = false;
      try {
        const snapshot = await fetchSuaraSnapshot(signal);
        if (signal?.aborted) return;
        if (snapshot.length) {
          displayedSnapshot = true;
          setSuara(snapshot);
          setSuaraStatus("ready");
        }
      } catch {
        // Live content below remains the recovery path when the snapshot fails.
      }
      try {
        const items = await fetchSuara(signal);
        if (signal?.aborted) return;
        setSuara(items);
        setSuaraStatus(items.length > 0 ? "ready" : "error");
      } catch {
        if (!signal?.aborted && !displayedSnapshot) setSuaraStatus("error");
      }
    })();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    loadSuara(controller.signal);
    return () => controller.abort();
  }, [loadSuara]);

  const [literature, setLiterature] = useState<LiteratureItem[]>([]);
  const [literatureStatus, setLiteratureStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");

  const loadLiterature = useCallback((signal?: AbortSignal) => {
    setLiteratureStatus("loading");
    void fetchLiteratureCatalog(signal)
      .then((items) => {
        if (signal?.aborted) return;
        setLiterature(items);
        setLiteratureStatus(items.length > 0 ? "ready" : "error");
      })
      .catch((error: unknown) => {
        if (signal?.aborted) return;
        recordDiagnostic("warn", "home.literature", error);
        setLiteratureStatus("error");
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadLiterature(controller.signal);
    return () => controller.abort();
  }, [loadLiterature]);

  useEffect(() => {
    const selected = sauh[0];
    const isToday = Boolean(selected && selectTodaySauh([selected]).length);
    if (sauhStatus === "ready" && !isToday && navigator.onLine) {
      refreshTodaySauh();
    }
  }, [sauh, sauhStatus, refreshTodaySauh]);

  useEffect(() => {
    const checkFreshness = () => {
      const selected = sauh[0];
      const isToday = Boolean(selected && selectTodaySauh([selected]).length);
      if (!isToday && navigator.onLine) {
        refreshTodaySauh();
      }
    };
    window.addEventListener("focus", checkFreshness);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") checkFreshness();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", checkFreshness);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [sauh, refreshTodaySauh]);
  const selected = sauh[0];
  const selectedToday = selectTodaySauh(sauh)[0];
  const dailyText = selectedToday
    ? (selectedToday.verse ?? selectedToday.body)
    : "";
  const today = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
  return (
    <div className="page home-page">
      <section className="page-intro">
        <div>
          <p className="date-line">{today}</p>
          <h1>{translate(locale, "home.title")}</h1>
        </div>
      </section>
      <section
        className="home-grid"
        aria-label={translate(locale, "home.overview")}
      >
        <article className="verse-panel">
          {selectedToday && (
            <div className="sauh-card-media">
              <LazyImage
                className="sauh-image"
                wrapperClassName="sauh-image-wrap"
                src={selectedToday.imageUrl}
                fallbackTitle={selectedToday.title}
                fallbackCategory="renungan"
                alt={translate(locale, "home.illustrationAlt", {
                  title: selectedToday.title,
                })}
                loading="eager"
                fetchPriority="high"
              />
              <div className="sauh-media-overlay" />
            </div>
          )}
          <div className="sauh-card-content">
            <div className="section-heading">
              <span>{translate(locale, "home.sauh")}</span>
              <small>
                {selectedToday
                  ? (selectedToday.reference ??
                    translate(locale, "home.sauhNoReference"))
                  : translate(locale, "home.directSource")}
              </small>
            </div>
            {!selectedToday && sauhStatus !== "error" && (
              <SauhSkeleton locale={locale} />
            )}
            {sauhStatus === "error" && !selectedToday && (
              <div className="sauh-offline-state">
                <strong>{translate(locale, "home.sauhUnavailable")}</strong>
                <small>{translate(locale, "home.sauhOfflineHint")}</small>
                <button
                  className="quiet-button"
                  type="button"
                  onClick={() => loadSauh()}
                >
                  {translate(locale, "home.sauhRetry")}
                </button>
              </div>
            )}
            {selectedToday && sauhStatus !== "error" && (
              <div className="sauh-card-body">
                <p className="sauh-title">{selectedToday.title}</p>
                <blockquote>“{dailyText}”</blockquote>
              </div>
            )}
            {selected && (
              <div className="verse-actions">
                <Link className="quiet-button" to="/sauh">
                  {translate(locale, "home.readMore")}
                </Link>
              </div>
            )}
          </div>
        </article>
        <article className="continue-panel">
          <div className="section-heading">
            <span>{translate(locale, "home.continue")}</span>
          </div>
          {hasActivity ? (
            <div className="continue-grid">
              {activity.bible && (
                <Link className="continue-item" to="/bible">
                  <div className="item-icon">
                    <Icon name="book" size={20} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <strong>
                      {activity.bible.book} {activity.bible.chapter}
                    </strong>
                    <span>{translate(locale, "home.bibleVersion")}</span>
                  </div>
                  <Icon name="arrow" size={16} />
                </Link>
              )}
              {activity.hymn && (
                <Link
                  className="continue-item"
                  to={`/kidung/${activity.hymn.id}`}
                >
                  <div className="item-icon music-icon">
                    <Icon name="music" size={20} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <strong>{activity.hymn.title}</strong>
                    <span>
                      {translate(locale, "home.hymnLabel")} ·{" "}
                      {String(activity.hymn.number).padStart(3, "0")}
                    </span>
                  </div>
                  <Icon name="arrow" size={16} />
                </Link>
              )}
            </div>
          ) : (
            <div className="empty-inline">
              <p>{translate(locale, "home.noRecent")}</p>
            </div>
          )}
        </article>
        <section
          className="home-media-section home-suara-section"
          aria-labelledby="home-suara-heading"
        >
          <div className="section-title-row">
            <div>
              <p className="date-line">{translate(locale, "home.testimony")}</p>
              <h2 id="home-suara-heading">Suara Sejati</h2>
            </div>
            <Link className="text-button" to="/suara">
              {translate(locale, "home.viewAll")}
            </Link>
          </div>
          {suaraStatus === "loading" && (
            <div className="loading-panel" role="status">
              {translate(locale, "home.loadingSuara")}
            </div>
          )}
          {suaraStatus === "error" && (
            <div className="error-panel" role="alert">
              <strong>{translate(locale, "home.suaraUnavailable")}</strong>
              <button
                className="quiet-button"
                type="button"
                onClick={() => loadSuara()}
              >
                {translate(locale, "home.retry")}
              </button>
            </div>
          )}
          {suaraStatus === "ready" && (
            <div className="home-suara-shelf">
              {suara.slice(0, 8).map((post, index) => (
                <Link
                  className="suara-library-item"
                  key={post.id}
                  to={`/suara/${encodeURIComponent(post.id)}`}
                >
                  <div className="suara-card-media">
                    <LazyImage
                      className="suara-thumb-img"
                      wrapperClassName="suara-library-thumb"
                      src={post.imageUrl}
                      fallbackTitle={post.title}
                      fallbackCategory="kesaksian"
                      alt={translate(locale, "home.coverAlt", {
                        title: post.title,
                      })}
                      loading={index < 3 ? "eager" : "lazy"}
                      fetchPriority={index === 0 ? "high" : "auto"}
                    />
                    <div className="suara-media-overlay" />
                  </div>
                  <div className="suara-card-content">
                    <span className="suara-date">
                      {new Date(post.publishedAt).toLocaleDateString(locale, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                    <strong>{post.title}</strong>
                    <small>{post.excerpt}</small>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
        <section
          className="home-media-section home-literature-section"
          aria-labelledby="home-literature-heading"
        >
          <div className="section-title-row">
            <div>
              <p className="date-line">{translate(locale, "home.reading")}</p>
              <h2 id="home-literature-heading">
                {translate(locale, "home.literature")}
              </h2>
            </div>
            <Link className="text-button" to="/literatur">
              {translate(locale, "home.viewAll")}
            </Link>
          </div>
          {literatureStatus === "loading" && (
            <div className="loading-panel" role="status">
              {translate(locale, "home.loadingLiterature")}
            </div>
          )}
          {literatureStatus === "error" && (
            <div className="error-panel" role="alert">
              <strong>{translate(locale, "home.literatureUnavailable")}</strong>
              <button
                className="quiet-button"
                type="button"
                onClick={() => loadLiterature()}
              >
                {translate(locale, "home.retry")}
              </button>
            </div>
          )}
          {literatureStatus === "ready" && (
            <div className="home-suara-shelf home-literature-shelf">
              {literature.slice(0, 8).map((item, index) => (
                <Link
                  className="suara-library-item"
                  key={item.id}
                  to={`/literatur/${encodeURIComponent(item.id)}${item.format === "pdf" || item.format === "issue" ? "?read=1" : ""}`}
                >
                  <div className="suara-card-media">
                    <LazyImage
                      className="suara-thumb-img"
                      wrapperClassName="suara-library-thumb"
                      src={item.imageUrl}
                      fallbackTitle={item.title}
                      fallbackCategory={item.category}
                      alt={translate(locale, "home.coverAlt", {
                        title: item.title,
                      })}
                      loading={index < 3 ? "eager" : "lazy"}
                      fetchPriority={index === 0 ? "high" : "auto"}
                    />
                    <div className="suara-media-overlay" />
                  </div>
                  <div className="suara-card-content">
                    <span className="suara-date">
                      {literatureCategoryLabels[item.category] ?? item.category}{" "}
                      ·{" "}
                      {item.publishedAt
                        ? new Date(item.publishedAt).toLocaleDateString(
                            locale,
                            {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            },
                          )
                        : translate(locale, "home.archiveTjc")}
                    </span>
                    <strong>{item.title}</strong>
                    {item.description ? (
                      <small>{item.description}</small>
                    ) : (
                      <small>{item.format.toUpperCase()} · TJC Indonesia</small>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </section>
    </div>
  );
}

function RoutedApp() {
  if (
    navigator.webdriver &&
    new URLSearchParams(window.location.search).get("__gys_shell_error") === "1"
  ) {
    throw new Error("Injected shell render error for E2E recovery coverage");
  }
  const settings = useAppSettings();
  const locale = settings.locale;
  useEffect(() => installMidiQueueCoordinator(), []);
  useEffect(() => installMediaSessionBridge(), []);
  useEffect(() => installHeadphoneDisconnectGuard(), []);
  return (
    <Routes>
      <Route element={<Shell {...settings} />}>
        <Route path="/" element={<HomePage locale={locale} />} />
        <Route path="/sauh" element={<SauhPage locale={locale} />} />
        <Route path="/suara" element={<SuaraPage locale={locale} />} />
        <Route
          path="/suara/:postId"
          element={<SuaraDetailPage locale={locale} />}
        />
        <Route path="/bible" element={<BiblePage locale={locale} />} />
        <Route path="/kidung" element={<KidungPage locale={locale} />} />
        <Route
          path="/kidung/:songId"
          element={<KidungPage locale={locale} />}
        />
        <Route path="/iman" element={<FaithPage locale={locale} />} />
        <Route path="/literatur" element={<LiteraturePage locale={locale} />} />
        <Route
          path="/literatur/:itemId"
          element={<LiteratureDetailPage locale={locale} />}
        />
        <Route
          path="/lainnya"
          element={
            <MorePage
              locale={locale}
              theme={settings.theme}
              setLocale={settings.setLocale}
              setTheme={settings.setTheme}
            />
          }
        />
        <Route path="/more" element={<Navigate to="/lainnya" replace />} />
        <Route path="*" element={<NotFoundPage locale={locale} />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <RoutedApp />
      </BrowserRouter>
    </AppErrorBoundary>
  );
}
