import {
  Component,
  lazy,
  memo,
  Suspense,
  useEffect,
  useState,
  useSyncExternalStore,
  type ErrorInfo,
  type ReactNode,
} from "react";
import {
  BrowserRouter,
  Link,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { DESTINATIONS, type Destination } from "./navigation.js";
import { translate, type Locale } from "./i18n.js";
import { fetchSauh } from "./sauh.js";
import { fetchSuara } from "./suara.js";
import { midiPlayer } from "./midi-player.js";
import { Select } from "./select.js";
import {
  getActivity,
  subscribeActivity,
  type ActivityState,
} from "./history.js";

const BiblePage = lazy(() =>
  import("./bible.js").then(({ BiblePage: Page }) => ({ default: Page })),
);
const KidungPage = lazy(() =>
  import("./kidung.js").then(({ KidungPage: Page }) => ({ default: Page })),
);
const FaithPage = lazy(() =>
  import("./faith.js").then(({ FaithPage: Page }) => ({ default: Page })),
);
const MorePage = lazy(() =>
  import("./more.js").then(({ MorePage: Page }) => ({ default: Page })),
);
const LiteraturePage = lazy(() =>
  import("./literature.js").then(({ LiteraturePage: Page }) => ({
    default: Page,
  })),
);

type Theme = "light" | "dark" | "system";
type IconName =
  | Destination["icon"]
  | "sun"
  | "moon"
  | "system"
  | "play"
  | "pause"
  | "arrow"
  | "book";

class AppErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  public override state: { failed: boolean } = { failed: false };
  public static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  public override componentDidCatch(error: Error, info: ErrorInfo): void {
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
            onClick={() => window.location.reload()}
          >
            Muat ulang
          </button>
        </main>
      );
    return this.props.children;
  }
}

const ICON_PATHS: Record<IconName, ReactNode> = {
  home: (
    <>
      <path d="m3 10 9-7 9 7" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M9 21v-7h6v7" />
    </>
  ),
  bible: (
    <>
      <path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v17H7.5A2.5 2.5 0 0 0 5 21.5z" />
      <path d="M5 4.5v17" />
      <path d="M9 7h7M9 11h7" />
    </>
  ),
  music: (
    <>
      <path d="M9 18V5l10-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="16" cy="16" r="3" />
    </>
  ),
  faith: (
    <>
      <path d="M12 3v18M6 9h12" />
      <path d="M5 21h14" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </>
  ),
  moon: <path d="M20.7 15.3A8.5 8.5 0 0 1 8.7 3.3 8.5 8.5 0 1 0 20.7 15.3Z" />,
  system: (
    <>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </>
  ),
  play: <path d="m9 5 10 7-10 7z" />,
  pause: (
    <>
      <path d="M8 5v14M16 5v14" />
    </>
  ),
  arrow: (
    <>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </>
  ),
  book: (
    <>
      <path d="M4 5a2 2 0 0 1 2-2h14v17H6a2 2 0 0 0-2 2z" />
      <path d="M4 5v17" />
    </>
  ),
};

