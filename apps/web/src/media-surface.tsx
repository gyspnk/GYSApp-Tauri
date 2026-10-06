import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import { translate, type Locale } from "./i18n.js";
import { midiPlayer } from "./midi-player.js";
import { speechPlayer } from "./speech-player.js";
import {
  getMidiPlaylist,
  subscribeMidiPlaylist,
  applyAutoNextMode,
  getAutoNextMode,
} from "./midi-playlist.js";
import {
  playNextMidiPlaylistItem,
  playPreviousMidiPlaylistItem,
} from "./midi-queue.js";
import { mediaSessionBridge } from "./media-session.js";
import { chordKeyName, transposeBetweenKeys } from "./chord-viewer.js";
import { GM_INSTRUMENTS, midiInstrumentLabel } from "./midi-instruments.js";
import { Select } from "./select.js";
import { Icon } from "./icons.js";
import { getHymnPdfMeta, subscribeHymnPdfMeta } from "./hymn-pdf-meta.js";
import { createSnapshotSelector } from "./snapshot-selector.js";

const readMediaState = createSnapshotSelector(
  midiPlayer.snapshot,
  ({ position: _position, ...state }) => state,
);

function readPreference(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writePreference(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Playback works without persistent preferences. */
  }
}

function MidiTimeCaption() {
  const state = useSyncExternalStore(midiPlayer.subscribe, midiPlayer.snapshot);
  return (
    <>
      {formatDuration(state.position)} / {formatDuration(state.duration)}
    </>
  );
}

