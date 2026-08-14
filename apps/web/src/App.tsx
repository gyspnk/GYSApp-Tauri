import {
  Component,
  useEffect,
  useMemo,
  useState,
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

type Theme = "light" | "dark" | "system";

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

function Icon({
  name,
  size = 20,
}: {
  name:
    | Destination["icon"]
    | "sun"
    | "moon"
    | "system"
    | "play"
    | "pause"
    | "arrow"
    | "book";
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
  const paths: Record<string, ReactNode> = {
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
    moon: (
      <path d="M20.7 15.3A8.5 8.5 0 0 1 8.7 3.3 8.5 8.5 0 1 0 20.7 15.3Z" />
    ),
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
  return <svg {...common}>{paths[name]}</svg>;
}

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
    <nav className="primary-nav" aria-label="Primary">
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
      <Link className="brand" to="/" aria-label="GYSApp home">
        <img src={`${import.meta.env.BASE_URL}assets/gys-logo.png`} alt="GYS" />
        <span>
          <strong>GYSApp</strong>
          <small>Quiet sanctuary</small>
        </span>
      </Link>
      <div className="topbar-actions">
        <span
          className={`connection-status ${online ? "is-online" : "is-offline"}`}
        >
          <i aria-hidden="true" />
          {online ? "Online" : "Offline"}
        </span>
        <label className="select-label">
          <span className="sr-only">{translate(locale, "shell.language")}</span>
          <select
            value={locale}
            onChange={(event) => setLocale(event.target.value as Locale)}
          >
            <option value="id">ID</option>
            <option value="en">EN</option>
            <option value="zh">中文</option>
          </select>
        </label>
        <label className="select-label theme-select">
          <span className="sr-only">{translate(locale, "shell.theme")}</span>
          <select
            value={theme}
            onChange={(event) => setTheme(event.target.value as Theme)}
          >
            <option value="system">◐</option>
            <option value="light">☼</option>
            <option value="dark">☾</option>
          </select>
        </label>
        <button
          className="account-button"
          type="button"
          aria-label={translate(locale, "shell.account")}
        >
          <span>TS</span>
        </button>
      </div>
    </header>
  );
}

function MediaSurface({ locale }: { locale: Locale }) {
  const [playing, setPlaying] = useState(false);
  return (
    <aside
      className="media-surface"
      aria-label={translate(locale, "shell.media")}
    >
      <div className="media-art">
        <Icon name="music" size={19} />
      </div>
      <div className="media-meta">
        <small>{translate(locale, "shell.media")}</small>
        <strong>Kasih Setia-Mu</strong>
        <span>Hymn 001 · C major</span>
      </div>
      <button
        className="media-control"
        type="button"
        onClick={() => setPlaying((value) => !value)}
        aria-label={
          playing
            ? translate(locale, "shell.pause")
            : translate(locale, "shell.play")
        }
      >
        <Icon name={playing ? "pause" : "play"} size={18} />
      </button>
    </aside>
  );
}

function Shell({
  locale,
  setLocale,
  theme,
  setTheme,
}: ReturnType<typeof useAppSettings>) {
  const [online, setOnline] = useState(() => navigator.onLine);
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
      <Header {...{ locale, setLocale, theme, setTheme, online }} />
      <div className="workspace">
        <aside className="desktop-sidebar">
          <Navigation locale={locale} />
          <div className="sidebar-foot">
            <span className="offline-note">
              <i />
              {translate(locale, "home.offlinePack")}
            </span>
            <small>v0.1 preview</small>
          </div>
        </aside>
        <main className="main-content">
          <Outlet context={{ locale }} />
        </main>
      </div>
      <div className="mobile-navigation">
        <Navigation locale={locale} />
      </div>
      <MediaSurface locale={locale} />
    </div>
  );
}

