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
import { midiPlayer } from "./midi-player.js";
import { installMidiQueueCoordinator } from "./midi-queue.js";
import { installMediaSessionBridge } from "./media-session.js";
import { speechPlayer } from "./speech-player.js";
import { Select } from "./select.js";
import { recordDiagnostic } from "./diagnostics.js";
import { installHeadphoneDisconnectGuard } from "./headphone-guard.js";
import { useScreenWakeLock } from "./wake-lock.js";
import { getShellSettingsStorage } from "./platform.js";
import {
  readShellSettings,
  writeShellSettings,
  type ShellTheme,
} from "./settings.js";
import { Icon } from "./icons.js";
import {
  readSidebarCollapsed,
  writeSidebarCollapsed,
} from "./shell-preferences.js";

const BibleHeader = lazy(() =>
  import("./bible-header.js").then(({ BibleHeader: Header }) => ({
    default: Header,
  })),
);

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
  if (pathname === "/bible") {
    return (
      <Suspense
        fallback={
          <header className="topbar is-reader-context" role="status">
            {translate(locale, "bible.reading")}
          </header>
        }
      >
        <BibleHeader
          {...{
            locale,
            setLocale,
            theme,
            setTheme,
            online,
            onOpenSearch,
            searchTriggerRef,
            pathname,
            onFocusPageSearch,
          }}
        />
      </Suspense>
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
  const mediaVisible = useSyncExternalStore(
    subscribeMediaSession,
    hasMediaSession,
  );
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
