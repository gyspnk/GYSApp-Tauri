import {
  HomePage,
  BiblePage,
  BibleHeader,
  KidungPage,
  FaithPage,
  MorePage,
  LiteraturePage,
  LiteratureDetailPage,
  SauhPage,
  SuaraPage,
  SuaraDetailPage,
} from "./route-pages.js";
import {
  NonReaderRouteLoading,
  NotFoundPage,
  RouteErrorBoundary,
} from "./route-frames.js";
import { useReadinessMarker } from "./readiness.js";
import { useMenuPresence } from "./use-menu-presence.js";
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
  useNavigate,
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
import { getShellSettingsStorage } from "./settings.js";
import {
  readShellSettings,
  writeShellSettings,
  type ShellTheme,
} from "./settings.js";
import { Icon } from "./icons.js";
import { AccountAvatar } from "./account-avatar.js";
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

function useAppSettings() {
  const storage = getShellSettingsStorage();
  const [settings, setSettings] = useState(() => readShellSettings(storage));
  useEffect(() => {
    writeShellSettings(settings, storage);
    document.documentElement.lang = settings.locale;
  }, [settings, storage]);
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);
  const setLocale = useCallback((locale: Locale) => {
    setSettings((current) => ({ ...current, locale }));
  }, []);
  const setTheme = useCallback((theme: Theme) => {
    const update = () => setSettings((current) => ({ ...current, theme }));
    void import("./theme-transition.js")
      .then((module) => module.transitionTheme(update))
      .catch(update);
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
  useEffect(() => {
    let cancelled = false;
    void import("./route-preload.js")
      .then((module) => {
        if (!cancelled) module.warmNavigation();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
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
    // Desktop selection is painted by the link; skip measurements as its
    // sidebar width animates. The indicator is used on smaller screens.
    if (window.matchMedia("(min-width: 960px)").matches) return;
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
      {DESTINATIONS.map((destination) => {
        const label = translate(locale, destination.labelKey);
        const preload = () =>
          void import("./route-preload.js")
            .then((module) => module.preloadRoute(destination.path))
            .catch(() => undefined);
        return (
          <NavLink
            key={destination.path}
            ref={(el) => {
              if (el) itemsRef.current.set(destination.path, el);
              else itemsRef.current.delete(destination.path);
            }}
            onPointerEnter={preload}
            onFocus={preload}
            to={destination.path}
            end={destination.path === "/"}
            className={({ isActive }) =>
              `nav-item${isActive ? " is-active" : ""}`
            }
            aria-label={label}
            title={label}
            data-nav-label={label}
          >
            <Icon name={destination.icon} />
            <span className="nav-copy">
              <strong>{label}</strong>
            </span>
          </NavLink>
        );
      })}
    </nav>
  );
}

function Header({
  locale,
  setLocale,
  theme,
  setTheme,
  onOpenSearch,
  searchTriggerRef,
  pathname,
  onFocusPageSearch,
}: {
  locale: Locale;
  setLocale: (value: Locale) => void;
  theme: Theme;
  setTheme: (value: Theme) => void;
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
        <Select
          value={locale}
          onChange={setLocale}
          className="topbar-select language-select"
          animated
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
          <AccountAvatar />
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
  useReadinessMarker("gys-shell-ready");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchLayerRef = useRef<HTMLDivElement>(null);
  const searchPresent = useMenuPresence(searchOpen, searchLayerRef);
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
        {...{ locale, setLocale, theme, setTheme }}
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
          <div className="sidebar-media-anchor" aria-hidden="true" />
        </aside>
        <main className="main-content" id="main-content" tabIndex={-1}>
          <div
            className="route-view"
            key={
              /^\/kidung\/[^/]+$/.test(location.pathname)
                ? location.pathname
                : `${location.pathname}${location.search}`
            }
          >
            <RouteErrorBoundary locale={locale}>
              <Suspense
                fallback={
                  <NonReaderRouteLoading
                    pathname={location.pathname}
                    locale={locale}
                  />
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
      {searchPresent ? (
        <Suspense fallback={null}>
          <GlobalSearch
            locale={locale}
            open={searchOpen}
            layerRef={searchLayerRef}
            onClose={closeSearch}
            returnFocusRef={searchTriggerRef}
          />
        </Suspense>
      ) : null}
    </div>
  );
}

function RoutedApp() {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  useLayoutEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);
  useEffect(() => {
    let active = true;
    let dispose: (() => void) | undefined;
    void import("./route-transitions.js")
      .then((module) => {
        if (active)
          dispose = module.installRouteTransitions((path) =>
            navigateRef.current(path),
          );
      })
      .catch(() => undefined);
    return () => {
      active = false;
      dispose?.();
    };
  }, []);
  if (
    navigator.webdriver &&
    new URLSearchParams(window.location.search).get("__gys_shell_error") === "1"
  ) {
    throw new Error("Injected shell render error for E2E recovery coverage");
  }
  const settings = useAppSettings();
  const locale = settings.locale;
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void import("./chords.js")
        .then((module) => module.syncChordsOnStartup())
        .catch((error) => recordDiagnostic("info", "chord.sync", error));
    }, 500);
    return () => window.clearTimeout(timer);
  }, []);
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