function HomePage({ locale }: { locale: Locale }) {
  return (
    <div className="page home-page">
      <section className="page-intro">
        <div>
          <p className="date-line">{translate(locale, "home.today")}</p>
          <h1>{translate(locale, "home.title")}</h1>
          <p className="intro-copy">{translate(locale, "home.subtitle")}</p>
        </div>
        <button className="quiet-button" type="button">
          {translate(locale, "home.continue")} <Icon name="arrow" size={16} />
        </button>
      </section>
      <section className="home-grid" aria-label="Daily overview">
        <article className="verse-panel">
          <div className="section-heading">
            <span>{translate(locale, "home.dailyVerse")}</span>
            <small>{translate(locale, "home.reference")}</small>
          </div>
          <blockquote>“{translate(locale, "home.dailyVerse")}”</blockquote>
          <div className="verse-actions">
            <button type="button">{translate(locale, "home.continue")}</button>
            <button type="button" className="icon-only" aria-label="Open verse">
              <Icon name="arrow" size={17} />
            </button>
          </div>
        </article>
        <article className="continue-panel">
          <div className="section-heading">
            <span>{translate(locale, "home.continue")}</span>
            <small>2 min ago</small>
          </div>
          <div className="continue-item">
            <div className="item-icon">
              <Icon name="book" size={21} />
            </div>
            <div>
              <strong>Yohanes 3</strong>
              <span>Alkitab Terjemahan Baru</span>
            </div>
            <Icon name="arrow" size={17} />
          </div>
          <div className="continue-item">
            <div className="item-icon music-icon">
              <Icon name="music" size={21} />
            </div>
            <div>
              <strong>Kasih Setia-Mu</strong>
              <span>Kidung Rohani · 001</span>
            </div>
            <Icon name="arrow" size={17} />
          </div>
        </article>
      </section>
      <section className="lower-grid">
        <div>
          <div className="section-title-row">
            <h2>{translate(locale, "home.shortcuts")}</h2>
            <Link to="/lainnya">
              {translate(locale, "nav.more")} <Icon name="arrow" size={15} />
            </Link>
          </div>
          <div className="shortcut-list">
            <Link to="/bible">
              <Icon name="bible" />
              <span>{translate(locale, "home.openBible")}</span>
              <Icon name="arrow" size={16} />
            </Link>
            <Link to="/kidung">
              <Icon name="music" />
              <span>{translate(locale, "home.openSong")}</span>
              <Icon name="arrow" size={16} />
            </Link>
            <Link to="/iman">
              <Icon name="faith" />
              <span>{translate(locale, "nav.iman")}</span>
              <Icon name="arrow" size={16} />
            </Link>
          </div>
        </div>
        <div className="sauh-note">
          <div className="section-title-row">
            <h2>{translate(locale, "home.sauh")}</h2>
            <span className="tiny-mark">SAUH</span>
          </div>
          <p>“Tuhan adalah tempat perlindungan dan kekuatan kita.”</p>
          <small>Renungan singkat · 4 min</small>
        </div>
      </section>
    </div>
  );
}

function FeaturePage({
  locale,
  kind,
}: {
  locale: Locale;
  kind: "bible" | "kidung" | "iman" | "more";
}) {
  const data = {
    bible: ["page.bibleTitle", "page.bibleBody", "home.openBible", "bible"],
    kidung: ["page.kidungTitle", "page.kidungBody", "home.openSong", "music"],
    iman: ["page.imanTitle", "page.imanBody", "nav.iman", "faith"],
    more: ["page.moreTitle", "page.moreBody", "nav.more", "more"],
  }[kind] as [string, string, string, Destination["icon"]];
  return (
    <div className="page feature-page">
      <section className="page-intro">
        <div>
          <p className="date-line">GYSApp</p>
          <h1>{translate(locale, data[0])}</h1>
          <p className="intro-copy">{translate(locale, data[1])}</p>
        </div>
        <button className="quiet-button" type="button">
          {translate(locale, data[2])} <Icon name="arrow" size={16} />
        </button>
      </section>
      <div className="feature-empty">
        <div className="feature-mark">
          <Icon name={data[3]} size={29} />
        </div>
        <h2>{translate(locale, data[0])}</h2>
        <p>{translate(locale, data[1])}</p>
        <button className="primary-button" type="button">
          {translate(locale, data[2])} <Icon name="arrow" size={16} />
        </button>
      </div>
    </div>
  );
}

function RoutedApp() {
  const settings = useAppSettings();
  const locale = useMemo(() => settings.locale, [settings.locale]);
  return (
    <Routes>
      <Route element={<Shell {...settings} />}>
        <Route path="/" element={<HomePage locale={locale} />} />
        <Route
          path="/bible"
          element={<FeaturePage locale={locale} kind="bible" />}
        />
        <Route
          path="/kidung"
          element={<FeaturePage locale={locale} kind="kidung" />}
        />
        <Route
          path="/iman"
          element={<FeaturePage locale={locale} kind="iman" />}
        />
        <Route
          path="/lainnya"
          element={<FeaturePage locale={locale} kind="more" />}
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
