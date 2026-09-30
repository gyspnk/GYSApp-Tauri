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
  useLocation,
} from "react-router-dom";
import { DESTINATIONS, type Destination } from "./navigation.js";
import { translate, type Locale } from "./i18n.js";
import { SpeechEnginePreferenceSchema } from "@gys/contracts";
import { midiPlayer } from "./midi-player.js";
import {
  installMidiQueueCoordinator,
  playMidiPlaylistItem,
} from "./midi-queue.js";
import { installMediaSessionBridge } from "./media-session.js";
import { speechPlayer } from "./speech-player.js";
import {
  getCustomEdgeEndpoint,
  isEdgeSpeechConfigured,
  setCustomEdgeEndpoint,
} from "./edge-speech.js";
import { getMidiPlaylist, subscribeMidiPlaylist } from "./midi-playlist.js";
import { Select } from "./select.js";
import { recordDiagnostic } from "./diagnostics.js";
import { GM_INSTRUMENTS, midiInstrumentLabel } from "./midi-instruments.js";
import { installHeadphoneDisconnectGuard } from "./headphone-guard.js";
import { useScreenWakeLock } from "./wake-lock.js";
import { getShellSettingsStorage } from "./platform.js";
import {
  readShellSettings,
  writeShellSettings,
  type ShellTheme,
} from "./settings.js";
import { Icon } from "./icons.js";
import { useBibleHeaderState } from "./bible-header-store.js";
import {
  readSidebarCollapsed,
  writeSidebarCollapsed,
} from "./shell-preferences.js";

const MediaSurface = lazy(() =>
  import("./media-surface.js").then(({ MediaSurface: Surface }) => ({
    default: Surface,
  })),
);

function subscribeMediaSession(listener: () => void): () => void {
  const unsubscribeMidi = midiPlayer.subscribe(listener);
  const unsubscribeSpeech = speechPlayer.subscribe(listener);
  return () => {
    unsubscribeMidi();
    unsubscribeSpeech();
  };
}

function hasMediaSession(): boolean {
  const midi = midiPlayer.snapshot();
  const speech = speechPlayer.snapshot();
  return Boolean(
    (midi.songId && midi.status !== "idle") ||
    (speech.total > 0 && speech.status !== "idle") ||
    speech.playerOpen,
  );
}

const HomePage = lazy(() =>
  import("./home.js").then(({ HomePage: Page }) => ({ default: Page })),
);
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
  const location = useLocation();
  const bibleHeader = useBibleHeaderState();
  const [hamburgerOpen, setHamburgerOpen] = useState(false);
  const hamburgerRef = useRef<HTMLDivElement>(null);
  const shouldOpenAudioSettings =
    isBibleRoute &&
    new URLSearchParams(location.search).get("settings") === "audio";

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

  useEffect(() => {
    if (shouldOpenAudioSettings && bibleHeader) setHamburgerOpen(true);
  }, [bibleHeader, shouldOpenAudioSettings]);

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
                <button
                  className={`reader-context-button reader-search-btn${bibleHeader.searchOpen ? " is-active" : ""}`}
                  type="button"
                  aria-expanded={bibleHeader.searchOpen}
                  aria-controls="bible-search-form"
                  aria-label={translate(locale, "bible.searchVerses")}
                  title={translate(locale, "bible.searchVerses")}
                  onClick={bibleHeader.onToggleSearch}
                >
                  <Icon name="search" size={15} />
                </button>
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
                          <div className="hamburger-section">
                            <div className="hamburger-group">
                              <button
                                className="hamburger-item"
                                type="button"
                                onClick={() => {
                                  bibleHeader.onOpenNotes();
                                  setHamburgerOpen(false);
                                }}
                              >
                                <div className="hamburger-item-icon">
                                  <Icon name="bookmark" size={16} />
                                </div>
                                <div className="hamburger-item-text">
                                  <strong>
                                    {translate(locale, "bible.notes")}
                                  </strong>
                                </div>
                              </button>
                            </div>
                          </div>

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
                                    <option value="auto">
                                      {translate(locale, "bible.autoTts")}
                                    </option>
                                    <option
                                      value="edge"
                                      disabled={!isEdgeSpeechConfigured()}
                                    >
                                      {translate(locale, "bible.edgeOnlineTts")}
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
                                  {speechSnapshot.engine !== "local" &&
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
                    disabled={isBibleRoute && !bibleHeader?.active}
                    onClick={
                      isBibleRoute && bibleHeader?.active
                        ? bibleHeader.onFocusSearch
                        : onFocusPageSearch
                    }
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
  const midiStatus = useSyncExternalStore(
    midiPlayer.subscribe,
    () => midiPlayer.snapshot().status,
  );
  const isMidiPlaying = midiStatus === "playing";
  const mediaVisible = useSyncExternalStore(subscribeMediaSession, hasMediaSession);
  const previousMidiStatusRef = useRef(midiStatus);
  useEffect(() => {
    const previousStatus = previousMidiStatusRef.current;
    previousMidiStatusRef.current = midiStatus;
    if (
      previousStatus !== midiStatus &&
      (midiStatus === "loading" || midiStatus === "playing")
    ) {
      void speechPlayer.pause().catch(() => undefined);
    }
  }, [midiStatus]);

  const isSpeaking = useSyncExternalStore(
    speechPlayer.subscribe,
    () => speechPlayer.snapshot().status === "speaking",
  );
  const isAudioPlaying = isMidiPlaying || isSpeaking;
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
      {mediaVisible && (
        <Suspense fallback={null}>
          <MediaSurface locale={locale} />
        </Suspense>
      )}
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
