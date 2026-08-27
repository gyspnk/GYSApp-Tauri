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
  type ReactNode,
} from "react";
import {
  BrowserRouter,
  Link,
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
  isTodaySauhAvailable,
  selectTodaySauh,
  subscribeSauh,
} from "./sauh.js";
import { fetchSuara, fetchSuaraSnapshot, getCachedSuara } from "./suara.js";
import {
  fetchLiteratureCatalog,
  literatureCategoryLabels,
} from "./literature-catalog.js";
import {
  SpeechEnginePreferenceSchema,
  type LiteratureItem,
} from "@gys/contracts";
import { LazyImage } from "./lazy-image.js";
import { midiPlayer } from "./midi-player.js";
import {
  installMidiQueueCoordinator,
  playNextMidiPlaylistItem,
  playPreviousMidiPlaylistItem,
} from "./midi-queue.js";
import { installMediaSessionBridge } from "./media-session.js";
import { speechPlayer } from "./speech-player.js";
import { getCustomEdgeEndpoint, setCustomEdgeEndpoint } from "./edge-speech.js";
import { getMidiPlaylist, subscribeMidiPlaylist } from "./midi-playlist.js";
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
import { useBibleHeaderState } from "./bible-header-store.js";

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
        <main className="error-state">
          <div className="feature-mark">
            <Icon name="book" size={27} />
          </div>
          <h1>Ruang ini perlu dimuat ulang</h1>
          <p>Konten lokal tetap aman. Muat ulang untuk memulihkan tampilan.</p>
          <button
            className="primary-button"
            type="button"
            onClick={() => void handleHardRefresh()}
          >
            Muat ulang
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
  pathname,
  onFocusPageSearch,
}: {
  locale: Locale;
  setLocale: (value: Locale) => void;
  theme: Theme;
  setTheme: (value: Theme) => void;
  online: boolean;
  onOpenSearch: () => void;
  pathname: string;
  onFocusPageSearch: () => void;
}) {
  const isBibleRoute = pathname === "/bible";
  const isKidungRoute =
    pathname === "/kidung" || pathname.startsWith("/kidung/");
  const isReaderRoute = isBibleRoute || isKidungRoute;
  const bibleHeader = useBibleHeaderState();
  const [typographyOpen, setTypographyOpen] = useState(false);
  const typographyRef = useRef<HTMLDivElement>(null);
  const [hamburgerOpen, setHamburgerOpen] = useState(false);
  const hamburgerRef = useRef<HTMLDivElement>(null);

  const midiSnapshot = useSyncExternalStore(
    midiPlayer.subscribe,
    midiPlayer.snapshot,
    midiPlayer.snapshot,
  );
  const isMidiPlaying = midiSnapshot.status === "playing";

  const speechSnapshot = useSyncExternalStore(
    speechPlayer.subscribe,
    speechPlayer.snapshot,
    speechPlayer.snapshot,
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        typographyRef.current &&
        !typographyRef.current.contains(event.target as Node)
      ) {
        setTypographyOpen(false);
      }
    };
    if (typographyOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [typographyOpen]);

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
      void midiPlayer.pause();
    } else if (midiSnapshot.songId) {
      void midiPlayer.play();
    }
  };

  if (isReaderRoute) {
    return (
      <header className="topbar is-reader-context">
        <div className="reader-context-bar">
          <div className="reader-context-left">
            {isBibleRoute && bibleHeader?.active ? (
              <>
                <button
                  className="reader-context-book-picker quick-nav-handle"
                  type="button"
                  onClick={bibleHeader.onOpenPicker}
                  onPointerDown={bibleHeader.startQuickNav}
                  onKeyDown={bibleHeader.quickNavKeyDown}
                  role="button"
                  tabIndex={0}
                  aria-label="Geser judul untuk berpindah pasal"
                  title="Pilih Kitab & Pasal"
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
                    label={bibleHeader.splitView ? "Versi 1" : "Versi"}
                    options={bibleHeader.versionOptions}
                  />
                  {bibleHeader.splitView &&
                    bibleHeader.secondaryVersionCode &&
                    bibleHeader.onSelectSecondaryVersion && (
                      <Select
                        value={bibleHeader.secondaryVersionCode}
                        onChange={bibleHeader.onSelectSecondaryVersion}
                        className="topbar-select reader-context-select version-select secondary-version-select"
                        label="Versi 2"
                        options={bibleHeader.versionOptions}
                      />
                    )}
                </div>
              </>
            ) : (
              <div className="reader-context-title">
                <span>{isBibleRoute ? "Bacaan" : "Kidung Rohani"}</span>
                <strong>{isBibleRoute ? "Alkitab" : "Kidung"}</strong>
              </div>
            )}
          </div>

          <div className="reader-context-actions">
            {isBibleRoute && bibleHeader?.active ? (
              <>
                <button
                  className="reader-context-button reader-search-btn"
                  type="button"
                  onClick={onFocusPageSearch}
                  aria-label="Buka pencarian ayat di Alkitab"
                  title="Cari ayat"
                >
                  <Icon name="search" size={15} />
                </button>

                <div className="reader-typography-wrapper" ref={typographyRef}>
                  <button
                    className={`reader-context-button reader-typography-btn${typographyOpen ? " is-active" : ""}`}
                    type="button"
                    onClick={() => setTypographyOpen((prev) => !prev)}
                    aria-expanded={typographyOpen}
                    aria-label="Ukuran teks bacaan"
                    title="Ukuran teks"
                  >
                    <span className="typography-icon-label">Aa</span>
                    <Icon name="chevronDown" size={10} />
                  </button>
                  {typographyOpen && (
                    <div
                      className="reader-typography-popover bible-typography-controls"
                      role="group"
                      aria-label="Ukuran teks bacaan"
                    >
                      <button
                        type="button"
                        onClick={bibleHeader.onDecreaseFontSize}
                        disabled={
                          bibleHeader.fontSize <= bibleHeader.minFontSize
                        }
                        aria-label="Perkecil teks"
                      >
                        A−
                      </button>
                      <output aria-live="polite">{bibleHeader.fontSize}</output>
                      <button
                        type="button"
                        onClick={bibleHeader.onIncreaseFontSize}
                        disabled={
                          bibleHeader.fontSize >= bibleHeader.maxFontSize
                        }
                        aria-label="Perbesar teks"
                      >
                        A+
                      </button>
                    </div>
                  )}
                </div>

                <button
                  className={`reader-context-button reader-split-btn${bibleHeader.splitView ? " is-active" : ""}`}
                  type="button"
                  onClick={bibleHeader.onToggleSplitView}
                  aria-pressed={bibleHeader.splitView}
                  aria-label={
                    bibleHeader.splitView
                      ? "Tampilkan satu kolom"
                      : "Tampilkan dua kolom"
                  }
                  title={bibleHeader.splitView ? "Satu kolom" : "Dua kolom"}
                >
                  <Icon name="columns" size={15} />
                </button>

                {bibleHeader.splitView && (
                  <button
                    className={`reader-context-button reader-sync-btn${bibleHeader.syncScroll ? " is-active" : ""}`}
                    type="button"
                    onClick={bibleHeader.onToggleSyncScroll}
                    aria-pressed={bibleHeader.syncScroll}
                    aria-label={
                      bibleHeader.syncScroll ? "Gulir sinkron" : "Gulir mandiri"
                    }
                    title={
                      bibleHeader.syncScroll ? "Gulir sinkron" : "Gulir mandiri"
                    }
                  >
                    <Icon name="arrow" size={15} />
                  </button>
                )}

                <button
                  className={`reader-context-button reader-speech-btn${bibleHeader.speaking ? " is-speaking" : ""}`}
                  type="button"
                  onClick={bibleHeader.onToggleSpeech}
                  disabled={!bibleHeader.speechAvailable}
                  aria-label={
                    bibleHeader.speechStatus === "paused"
                      ? "Lanjutkan bacaan"
                      : bibleHeader.speechStatus === "speaking"
                        ? "Jeda bacaan"
                        : bibleHeader.speaking
                          ? translate(locale, "bible.stopReading")
                          : translate(locale, "bible.readAloud")
                  }
                  title={
                    bibleHeader.speaking ? "Hentikan bacaan" : "Bacakan pasal"
                  }
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

                {/* Hamburger: otomatis muat saat tombol tidak muat di mobile bible */}
                <div className="reader-hamburger-wrapper" ref={hamburgerRef}>
                  <button
                    className={`reader-context-button reader-hamburger-btn${hamburgerOpen ? " is-active" : ""}`}
                    type="button"
                    aria-expanded={hamburgerOpen}
                    aria-label="Menu Alkitab"
                    title="Menu"
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
                        aria-label="Menu Bacaan"
                      >
                        <div className="hamburger-drawer-header">
                          <div className="hamburger-drawer-title">
                            <Icon name="book" size={16} />
                            <strong>Menu Bacaan</strong>
                          </div>
                          <button
                            className="hamburger-drawer-close"
                            type="button"
                            onClick={() => setHamburgerOpen(false)}
                            aria-label="Tutup menu"
                            title="Tutup"
                          >
                            ✕
                          </button>
                        </div>

                        <div className="hamburger-drawer-body">
                          {/* Section 1: Typography */}
                          <div className="hamburger-card">
                            <div className="hamburger-card-header">
                              <span className="hamburger-section-label">
                                Ukuran Teks
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
                                aria-label="Perkecil teks"
                              >
                                <span className="step-label">A−</span>
                                <small>Kecil</small>
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
                                aria-label="Perbesar teks"
                              >
                                <span className="step-label">A+</span>
                                <small>Besar</small>
                              </button>
                            </div>
                          </div>

                          {/* Section 2: Mode Tampilan */}
                          <div className="hamburger-section">
                            <span className="hamburger-section-label">
                              Mode Tampilan
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
                                  <strong>Tampilan Belah</strong>
                                  <small>Bandingkan 2 pasal / terjemahan</small>
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
                                    <strong>Gulir Sinkron</strong>
                                    <small>Geser kedua kolom bersamaan</small>
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
                              Alkitab Suara
                            </span>
                            <div className="hamburger-group">
                              <button
                                className={`hamburger-item${speechSnapshot.playerOpen || bibleHeader.speaking ? " is-active" : ""}`}
                                type="button"
                                disabled={!bibleHeader.speechAvailable}
                                onClick={() => {
                                  bibleHeader.onToggleSpeech();
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
                                  <strong>Player Alkitab Suara</strong>
                                  <small>
                                    {speechSnapshot.playerOpen ||
                                    bibleHeader.speaking
                                      ? "Pemutar audio aktif di layar"
                                      : "Tampilkan pemutar audio"}
                                  </small>
                                </div>
                                <span
                                  className={`hamburger-badge ${speechSnapshot.playerOpen || bibleHeader.speaking ? "is-playing" : ""}`}
                                >
                                  {speechSnapshot.playerOpen ||
                                  bibleHeader.speaking
                                    ? "Aktif"
                                    : "Buka"}
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
                                  <strong>Pengaturan Suara</strong>
                                  <small>
                                    {bibleHeader.speechControlsOpen
                                      ? "Tutup opsi suara & nada"
                                      : "Atur mesin suara, kecepatan & nada"}
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
                                  <span>Mesin</span>
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
                                    <option value="edge">Edge TTS</option>
                                    <option value="local">TTS lokal</option>
                                  </select>
                                </label>

                                <label className="drawer-speech-row">
                                  <span>Pilihan Suara</span>
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
                                    <option value="">Otomatis (Default)</option>
                                    {speechSnapshot.voices
                                      .filter((voice) =>
                                        speechSnapshot.engine === "edge"
                                          ? !voice.local ||
                                            voice.id.includes("Neural")
                                          : voice.local ||
                                            !voice.id.includes("Neural"),
                                      )
                                      .map((voice) => (
                                        <option value={voice.id} key={voice.id}>
                                          {voice.name}
                                        </option>
                                      ))}
                                  </select>
                                </label>

                                {speechSnapshot.engine === "edge" && (
                                  <label className="drawer-speech-row">
                                    <span className="drawer-speech-label">
                                      Endpoint Gateway (Opsional)
                                    </span>
                                    <input
                                      type="url"
                                      className="drawer-speech-input"
                                      placeholder="https://... (default)"
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
                                      Kecepatan Baca
                                    </span>
                                    <span className="drawer-speech-val">
                                      {speechSnapshot.rate.toFixed(1)}×
                                    </span>
                                  </div>
                                  <input
                                    type="range"
                                    className="drawer-speech-range"
                                    aria-label="Kecepatan bacaan suara"
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
                                      Tinggi Nada (Pitch)
                                    </span>
                                    <span className="drawer-speech-val">
                                      {speechSnapshot.pitch.toFixed(1)}×
                                    </span>
                                  </div>
                                  <input
                                    type="range"
                                    className="drawer-speech-range"
                                    aria-label="Nada bacaan suara"
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
                                      Volume
                                    </span>
                                    <span className="drawer-speech-val">
                                      {Math.round(speechSnapshot.volume * 100)}%
                                    </span>
                                  </div>
                                  <input
                                    type="range"
                                    className="drawer-speech-range"
                                    aria-label="Volume bacaan suara"
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
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : (
              <>
                {isKidungRoute && pathname !== "/kidung" ? (
                  <Link
                    className="reader-context-button"
                    to="/kidung"
                    aria-label="Buka daftar kidung"
                  >
                    Daftar
                  </Link>
                ) : null}
                {isBibleRoute || pathname === "/kidung" ? (
                  <button
                    className="reader-context-button"
                    type="button"
                    onClick={onFocusPageSearch}
                    aria-label={
                      isBibleRoute
                        ? "Buka pencarian ayat di Alkitab"
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
                  aria-label="Pemutar Musik MIDI"
                  title="Pemutar Musik MIDI"
                >
                  <Icon name="music" size={15} />
                </button>
              </>
            )}
          </div>

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
                { value: "system", label: "◐" },
                { value: "light", label: "☼" },
                { value: "dark", label: "☾" },
                { value: "amoled", label: "■" },
                { value: "sepia", label: "☕" },
              ]}
            />
          </div>
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
          className="search-trigger"
          type="button"
          onClick={onOpenSearch}
          aria-label="Cari di seluruh aplikasi"
        >
          <Icon name="search" size={18} />
          <span>Cari</span>
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
            { value: "system", label: "◐" },
            { value: "light", label: "☼" },
            { value: "dark", label: "☾" },
            { value: "amoled", label: "■" },
            { value: "sepia", label: "☕" },
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
  const location = useLocation();
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
  const speechActive =
    (speechSnapshot.total > 0 && speechSnapshot.status !== "idle") ||
    speechSnapshot.playerOpen;
  const isKidungMedia =
    !speechActive && location.pathname.startsWith("/kidung");
  const latestMidiRef = useRef(snapshot);
  const latestSpeechRef = useRef(speechSnapshot);
  const latestSpeechActiveRef = useRef(speechActive);
  latestMidiRef.current = snapshot;
  latestSpeechRef.current = speechSnapshot;
  latestSpeechActiveRef.current = speechActive;
  const mediaTitle = speechActive
    ? (speechSnapshot.context?.label ??
      `Alkitab · ayat ${Math.max(1, speechSnapshot.currentIndex + 1)}/${speechSnapshot.total}`)
    : (snapshot.title ?? snapshot.songId);
  const mediaPath = speechActive
    ? speechSnapshot.context?.path
    : snapshot.songId
      ? `/kidung/${encodeURIComponent(snapshot.songId)}`
      : undefined;
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
    if ((!snapshot.songId && !speechActive) || !("mediaSession" in navigator))
      return;
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
          if (latestSpeechActiveRef.current)
            return speech.status === "error"
              ? speechPlayer.stop()
              : speechPlayer.resume();
          void speechPlayer.stop();
          return midiPlayer.play().catch(() => undefined);
        },
      ],
      [
        "pause",
        () =>
          latestSpeechActiveRef.current
            ? speechPlayer.pause()
            : midiPlayer.pause().catch(() => undefined),
      ],
      [
        "stop",
        () =>
          latestSpeechActiveRef.current
            ? speechPlayer.stop()
            : midiPlayer.stop().catch(() => undefined),
      ],
      [
        "seekbackward",
        () => {
          const midi = latestMidiRef.current;
          return latestSpeechActiveRef.current
            ? speechPlayer.stop()
            : midiPlayer.seek(Math.max(0, midi.position - 10));
        },
      ],
      [
        "seekforward",
        () => {
          const midi = latestMidiRef.current;
          return latestSpeechActiveRef.current
            ? speechPlayer.stop()
            : midiPlayer.seek(Math.min(midi.duration, midi.position + 10));
        },
      ],
      [
        "seekto",
        (details) => {
          const midi = latestMidiRef.current;
          return latestSpeechActiveRef.current
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
  }, [mediaTitle, speechActive]);
  if ((!snapshot.songId || snapshot.status === "idle") && !speechActive)
    return null;
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
    if (!playing) void speechPlayer.stop();
    void (playing ? midiPlayer.pause() : midiPlayer.play()).catch(
      () => undefined,
    );
  };
  const beginDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
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
  return (
    <aside
      className={`media-surface${minimized ? " is-minimized" : ""}${isKidungMedia ? " is-kidung-media" : ""}${speechActive ? " is-speech-media" : ""}${dragging ? " is-dragging" : ""}`}
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
      {(isKidungMedia || speechActive) && !minimized && (
        <button
          className="media-collapse-toggle"
          type="button"
          onClick={() => setMinimized(true)}
          aria-expanded="true"
          aria-label="Ciutkan panel"
        >
          <span className="media-collapse-grip" aria-hidden="true" />
          <Icon name="chevronDown" size={15} />
        </button>
      )}
      <div
        className="media-art media-drag-handle"
        title="Geser pemutar"
        aria-label="Geser pemutar media"
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
          aria-label={`Buka ${mediaTitle ?? "sumber media"}`}
        >
          <strong>{mediaTitle ?? "Media GYS"}</strong>
          <small>
            {speechActive
              ? `${Math.max(1, speechSnapshot.currentIndex + 1)}/${speechSnapshot.total}`
              : `${formatDuration(snapshot.position)} / ${formatDuration(snapshot.duration)}`}
          </small>
        </button>
      )}
      <div className="media-main">
        <div className="media-meta">
          <small>
            {isKidungMedia
              ? "MIDI QUEUE"
              : speechActive
                ? speechSnapshot.offline
                  ? "Bacaan offline"
                  : "Alkitab Suara"
                : snapshot.status === "loading"
                  ? `Memuat MIDI ${snapshot.loadingProgress}%`
                  : snapshot.backend === "fluidsynth"
                    ? `${translate(locale, "shell.media")} · ${snapshot.soundfont ?? "FluidSynth"}`
                    : translate(locale, "shell.media")}
            {!speechActive && playlist.items.length > 0
              ? ` · ${playlist.items.length} antrean`
              : ""}
          </small>
          {isKidungMedia && (
            <button
              className="media-queue-link"
              type="button"
              onClick={() => navigate("/kidung?section=playlist")}
              aria-label="Antrean MIDI"
            >
              Antrean MIDI
              {playlist.items.length ? ` · ${playlist.items.length}` : ""}
            </button>
          )}
          {mediaPath ? (
            <button
              className="media-context-link"
              type="button"
              onClick={() => navigate(mediaPath)}
              title="Buka sumber media"
              aria-label={`Buka ${mediaTitle ?? "sumber media"}`}
            >
              <strong>{mediaTitle}</strong>
            </button>
          ) : (
            <strong>{mediaTitle}</strong>
          )}
          <span>
            {speechActive
              ? speechSnapshot.status === "error"
                ? (speechSnapshot.error ?? "Gagal memutar audio")
                : speechSnapshot.currentIndex >= 0
                  ? `Ayat ${speechSnapshot.currentIndex + 1} dari ${speechSnapshot.total}`
                  : "Siap dibaca"
              : `${formatDuration(snapshot.position)} / ${formatDuration(snapshot.duration)}`}
          </span>
        </div>
        {speechActive ? (
          <div
            className="speech-progress-track"
            aria-label="Progres bacaan ayat"
          >
            <div
              className="speech-progress-fill"
              style={{
                width: `${Math.min(100, Math.max(0, ((speechSnapshot.currentIndex + 1) / Math.max(1, speechSnapshot.total)) * 100))}%`,
              }}
            />
          </div>
        ) : (
          <label className="media-progress">
            <span className="sr-only">Posisi MIDI</span>
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
        )}
        {!minimized &&
          !isKidungMedia &&
          !speechActive &&
          playlist.items.length > 0 && (
            <div className="media-queue-controls" aria-label="Antrean MIDI">
              <button
                className="media-control"
                type="button"
                onClick={() =>
                  void playPreviousMidiPlaylistItem().catch(() => undefined)
                }
                aria-label="Lagu MIDI sebelumnya"
              >
                <Icon name="skipPrevious" size={17} />
              </button>
              <button
                className="media-control"
                type="button"
                onClick={() =>
                  void playNextMidiPlaylistItem().catch(() => undefined)
                }
                aria-label="Lagu MIDI berikutnya"
              >
                <Icon name="skipNext" size={17} />
              </button>
            </div>
          )}
        {!minimized && (
          <div className="media-adjustments">
            <label>
              <span>Vol</span>
              <input
                aria-label={speechActive ? "Volume bacaan" : "Volume MIDI"}
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
                <span>Kecepatan</span>
                <select
                  aria-label="Kecepatan bacaan"
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
                <label>
                  <span>Tempo {snapshot.tempo}</span>
                  <input
                    aria-label="Tempo MIDI"
                    type="range"
                    min="30"
                    max="220"
                    step="1"
                    value={snapshot.tempo}
                    onChange={(event) =>
                      void midiPlayer.setTempo(Number(event.target.value))
                    }
                  />
                </label>
                <label className="media-instrument-control">
                  <span>Instrumen</span>
                  <select
                    aria-label="Instrumen MIDI"
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
                <div className="media-transpose">
                  <span>
                    Nada{" "}
                    {snapshot.transpose > 0
                      ? `+${snapshot.transpose}`
                      : snapshot.transpose}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      void midiPlayer.setTranspose(snapshot.transpose - 1)
                    }
                    aria-label="Turunkan nada"
                  >
                    −
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void midiPlayer.setTranspose(snapshot.transpose + 1)
                    }
                    aria-label="Naikkan nada"
                  >
                    +
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      {!minimized ? (
        <div
          className="media-transport-controls"
          aria-label={speechActive ? "Kontrol Suara" : "Kontrol MIDI"}
        >
          <button
            className="media-control media-secondary-control media-previous-control"
            type="button"
            onClick={() =>
              speechActive
                ? void speechPlayer.previous().catch(() => undefined)
                : void playPreviousMidiPlaylistItem().catch(() => undefined)
            }
            aria-label={
              speechActive ? "Ayat sebelumnya" : "Lagu MIDI sebelumnya"
            }
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
            aria-label={
              speechActive ? "Ayat berikutnya" : "Lagu MIDI berikutnya"
            }
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
            aria-label={speechActive ? "Hentikan bacaan" : "Hentikan MIDI"}
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
                  ? "Bisukan bacaan"
                  : "Nyalakan bacaan"
                : snapshot.muted
                  ? "Nyalakan suara MIDI"
                  : "Bisukan MIDI"
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
          onClick={() => {
            void speechPlayer.stop();
            speechPlayer.togglePlayer(false);
          }}
          aria-label="Tutup pemutar suara"
          title="Tutup pemutar"
        >
          ✕
        </button>
      )}
      <button
        className="media-minimize"
        type="button"
        onClick={() => setMinimized((value) => !value)}
        aria-label={minimized ? "Perbesar pemutar" : "Minimalkan pemutar"}
      >
        {minimized ? "↗" : "−"}
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
  const closeSearch = useCallback(() => setSearchOpen(false), []);
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
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const animateControl = (target: EventTarget | null) => {
      if (reducedMotion.matches || !(target instanceof Element)) return;
      const control = target.closest<HTMLElement>(
        'button, summary, a[href], [role="button"]',
      );
      if (
        !control ||
        control.matches(":disabled, [aria-disabled='true']") ||
        !control.animate
      )
        return;
      control.animate(
        [
          { scale: "1", filter: "brightness(1)" },
          { scale: "0.96", filter: "brightness(0.97)" },
          { scale: "1", filter: "brightness(1)" },
        ],
        { duration: 190, easing: "cubic-bezier(.2,.8,.2,1)" },
      );
      control
        .querySelector("svg")
        ?.animate(
          [
            { transform: "rotate(0deg) scale(1)" },
            { transform: "rotate(-5deg) scale(0.9)" },
            { transform: "rotate(0deg) scale(1)" },
          ],
          { duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" },
        );
    };
    const onPointerDown = (event: PointerEvent) => animateControl(event.target);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ")
        animateControl(event.target);
    };
    document.addEventListener("pointerdown", onPointerDown, { passive: true });
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
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
        Lewati ke konten utama
      </a>
      <Header
        {...{ locale, setLocale, theme, setTheme, online }}
        onOpenSearch={openSearch}
        pathname={location.pathname}
        onFocusPageSearch={focusPageSearch}
      />
      <div className="workspace">
        <aside className="navigation-shell">
          <Navigation locale={locale} />
          <div className="sidebar-foot">
            <span className="offline-note">
              <i />
              {translate(locale, "home.offlinePack")}
            </span>
          </div>
        </aside>
        <main className="main-content" id="main-content" tabIndex={-1}>
          <div
            className="route-view"
            key={`${location.pathname}${location.search}`}
          >
            <Suspense
              fallback={
                <div className="loading-panel route-loading" role="status">
                  Membuka ruang ini…
                </div>
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
          </div>
        </main>
      </div>
      <MediaSurface locale={locale} />
      {searchOpen ? (
        <Suspense fallback={null}>
          <GlobalSearch locale={locale} open onClose={closeSearch} />
        </Suspense>
      ) : null}
    </div>
  );
}

function HomePage({ locale }: { locale: Locale }) {
  const [sauh, setSauh] = useState<Awaited<ReturnType<typeof fetchSauh>>>(
    () => {
      return getCachedSauh() ?? [];
    },
  );
  const [suara, setSuara] = useState<Awaited<ReturnType<typeof fetchSuara>>>(
    () => {
      return getCachedSuara() ?? [];
    },
  );
  const [sauhStatus, setSauhStatus] = useState<"loading" | "ready" | "error">(
    () => {
      const cached = getCachedSauh();
      return cached && cached.length ? "ready" : "loading";
    },
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
        setSauh(items);
        setSauhStatus(items.length > 0 ? "ready" : "error");
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
    if (!cached || !cached.length) setSauhStatus("loading");
    void fetchSauh(signal)
      .then((items) => {
        if (signal?.aborted) return;
        setSauh(items);
        setSauhStatus("ready");
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
    const isToday = selected && isTodaySauhAvailable([selected]);
    if (sauhStatus === "ready" && !isToday && navigator.onLine) {
      refreshTodaySauh();
    }
  }, [sauh, sauhStatus, refreshTodaySauh]);

  useEffect(() => {
    const checkFreshness = () => {
      const selected = sauh[0];
      const isToday = selected && isTodaySauhAvailable([selected]);
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
  const dailyText = selected ? (selected.verse ?? selected.body) : "";
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
      <section className="home-grid" aria-label="Daily overview">
        <article className="verse-panel">
          {selected?.imageUrl && sauhStatus === "ready" && (
            <div className="sauh-card-media">
              <LazyImage
                className="sauh-image"
                wrapperClassName="sauh-image-wrap"
                src={selected.imageUrl}
                alt={`Ilustrasi ${selected.title}`}
                loading="eager"
              />
              <div className="sauh-media-overlay" />
            </div>
          )}
          <div className="sauh-card-content">
            <div className="section-heading">
              <span>Sauh hari ini</span>
              <small>
                {selected?.reference ??
                  translate(locale, "home.sauhNoReference")}
              </small>
            </div>
            {sauhStatus === "loading" && (
              <p className="sauh-loading">Mengambil renungan Sauh Bagi Jiwa…</p>
            )}
            {sauhStatus === "error" && (
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
            {selected && sauhStatus === "ready" && (
              <div className="sauh-card-body">
                <p className="sauh-title">{selected.title}</p>
                <blockquote>“{dailyText}”</blockquote>
                {!selectTodaySauh([selected]).length && (
                  <small className="sauh-source">
                    Konten tersimpan ·{" "}
                    {new Date(selected.updatedAt).toLocaleDateString(locale)}
                  </small>
                )}
              </div>
            )}
            <div className="verse-actions">
              {selected && (
                <Link className="quiet-button" to="/sauh">
                  Baca Lebih Lanjut →
                </Link>
              )}
            </div>
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
                    <span>Alkitab Terjemahan Baru</span>
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
                      Kidung Rohani ·{" "}
                      {String(activity.hymn.number).padStart(3, "0")}
                    </span>
                  </div>
                  <Icon name="arrow" size={16} />
                </Link>
              )}
            </div>
          ) : (
            <div className="empty-inline">
              <p>Belum ada bacaan terakhir.</p>
            </div>
          )}
        </article>
        <section
          className="home-media-section home-suara-section"
          aria-labelledby="home-suara-heading"
        >
          <div className="section-title-row">
            <div>
              <p className="date-line">Kesaksian</p>
              <h2 id="home-suara-heading">Suara Sejati</h2>
            </div>
            <Link className="text-button" to="/suara">
              Lihat semua →
            </Link>
          </div>
          {suaraStatus === "loading" && (
            <div className="loading-panel" role="status">
              Mengambil Suara Sejati…
            </div>
          )}
          {suaraStatus === "error" && (
            <div className="error-panel" role="alert">
              <strong>Suara Sejati belum tersedia.</strong>
              <button
                className="quiet-button"
                type="button"
                onClick={() => loadSuara()}
              >
                Coba lagi
              </button>
            </div>
          )}
          {suaraStatus === "ready" && (
            <div className="home-suara-shelf">
              {suara.slice(0, 8).map((post) => (
                <Link
                  className="suara-library-item"
                  key={post.id}
                  to={`/suara/${encodeURIComponent(post.id)}`}
                >
                  <div className="suara-card-media">
                    {post.imageUrl ? (
                      <LazyImage
                        className="suara-thumb-img"
                        wrapperClassName="suara-library-thumb"
                        src={post.imageUrl}
                        alt={`Cover ${post.title}`}
                        loading="lazy"
                      />
                    ) : (
                      <span
                        className="suara-thumbnail-fallback"
                        aria-hidden="true"
                      >
                        SS
                      </span>
                    )}
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
          className="home-media-section"
          aria-labelledby="home-literature-heading"
        >
          <div className="section-title-row">
            <div>
              <p className="date-line">Bacaan &amp; Pembinaan</p>
              <h2 id="home-literature-heading">Literatur Terbaru</h2>
            </div>
            <Link className="text-button" to="/literatur">
              Lihat semua →
            </Link>
          </div>
          {literatureStatus === "loading" && (
            <div className="loading-panel" role="status">
              Mengambil literatur…
            </div>
          )}
          {literatureStatus === "error" && (
            <div className="error-panel" role="alert">
              <strong>Literatur belum tersedia.</strong>
              <button
                className="quiet-button"
                type="button"
                onClick={() => loadLiterature()}
              >
                Coba lagi
              </button>
            </div>
          )}
          {literatureStatus === "ready" && (
            <div className="home-suara-shelf home-literature-shelf">
              {literature.slice(0, 8).map((item) => (
                <Link
                  className="suara-library-item"
                  key={item.id}
                  to={`/literatur/${encodeURIComponent(item.id)}`}
                >
                  <div className="suara-card-media">
                    {item.imageUrl ? (
                      <LazyImage
                        className="suara-thumb-img"
                        wrapperClassName="suara-library-thumb"
                        src={item.imageUrl}
                        alt={`Cover ${item.title}`}
                        loading="lazy"
                      />
                    ) : (
                      <span
                        className="suara-thumbnail-fallback"
                        aria-hidden="true"
                      >
                        {item.category.slice(0, 2).toUpperCase()}
                      </span>
                    )}
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
                        : "Arsip TJC"}
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
  const settings = useAppSettings();
  const locale = settings.locale;
  useEffect(() => installMidiQueueCoordinator(), []);
  useEffect(() => installMediaSessionBridge(), []);
  useEffect(() => installHeadphoneDisconnectGuard(), []);
  return (
    <Routes>
      <Route element={<Shell {...settings} />}>
        <Route path="/" element={<HomePage locale={locale} />} />
        <Route path="/sauh" element={<SauhPage />} />
        <Route path="/suara" element={<SuaraPage />} />
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
        <Route path="*" element={<HomePage locale={locale} />} />
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