/** Preview pointer scrubbing locally; update audio once on release. */
function useMediaRange(value: number, onCommit: (value: number) => void) {
  const drag = useRef<number | undefined>(undefined);
  const delivered = useRef<number | undefined>(undefined);
  const [preview, setPreview] = useState<number | undefined>(undefined);
  const cancel = () => {
    drag.current = undefined;
    setPreview(undefined);
  };
  const commit = () => {
    const next = drag.current;
    if (next === undefined) return;
    cancel();
    deliver(next);
  };
  const deliver = (next: number) => {
    // Native ranges can emit both input and change around the same key press.
    if (delivered.current === next) return;
    delivered.current = next;
    onCommit(next);
  };
  return {
    value: preview ?? value,
    onPointerDown: (event: ReactPointerEvent<HTMLInputElement>) => {
      if (event.button !== 0) return;
      delivered.current = undefined;
      drag.current = value;
      setPreview(value);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onChange: (event: ChangeEvent<HTMLInputElement>) => {
      const next = event.currentTarget.valueAsNumber;
      if (drag.current === undefined) deliver(next);
      else {
        drag.current = next;
        setPreview(next);
      }
    },
    onPointerUp: commit,
    onKeyDown: () => {
      delivered.current = undefined;
    },
    onLostPointerCapture: commit,
    onPointerCancel: cancel,
    onBlur: cancel,
  };
}

function MidiSeek({
  locale,
  times = false,
}: {
  locale: Locale;
  times?: boolean;
}) {
  const state = useSyncExternalStore(midiPlayer.subscribe, midiPlayer.snapshot);
  const range = useMediaRange(
    Math.min(state.duration, state.position),
    (value) => void midiPlayer.seek(value).catch(() => undefined),
  );
  const input = (
    <input
      aria-label={translate(locale, "media.positionMidi")}
      type="range"
      min="0"
      max={Math.max(0.01, state.duration)}
      step="0.1"
      {...range}
      disabled={state.status === "loading"}
    />
  );
  return times ? (
    <div className="media-seek-time">
      <span>{formatDuration(range.value)}</span>
      {input}
      <span>{formatDuration(state.duration)}</span>
    </div>
  ) : (
    <label className="media-progress">{input}</label>
  );
}

export function MediaSurface({ locale }: { locale: Locale }) {
  const navigate = useNavigate();
  const snapshot = useSyncExternalStore(
    midiPlayer.subscribe,
    readMediaState,
    readMediaState,
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
  // gyschordweb mini-player parity: key/accidental mirror the hymn transpose
  // state; the displayed key is derived from the current transpose offset.
  const [keyAccidental, setKeyAccidental] = useState<"sharp" | "flat">(
    () =>
      (readPreference("gys-hymn-accidental") as "sharp" | "flat") ?? "sharp",
  );
  useEffect(() => {
    writePreference("gys-hymn-accidental", keyAccidental);
  }, [keyAccidental]);
  const [tempoOpen, setTempoOpen] = useState(false);
  const tempoRange = useMediaRange(
    snapshot.tempo,
    (value) => void midiPlayer.setTempo(value).catch(() => undefined),
  );
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
  const songMeta = useSyncExternalStore(subscribeHymnPdfMeta, () =>
    snapshot.songId ? getHymnPdfMeta(snapshot.songId) : undefined,
  );
  const sourceKey = songMeta?.keySemitone ?? 0;
  const keyIndex = (((sourceKey + snapshot.transpose) % 12) + 12) % 12;
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
    if (snapshot.songId)
      navigate(`/kidung/${encodeURIComponent(snapshot.songId)}?mode=lyrics`);
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
  const activeSpeechVoice = speechSnapshot.voices.find(
    (voice) => voice.id === speechSnapshot.activeVoiceId,
  );
  const speechProviderLabel =
    speechSnapshot.providerId === "edge-compatibility"
      ? translate(locale, "bible.edgeOnlineTts")
      : speechSnapshot.providerId === "browser-system"
        ? (activeSpeechVoice?.local ?? speechSnapshot.offline)
          ? translate(locale, "media.localTts")
          : translate(locale, "media.systemTts")
        : speechSnapshot.engine === "edge"
          ? translate(locale, "bible.edgeOnlineTts")
          : speechSnapshot.engine === "local"
            ? translate(locale, "media.localTts")
            : translate(locale, "media.speechBible");
  const surfaceRef = useRef<HTMLElement>(null);
  const transitionRect = useRef<DOMRect | undefined>(undefined);
  const animationRef = useRef<Animation | undefined>(undefined);
  const [minimized, setMinimized] = useState(
    () => readPreference("gys-media-minimized") !== "0",
  );
  const [edge, setEdge] = useState<{ side: "left" | "right"; y: number }>(
    () => {
      try {
        const saved = JSON.parse(
          localStorage.getItem("gys-midi-edge") ?? "null",
        );
        if (
          (saved?.side === "left" || saved?.side === "right") &&
          Number.isFinite(saved.y)
        )
          return { side: saved.side, y: Math.max(0, Math.min(1, saved.y)) };
      } catch {
        /* Use the default edge for a missing or malformed preference. */
      }
      return { side: "left", y: 0.55 };
    },
  );
  const drag = useRef<
    { id: number; dx: number; dy: number; x: number; y: number } | undefined
  >(undefined);
  useEffect(() => {
    writePreference("gys-midi-edge", JSON.stringify(edge));
  }, [edge]);
  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !surfaceRef.current) return;
    const rect = surfaceRef.current.getBoundingClientRect();
    animationRef.current?.cancel();
    drag.current = {
      id: event.pointerId,
      dx: event.clientX - rect.left,
      dy: event.clientY - rect.top,
      x: rect.left,
      y: rect.top,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  const moveDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    const surface = surfaceRef.current;
    if (!current || current.id !== event.pointerId || !surface) return;
    current.x = Math.max(
      0,
      Math.min(
        window.innerWidth - surface.offsetWidth,
        event.clientX - current.dx,
      ),
    );
    current.y = Math.max(
      8,
      Math.min(
        window.innerHeight - surface.offsetHeight - 8,
        event.clientY - current.dy,
      ),
    );
    surface.style.setProperty("--edge-drag-x", `${current.x}px`);
    surface.style.setProperty("--edge-drag-y", `${current.y}px`);
    surface.classList.add("is-edge-dragging");
  };
  const finishDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    const surface = surfaceRef.current;
    if (!current || current.id !== event.pointerId || !surface) return;
    transitionRect.current = surface.getBoundingClientRect();
    drag.current = undefined;
    surface.classList.remove("is-edge-dragging");
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    setEdge({
      side:
        current.x + surface.offsetWidth / 2 < window.innerWidth / 2
          ? "left"
          : "right",
      y: (current.y + surface.offsetHeight / 2) / window.innerHeight,
    });
  };
  const [sidebarBounds, setSidebarBounds] = useState({ left: 12, width: 232 });
  const toggleDock = () => {
    transitionRect.current = surfaceRef.current?.getBoundingClientRect();
    animationRef.current?.cancel();
    setMinimized((value) => !value);
  };
  useEffect(() => {
    const syncPreference = () =>
      setMinimized(readPreference("gys-media-minimized") !== "0");
    window.addEventListener("gys-media-preference-change", syncPreference);
    return () =>
      window.removeEventListener("gys-media-preference-change", syncPreference);
  }, []);
  useEffect(() => {
    writePreference("gys-media-minimized", minimized ? "1" : "0");
  }, [minimized]);
  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface || minimized || !isKidungMedia) return;
    const measure = () =>
      document.documentElement.style.setProperty(
        "--reader-media-space",
        `${surface.offsetHeight + 20}px`,
      );
    const observer = new ResizeObserver(measure);
    observer.observe(surface);
    measure();
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--reader-media-space");
    };
  }, [minimized, isKidungMedia]);
  useLayoutEffect(() => {
    const anchor = document.querySelector<HTMLElement>(".sidebar-media-anchor");
    if (!anchor) return;
    const measure = () => {
      const rect = anchor.getBoundingClientRect();
      setSidebarBounds({ left: rect.left, width: rect.width });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(anchor);
    measure();
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    const previous = transitionRect.current;
    transitionRect.current = undefined;
    if (
      !surface ||
      !previous ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const next = surface.getBoundingClientRect();
    animationRef.current = surface.animate(
      [
        {
          transform: `translate(${previous.left - next.left}px, ${previous.top - next.top}px) scale(${previous.width / next.width}, ${previous.height / next.height})`,
        },
        { transform: "none" },
      ],
      { duration: 320, easing: "cubic-bezier(.2,.8,.2,1)" },
    );
    return () => animationRef.current?.cancel();
  }, [minimized, edge]);
  useEffect(() => {
    mediaSessionBridge.setSpeechActive(speechActive);
  }, [speechActive, speechSnapshot.status]);
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
            return speech.status === "paused"
              ? speechPlayer.resume()
              : speechPlayer.play();
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
        "previoustrack",
        () => {
          if (latestMediaKindRef.current === "speech")
            return speechPlayer.previous();
          return midiPlayer.getTime() > 2
            ? midiPlayer
                .seek(0)
                .then(() => midiPlayer.play())
                .catch(() => undefined)
            : playPreviousMidiPlaylistItem().catch(() => undefined);
        },
      ],
      [
        "nexttrack",
        () =>
          latestMediaKindRef.current === "speech"
            ? speechPlayer.next()
            : playNextMidiPlaylistItem().catch(() => undefined),
      ],
      [
        "seekbackward",
        (details) => {
          return latestMediaKindRef.current === "speech"
            ? undefined
            : midiPlayer.seek(
                Math.max(0, midiPlayer.getTime() - (details?.seekOffset ?? 10)),
              );
        },
      ],
      [
        "seekforward",
        (details) => {
          const midi = latestMidiRef.current;
          return latestMediaKindRef.current === "speech"
            ? undefined
            : midiPlayer.seek(
                Math.min(
                  midi.duration,
                  midiPlayer.getTime() + (details?.seekOffset ?? 10),
                ),
              );
        },
      ],
      [
        "seekto",
        (details) => {
          return latestMediaKindRef.current === "speech"
            ? undefined
            : midiPlayer.seek(details?.seekTime ?? midiPlayer.getTime());
        },
      ],
    ];
    for (const [action, handler] of handlers) {
      try {
        const seeking =
          action === "seekto" ||
          action === "seekbackward" ||
          action === "seekforward";
        navigator.mediaSession.setActionHandler(
          action,
          speechActive && seeking ? null : handler,
        );
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
  }, [
    hasMediaSession,
    mediaTitle,
    speechActive,
    speechSnapshot.status,
    snapshot.status,
  ]);
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
        <Select
          className="media-key-control"
          value={keyIndex}
          label={translate(locale, "media.keySelect")}
          options={Array.from({ length: 12 }, (_, value) => ({
            value,
            label: chordKeyName(value, keyAccidental),
          }))}
          onChange={(value) =>
            void midiPlayer
              .setTranspose(
                snapshot.transpose + transposeBetweenKeys(keyIndex, value),
              )
              .catch(() => undefined)
          }
        />
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
          aria-label={translate(locale, "media.tempoControl")}
          title={translate(locale, "media.tempoControl")}
        >
          <Icon name="tune" size={14} />
          <strong>{snapshot.tempo}</strong>
          <small>BPM</small>
        </button>
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
      {tempoOpen && (
        <div
          className="media-tempo-popover"
          role="group"
          aria-label={translate(locale, "media.tempoDialog")}
        >
          <input
            aria-label={translate(locale, "media.tempoInput")}
            type="range"
            min="30"
            max="220"
            step="1"
            {...tempoRange}
          />
          <span>{tempoRange.value} BPM</span>
        </div>
      )}
    </>
  );
  const secondaryControls = (
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
  );

  return (
    <aside
      id="persistent-media-player"
      ref={surfaceRef}
      className={`media-surface persistent-media${minimized ? " is-minimized" : ""}${isKidungMedia ? " is-kidung-media is-edge-player" : ""}${speechActive ? " is-speech-media" : ""}${sidebarBounds.width < 100 ? " is-rail-player" : ""}`}
      data-edge={edge.side}
      data-backend={
        speechActive
          ? (speechSnapshot.providerId ?? "speech")
          : snapshot.backend
      }
      style={
        {
          "--media-edge-y": edge.y,
          "--media-sidebar-left": `${sidebarBounds.left}px`,
          "--media-sidebar-width": `${sidebarBounds.width}px`,
        } as CSSProperties
      }
      aria-label={translate(locale, "shell.media")}
    >
      {isKidungMedia && minimized && (
        <button
          type="button"
          className="media-drag-handle"
          aria-label={translate(locale, "media.movePlayer")}
          title={translate(locale, "media.movePlayer")}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          onKeyDown={(event) => {
            if (
              ![
                "ArrowLeft",
                "ArrowRight",
                "ArrowUp",
                "ArrowDown",
                "Home",
                "End",
              ].includes(event.key)
            )
              return;
            event.preventDefault();
            transitionRect.current =
              surfaceRef.current?.getBoundingClientRect();
            setEdge((current) => ({
              side:
                event.key === "ArrowLeft"
                  ? "left"
                  : event.key === "ArrowRight"
                    ? "right"
                    : current.side,
              y:
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? 1
                    : Math.max(
                        0,
                        Math.min(
                          1,
                          current.y +
                            (event.key === "ArrowUp"
                              ? -0.05
                              : event.key === "ArrowDown"
                                ? 0.05
                                : 0),
                        ),
                      ),
            }));
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <circle cx="8" cy="6" r="1.5" />
            <circle cx="16" cy="6" r="1.5" />
            <circle cx="8" cy="12" r="1.5" />
            <circle cx="16" cy="12" r="1.5" />
            <circle cx="8" cy="18" r="1.5" />
            <circle cx="16" cy="18" r="1.5" />
          </svg>
        </button>
      )}
      <div className="media-art" aria-hidden="true">
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
            {speechActive ? (
              `${translate(locale, "nav.bible")} · ${Math.max(1, speechSnapshot.currentIndex + 1)}/${speechSnapshot.total}`
            ) : snapshot.status === "loading" ? (
              translate(locale, "media.loadingMidi", {
                percent: snapshot.loadingProgress,
              })
            ) : (
              <>
                MIDI · <MidiTimeCaption />
              </>
            )}
          </small>
        </button>
      )}
      <div className="media-main">
        <div className="media-meta">
          {isKidungMedia ? (
            <div className="media-meta-top">
              <small>MIDI</small>
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
              {speechActive ? (
                speechSnapshot.status === "error" ? (
                  (speechSnapshot.error ??
                  translate(locale, "media.speechError"))
                ) : speechSnapshot.currentIndex >= 0 ? (
                  translate(locale, "media.speechVerse", {
                    current: speechSnapshot.currentIndex + 1,
                    total: speechSnapshot.total,
                  })
                ) : (
                  translate(locale, "media.speechReady")
                )
              ) : (
                <MidiTimeCaption />
              )}
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
          <MidiSeek locale={locale} />
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
            {!isKidungMedia && (
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
            )}
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
                <MidiSeek locale={locale} times />
                {isKidungMedia ? (
                  <details className="media-advanced-controls">
                    <summary className="media-advanced-summary">
                      <span className="sr-only">
                        {translate(locale, "media.advanced")}
                      </span>
                      <Icon name="settings" size={16} />
                      <small>
                        {chordKeyName(keyIndex, keyAccidental)} ·{" "}
                        {snapshot.tempo} BPM
                      </small>
                    </summary>
                    <div className="media-advanced-panel">
                      <div className="media-utility-controls">
                        <label className="media-volume-control">
                          <span>{translate(locale, "media.volumeShort")}</span>
                          <input
                            aria-label={translate(
                              locale,
                              speechActive
                                ? "media.volumeSpeech"
                                : "media.volumeMidi",
                            )}
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={
                              speechActive
                                ? speechSnapshot.volume
                                : snapshot.volume
                            }
                            onChange={(event) =>
                              speechActive
                                ? speechPlayer.setVolume(
                                    Number(event.target.value),
                                  )
                                : void midiPlayer.setVolume(
                                    Number(event.target.value),
                                  )
                            }
                          />
                        </label>

                        {secondaryControls}
                      </div>
                      {midiAdvancedControls}
                      <button
                        className="media-queue-badge"
                        type="button"
                        onClick={() => navigate("/kidung?section=playlist")}
                        aria-label={`${translate(locale, "media.queueOpen")}${playlist.items.length ? ` · ${translate(locale, "media.queueSongCount", { count: playlist.items.length })}` : ""}`}
                        title={`${translate(locale, "media.queueTitle")}${playlist.items.length ? ` · ${playlist.items.length}` : ""}`}
                      >
                        <Icon name="queueMusic" size={14} />
                        <span>{translate(locale, "media.queueTitle")}</span>
                        <span aria-hidden="true">{playlist.items.length}</span>
                      </button>
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
          {(speechActive || playlist.items.length > 1) && (
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
                speechActive
                  ? speechSnapshot.currentIndex <= 0
                  : !canPlayPrevious
              }
            >
              <Icon name="skipPrevious" size={17} />
            </button>
          )}
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
          {(speechActive || playlist.items.length > 1) && (
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
          )}
        </div>
      ) : (
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
      )}
      {!minimized && !isKidungMedia && secondaryControls}
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
        onClick={toggleDock}
        aria-expanded={!minimized}
        aria-label={translate(
          locale,
          minimized ? "media.restore" : "media.minimize",
        )}
      >
        <Icon name={minimized ? "fullscreen" : "chevronDown"} size={16} />
      </button>
      {!speechActive && snapshot.status === "loading" && (
        <div
          className="media-load-track"
          role="progressbar"
          aria-label={translate(locale, "kidung.loadingMidi")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={snapshot.loadingProgress}
        >
          <span
            style={{
              transform: `scaleX(${Math.max(0.04, snapshot.loadingProgress / 100)})`,
            }}
          />
        </div>
      )}
    </aside>
  );
}

function formatDuration(value: number): string {
  const seconds = Math.max(0, Math.floor(value));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
