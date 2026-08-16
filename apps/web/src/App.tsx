import {
  Component,
  lazy,
  memo,
  Suspense,
  useEffect,
  useCallback,
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
import { fetchSauh } from "./sauh.js";
import { fetchSuara } from "./suara.js";
import { midiPlayer } from "./midi-player.js";
import {
  installMidiQueueCoordinator,
  playNextMidiPlaylistItem,
  playPreviousMidiPlaylistItem,
} from "./midi-queue.js";
import { speechPlayer } from "./speech-player.js";
import { getMidiPlaylist, subscribeMidiPlaylist } from "./midi-playlist.js";
import { Select } from "./select.js";
import { GlobalSearch } from "./global-search.js";
import { recordDiagnostic } from "./diagnostics.js";
import { GM_INSTRUMENTS, midiInstrumentLabel } from "./midi-instruments.js";
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
const SuaraDetailPage = lazy(() =>
  import("./online-content.js").then(({ SuaraDetailPage: Page }) => ({
    default: Page,
  })),
);
const SuaraPage = lazy(() =>
  import("./online-content.js").then(({ SuaraPage: Page }) => ({
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
  | "stop"
  | "volume"
  | "volumeOff"
  | "arrow"
  | "book"
  | "search"
  | "person";

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
  stop: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
    </>
  ),
  volume: (
    <>
      <path d="M4 10v4h4l5 4V6l-5 4H4Z" />
      <path d="M16 9.5a4 4 0 0 1 0 5M18.5 7a7.5 7.5 0 0 1 0 10" />
    </>
  ),
  volumeOff: (
    <>
      <path d="M4 10v4h4l5 4V6l-5 4H4Z" />
      <path d="m17 9 4 6M21 9l-4 6" />
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
  search: (
    <>
      <circle cx="10.8" cy="10.8" r="6.5" />
      <path d="m16 16 5 5" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 21a7 7 0 0 1 14 0" />
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
  onOpenSearch,
}: {
  locale: Locale;
  setLocale: (value: Locale) => void;
  theme: Theme;
  setTheme: (value: Theme) => void;
  online: boolean;
  onOpenSearch: () => void;
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
  const speechActive =
    speechSnapshot.total > 0 && speechSnapshot.status !== "idle";
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
  const wakeLock = useRef<{ release: () => Promise<void> } | undefined>(
    undefined,
  );
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
  useEffect(() => {
    const wake = navigator as Navigator & {
      wakeLock?: {
        request: (type: "screen") => Promise<{ release: () => Promise<void> }>;
      };
    };
    const audible = speechActive
      ? speechSnapshot.status === "speaking"
      : snapshot.status === "playing";
    if (!wake.wakeLock || !audible) {
      const active = wakeLock.current;
      wakeLock.current = undefined;
      if (active) void active.release().catch(() => undefined);
      return;
    }
    let cancelled = false;
    void wake.wakeLock
      .request("screen")
      .then((sentinel) => {
        if (cancelled) return sentinel.release();
        wakeLock.current = sentinel;
        return undefined;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [snapshot.status, speechActive, speechSnapshot.status]);
  if ((!snapshot.songId || snapshot.status === "idle") && !speechActive)
    return null;
  const playing = speechActive
    ? speechSnapshot.status === "speaking"
    : snapshot.status === "playing";
  const togglePlayback = () => {
    if (speechActive) {
      const action =
        speechSnapshot.status === "error"
          ? speechPlayer.stop()
          : playing
            ? speechPlayer.pause()
            : speechPlayer.resume();
      void action.catch(() => undefined);
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
      className={`media-surface${minimized ? " is-minimized" : ""}${dragging ? " is-dragging" : ""}`}
      data-media-status={speechActive ? speechSnapshot.status : snapshot.status}
      data-media-backend={
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
            {speechActive
              ? speechSnapshot.offline
                ? "Bacaan offline"
                : "Bacaan Alkitab"
              : snapshot.status === "loading"
                ? `Memuat MIDI ${snapshot.loadingProgress}%`
                : snapshot.backend === "fluidsynth"
                  ? `${translate(locale, "shell.media")} · ${snapshot.soundfont ?? "FluidSynth"}`
                  : translate(locale, "shell.media")}
            {!speechActive && playlist.items.length > 0
              ? ` · ${playlist.items.length} antrean`
              : ""}
          </small>
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
                ? speechSnapshot.error
                : speechSnapshot.currentIndex >= 0
                  ? `Ayat ${speechSnapshot.currentIndex + 1} dari ${speechSnapshot.total}`
                  : "Siap dibaca"
              : `${formatDuration(snapshot.position)} / ${formatDuration(snapshot.duration)}`}
          </span>
        </div>
        <label className="media-progress">
          <span className="sr-only">
            {speechActive ? "Posisi bacaan" : "Posisi MIDI"}
          </span>
          <input
            type="range"
            min="0"
            max={Math.max(0.01, snapshot.duration)}
            step="0.1"
            value={Math.min(snapshot.duration, snapshot.position)}
            disabled={speechActive}
            onChange={(event) =>
              void midiPlayer
                .seek(Number(event.target.value))
                .catch(() => undefined)
            }
          />
        </label>
        {!minimized && (speechActive || playlist.items.length > 0) && (
          <div
            className="media-queue-controls"
            aria-label={speechActive ? "Navigasi bacaan" : "Antrean MIDI"}
          >
            {speechActive ? (
              <>
                <button
                  className="text-button"
                  type="button"
                  onClick={() =>
                    void speechPlayer.previous().catch(() => undefined)
                  }
                  aria-label="Ayat sebelumnya"
                  disabled={speechSnapshot.currentIndex <= 0}
                >
                  ‹ Ayat sebelumnya
                </button>
                <button
                  className="text-button"
                  type="button"
                  onClick={() =>
                    void speechPlayer.next().catch(() => undefined)
                  }
                  aria-label="Ayat berikutnya"
                  disabled={
                    speechSnapshot.currentIndex < 0 ||
                    speechSnapshot.currentIndex >= speechSnapshot.total - 1
                  }
                >
                  Ayat berikutnya ›
                </button>
              </>
            ) : (
              <>
                <button
                  className="text-button"
                  type="button"
                  onClick={() =>
                    void playPreviousMidiPlaylistItem().catch(() => undefined)
                  }
                  aria-label="Lagu MIDI sebelumnya"
                >
                  ‹ Sebelumnya
                </button>
                <button
                  className="text-button"
                  type="button"
                  onClick={() =>
                    void playNextMidiPlaylistItem().catch(() => undefined)
                  }
                  aria-label="Lagu MIDI berikutnya"
                >
                  Berikutnya ›
                </button>
              </>
            )}
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
            <label>
              <span>Tempo {snapshot.tempo}</span>
              <input
                aria-label="Tempo MIDI"
                type="range"
                min="30"
                max="220"
                step="1"
                value={snapshot.tempo}
                disabled={speechActive}
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
                disabled={speechActive}
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
          </div>
        )}
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
      {!minimized && (
        <>
          <button
            className="media-control media-secondary-control"
            type="button"
            onClick={() =>
              void (speechActive ? speechPlayer.stop() : midiPlayer.stop())
            }
            aria-label={speechActive ? "Hentikan bacaan" : "Hentikan MIDI"}
          >
            <Icon name="stop" size={16} />
          </button>
          <button
            className="media-control media-secondary-control"
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
  const openSearch = useCallback(() => setSearchOpen(true), []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);
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
    <div className="app-frame">
      <a className="skip-link" href="#main-content">
        Lewati ke konten utama
      </a>
      <Header
        {...{ locale, setLocale, theme, setTheme, online }}
        onOpenSearch={openSearch}
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
      <GlobalSearch locale={locale} open={searchOpen} onClose={closeSearch} />
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
  const [dailyMode, setDailyMode] = useState<"verse" | "reflection">(() =>
    localStorage.getItem("gys-daily-sauh-mode-v1") === "reflection"
      ? "reflection"
      : "verse",
  );
  useEffect(() => subscribeActivity(() => setActivity(getActivity())), []);
  const continueActivity =
    activity.hymn &&
    (!activity.bible || activity.hymn.updatedAt > activity.bible.updatedAt)
      ? { kind: "hymn" as const, value: activity.hymn }
      : activity.bible
        ? { kind: "bible" as const, value: activity.bible }
        : undefined;
  const loadSauh = useCallback((signal?: AbortSignal) => {
    setSauhStatus("loading");
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
  const dailyText = selected
    ? dailyMode === "verse"
      ? (selected.verse ?? selected.body)
      : selected.body
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
          <p className="intro-copy">{translate(locale, "home.subtitle")}</p>
        </div>
      </section>
      <section className="home-grid" aria-label="Daily overview">
        <article className="verse-panel">
          <div className="section-heading">
            <span>{translate(locale, "home.dailyLabel")} · Sauh Bagi Jiwa</span>
            <small>
              {selected?.reference ?? translate(locale, "home.sauhNoReference")}
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
              <blockquote>“{dailyText}”</blockquote>
              <small className="sauh-source">
                Sumber langsung Sauh Bagi Jiwa ·{" "}
                {new Date(selected.updatedAt).toLocaleDateString(locale)}
              </small>
            </>
          )}
          <div className="verse-actions">
            {selected && (
              <Link className="quiet-button" to="/sauh">
                Baca Sauh
              </Link>
            )}
            {selected && (
              <button
                className="quiet-button"
                type="button"
                onClick={() => {
                  const next = dailyMode === "verse" ? "reflection" : "verse";
                  setDailyMode(next);
                  localStorage.setItem("gys-daily-sauh-mode-v1", next);
                }}
              >
                {dailyMode === "verse" ? "Baca renungan" : "Tampilkan ayat"}
              </button>
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
          <Link className="text-button" to="/suara">
            Lihat semua
          </Link>
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
              <Link
                className="suara-item"
                to={`/suara/${encodeURIComponent(post.id)}`}
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
              </Link>
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
  useEffect(() => installMidiQueueCoordinator(), []);
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