const Icon = memo(function Icon({
  name,
  size = 20,
}: {
  name: IconName;
  size?: number;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  return <svg {...common}>{ICON_PATHS[name]}</svg>;
});

function useAppSettings() {
  const [locale, setLocale] = useState<Locale>(
    () => (localStorage.getItem("gys-locale") as Locale | null) ?? "id",
  );
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem("gys-theme") as Theme | null) ?? "light",
  );
  useEffect(() => {
    localStorage.setItem("gys-locale", locale);
    document.documentElement.lang = locale;
  }, [locale]);
  useEffect(() => {
    localStorage.setItem("gys-theme", theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  return { locale, setLocale, theme, setTheme };
}

function Navigation({ locale }: { locale: Locale }) {
  return (
    <nav
      className="primary-nav"
      aria-label={translate(locale, "shell.navigation")}
    >
      {DESTINATIONS.map((destination) => (
        <NavLink
          key={destination.path}
          to={destination.path}
          end={destination.path === "/"}
          className={({ isActive }) =>
            `nav-item${isActive ? " is-active" : ""}`
          }
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
}: {
  locale: Locale;
  setLocale: (value: Locale) => void;
  theme: Theme;
  setTheme: (value: Theme) => void;
  online: boolean;
}) {
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
          ]}
        />
        <Link
          className="account-button"
          to="/lainnya"
          aria-label={translate(locale, "shell.account")}
        >
          <span>TS</span>
        </Link>
      </div>
    </header>
  );
}

function MediaSurface({ locale }: { locale: Locale }) {
  const snapshot = useSyncExternalStore(
    midiPlayer.subscribe,
    midiPlayer.snapshot,
    midiPlayer.snapshot,
  );
  const [minimized, setMinimized] = useState(
    () => localStorage.getItem("gys-media-minimized") === "1",
  );
  useEffect(() => {
    localStorage.setItem("gys-media-minimized", minimized ? "1" : "0");
  }, [minimized]);
  if (!snapshot.songId || snapshot.status === "idle") return null;
  const playing = snapshot.status === "playing";
  const togglePlayback = () => {
    void (playing ? midiPlayer.pause() : midiPlayer.play()).catch(
      () => undefined,
    );
  };
  return (
    <aside
      className={`media-surface${minimized ? " is-minimized" : ""}`}
      aria-label={translate(locale, "shell.media")}
    >
      <div className="media-art">
        <Icon name="music" size={19} />
      </div>
      <div className="media-meta">
        <small>{translate(locale, "shell.media")}</small>
        <strong>{snapshot.title ?? snapshot.songId}</strong>
        <span>
          {formatDuration(snapshot.position)} /{" "}
          {formatDuration(snapshot.duration)}
        </span>
      </div>
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
  const location = useLocation();
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
  return (
    <div className="app-frame">
      <a className="skip-link" href="#main-content">
        Lewati ke konten utama
      </a>
      <Header {...{ locale, setLocale, theme, setTheme, online }} />
      <div className="workspace">
        <aside className="navigation-shell">
          <Navigation locale={locale} />
          <div className="sidebar-foot">
            <span className="offline-note">
              <i />
              {translate(locale, "home.offlinePack")}
            </span>
            <small>v0.1 preview</small>
          </div>
        </aside>
        <main className="main-content" id="main-content" tabIndex={-1}>
          <div className="route-view" key={location.pathname}>
            <Suspense
              fallback={
                <div className="loading-panel route-loading" role="status">
                  Membuka ruang ini…
                </div>
              }
            >
              <Outlet context={{ locale }} />
            </Suspense>
          </div>
        </main>
      </div>
      <MediaSurface locale={locale} />
    </div>
  );
}

function HomePage({ locale }: { locale: Locale }) {
  const [sauh, setSauh] = useState<Awaited<ReturnType<typeof fetchSauh>>>([]);
  const [sauhStatus, setSauhStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [suara, setSuara] = useState<Awaited<ReturnType<typeof fetchSuara>>>(
    [],
  );
  const [suaraStatus, setSuaraStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [activity, setActivity] = useState<ActivityState>(() => getActivity());
  useEffect(() => subscribeActivity(() => setActivity(getActivity())), []);
  const continuePath =
    activity.hymn &&
    (!activity.bible || activity.hymn.updatedAt > activity.bible.updatedAt)
      ? `/kidung/${activity.hymn.id}`
      : "/bible";
  const continueActivity =
    activity.hymn &&
    (!activity.bible || activity.hymn.updatedAt > activity.bible.updatedAt)
      ? { kind: "hymn" as const, value: activity.hymn }
      : activity.bible
        ? { kind: "bible" as const, value: activity.bible }
        : undefined;
  const loadSauh = () => {
    setSauhStatus("loading");
    void fetchSauh()
      .then((items) => {
        setSauh(items);
        setSauhStatus("ready");
      })
      .catch(() => setSauhStatus("error"));
  };
  useEffect(loadSauh, []);
  useEffect(() => {
    const controller = new AbortController();
    void fetchSuara(controller.signal)
      .then((items) => {
        setSuara(items);
        setSuaraStatus("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setSuaraStatus("error");
      });
    return () => controller.abort();
  }, []);
  const selected = sauh[0];
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
          <p className="intro-copy">{translate(locale, "home.subtitle")}</p>
        </div>
        <Link className="quiet-button" to={continuePath}>
          {translate(locale, "home.continue")} <Icon name="arrow" size={16} />
        </Link>
      </section>
      <section className="home-grid" aria-label="Daily overview">
        <article className="verse-panel">
          <div className="section-heading">
            <span>{translate(locale, "home.dailyLabel")} · Sauh Bagi Jiwa</span>
            <small>
              {selected?.reference ?? translate(locale, "home.reference")}
            </small>
          </div>
          {sauhStatus === "loading" && (
            <p className="sauh-loading">Mengambil renungan Sauh Bagi Jiwa…</p>
          )}
          {sauhStatus === "error" && (
            <div className="sauh-offline-state">
              <strong>{translate(locale, "home.dailyVerse")}</strong>
              <small>
                Offline fallback · {translate(locale, "home.reference")}
              </small>
              <button className="quiet-button" type="button" onClick={loadSauh}>
                Coba lagi
              </button>
            </div>
          )}
          {selected && sauhStatus === "ready" && (
            <>
              {selected.imageUrl && (
                <img
                  className="sauh-image"
                  src={selected.imageUrl}
                  alt={`Ilustrasi ${selected.title}`}
                  loading="eager"
                  decoding="async"
                />
              )}
              <p className="sauh-title">{selected.title}</p>
              <blockquote>“{selected.verse ?? selected.body}”</blockquote>
              <small className="sauh-source">
                Sumber langsung Sauh Bagi Jiwa ·{" "}
                {new Date(selected.updatedAt).toLocaleDateString(locale)}
              </small>
            </>
          )}
          <div className="verse-actions">
            <Link className="quiet-button" to="/bible">
              {translate(locale, "home.openBible")}
            </Link>
            {selected && (
              <a
                className="quiet-button"
                href={selected.url}
                target="_blank"
                rel="noreferrer"
              >
                Buka Sauh
              </a>
            )}
          </div>
        </article>
        <article className="continue-panel">
          <div className="section-heading">
            <span>{translate(locale, "home.continue")}</span>
            <small>
              {continueActivity
                ? "Tersimpan di perangkat ini"
                : "Mulai dari salah satu ruang"}
            </small>
          </div>
          {continueActivity?.kind === "bible" && (
            <Link className="continue-item" to="/bible">
              <div className="item-icon">
                <Icon name="book" size={21} />
              </div>
              <div>
                <strong>
                  {continueActivity.value.book} {continueActivity.value.chapter}
                </strong>
                <span>Alkitab Terjemahan Baru</span>
              </div>
              <Icon name="arrow" size={17} />
            </Link>
          )}
          {continueActivity?.kind === "hymn" && (
            <Link
              className="continue-item"
              to={`/kidung/${continueActivity.value.id}`}
            >
              <div className="item-icon music-icon">
                <Icon name="music" size={21} />
              </div>
              <div>
                <strong>{continueActivity.value.title}</strong>
                <span>
                  Kidung Rohani ·{" "}
                  {String(continueActivity.value.number).padStart(3, "0")}
                </span>
              </div>
              <Icon name="arrow" size={17} />
            </Link>
          )}
          {!continueActivity && (
            <div className="empty-inline">
              <p>Belum ada bacaan terakhir.</p>
              <div>
                <Link className="quiet-button" to="/bible">
                  Buka Alkitab
                </Link>
                <Link className="quiet-button" to="/kidung">
                  Pilih Kidung
                </Link>
              </div>
            </div>
          )}
        </article>
      </section>
      <section
        className="home-media-section"
        aria-labelledby="suara-sejati-title"
      >
        <div className="section-title-row">
          <div>
            <p className="date-line">Cerita dan kesaksian</p>
            <h2 id="suara-sejati-title">Suara Sejati</h2>
          </div>
          <a
            className="text-button"
            href="https://tjc.org/id/suarasejati/"
            target="_blank"
            rel="noreferrer"
          >
            Lihat semua ↗
          </a>
        </div>
        {suaraStatus === "loading" && (
          <div className="loading-panel" role="status">
            Mengambil Suara Sejati…
          </div>
        )}
        {suaraStatus === "error" && (
          <div className="empty-state">
            <strong>Suara Sejati belum tersedia.</strong>
            <span>Coba lagi saat tersambung ke internet.</span>
          </div>
        )}
        {suaraStatus === "ready" && (
          <div className="suara-shelf">
            {suara.slice(0, 4).map((post) => (
              <a
                className="suara-item"
                href={post.url}
                target="_blank"
                rel="noreferrer"
                key={post.id}
              >
                {post.imageUrl ? (
                  <img
                    src={post.imageUrl}
                    alt={`Thumbnail ${post.title}`}
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <span className="suara-thumbnail-fallback" aria-hidden="true">
                    SS
                  </span>
                )}
                <span>
                  <strong>{post.title}</strong>
                  <small>{post.excerpt}</small>
                  <em>
                    {new Date(post.publishedAt).toLocaleDateString(locale)}
                  </em>
                </span>
              </a>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function RoutedApp() {
  const settings = useAppSettings();
  const locale = settings.locale;
  return (
    <Routes>
      <Route element={<Shell {...settings} />}>
        <Route path="/" element={<HomePage locale={locale} />} />
        <Route path="/bible" element={<BiblePage locale={locale} />} />
        <Route path="/kidung" element={<KidungPage locale={locale} />} />
        <Route
          path="/kidung/:songId"
          element={<KidungPage locale={locale} />}
        />
        <Route path="/iman" element={<FaithPage locale={locale} />} />
        <Route path="/literatur" element={<LiteraturePage locale={locale} />} />
        <Route path="/lainnya" element={<MorePage locale={locale} />} />
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
