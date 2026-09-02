import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import {
  chordKeyName,
  transposeBetweenKeys,
  ChordCapability,
  type ChordTextLine,
} from "./chord-viewer.js";
import { GM_INSTRUMENTS, midiInstrumentLabel } from "./midi-instruments.js";
import { midiPlayer } from "./midi-player.js";
import { Icon } from "./icons.js";
import { autoFitFontSize } from "./hymn-autofit.js";
import type { HymnCatalogEntry } from "@gys/contracts";

const FONT_SIZE_KEY = "gys-lyrics-font-size";
const LINE_SPACING_KEY = "gys-lyrics-line-spacing";
const SHOW_CHORDS_KEY = "gys-lyrics-show-chords";
const HEADER_COLLAPSED_KEY = "gys-lyrics-header-collapsed";

const DEFAULT_FONT_SIZE = 28;
const DEFAULT_LINE_SPACING = 1.8;

function readNumber(key: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    const value = raw === null ? NaN : Number(raw);
    return Number.isFinite(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function readBoolean(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : raw === "1";
  } catch {
    return fallback;
  }
}

function writeValue(key: string, value: string | number | boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Storage failures must not break the reader.
  }
}

function formatMidiTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds || 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export type LyricsPanelProps = {
  item: HymnCatalogEntry;
  verses: string[];
  /** Resolve chord lines for a specific verse index so in-panel verse swipes
   * show that verse's chords (gyschordweb parity). */
  getChordLinesForVerse: (
    verseIndex: number,
  ) => Array<ChordTextLine | undefined>;
  initialVerseIndex?: number;
  onNavigateSong: (delta: -1 | 1) => void;
  onClose: () => void;
};

/**
 * gyschordweb `#lyrics-panel` parity: a fullscreen lyrics reader with an
 * inline MIDI transport (play/seek), chord toggle, instrument/tempo/key/
 * transpose controls, font and line-spacing steppers, and swipe gestures.
 */
export function LyricsPanel({
  item,
  verses,
  getChordLinesForVerse,
  initialVerseIndex = 0,
  onNavigateSong,
  onClose,
}: LyricsPanelProps) {
  const [verseIndex, setVerseIndex] = useState(() =>
    Math.max(0, Math.min(initialVerseIndex, Math.max(0, verses.length - 1))),
  );
  const [fontSize, setFontSize] = useState(() =>
    readNumber(FONT_SIZE_KEY, DEFAULT_FONT_SIZE),
  );
  const [lineSpacing, setLineSpacing] = useState(() =>
    readNumber(LINE_SPACING_KEY, DEFAULT_LINE_SPACING),
  );
  const [showChords, setShowChords] = useState(() =>
    readBoolean(SHOW_CHORDS_KEY, true),
  );
  const [headerCollapsed, setHeaderCollapsed] = useState(() =>
    readBoolean(HEADER_COLLAPSED_KEY, false),
  );
  const [keyMenuOpen, setKeyMenuOpen] = useState(false);
  const [accidental, setAccidental] = useState<"sharp" | "flat">(
    () =>
      (window.localStorage.getItem("gys-hymn-accidental") as
        "sharp" | "flat") ?? "sharp",
  );
  const [fitFontSize, setFitFontSize] = useState(fontSize);
  const [isPinching, setIsPinching] = useState(false);
  const verseTextRef = useRef<HTMLDivElement>(null);
  const gesturePointers = useRef(new Map<number, { x: number; y: number }>());
  const swipeStart = useRef<{ x: number; y: number; time: number } | undefined>(
    undefined,
  );
  const pinchStart = useRef<{ distance: number; base: number } | undefined>(
    undefined,
  );
  const lastFitRef = useRef(0);

  useEffect(() => {
    writeValue(FONT_SIZE_KEY, fontSize);
  }, [fontSize]);
  useEffect(() => {
    writeValue(LINE_SPACING_KEY, lineSpacing);
  }, [lineSpacing]);
  useEffect(() => {
    writeValue(SHOW_CHORDS_KEY, showChords ? 1 : 0);
  }, [showChords]);
  useEffect(() => {
    writeValue(HEADER_COLLAPSED_KEY, headerCollapsed ? 1 : 0);
  }, [headerCollapsed]);
  useEffect(() => {
    window.localStorage.setItem("gys-hymn-accidental", accidental);
  }, [accidental]);

  const midiSettings = useSyncExternalStore(
    midiPlayer.subscribeSettings,
    midiPlayer.settingsSnapshot,
    midiPlayer.settingsSnapshot,
  );
  const midiState = useSyncExternalStore(
    midiPlayer.subscribe,
    midiPlayer.snapshot,
    midiPlayer.snapshot,
  );
  const safeVerseIndex = Math.min(verseIndex, Math.max(0, verses.length - 1));
  const verseLines = (verses[safeVerseIndex] ?? "").split("\n");
  const keyIndex = ((midiSettings.transpose % 12) + 12) % 12;

  // Autofit: reduce the preferred font size until the verse fits both the
  // width and the height of the content area. Refits on resize, visualViewport
  // and font load (gyschordweb v9).
  useLayoutEffect(() => {
    const element = verseTextRef.current;
    if (!element) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      element.style.fontSize = `${fontSize}px`;
      element.style.lineHeight = String(lineSpacing);
      const parent = element.closest(".lyrics-content") as HTMLElement | null;
      const next = autoFitFontSize({
        preferredFontSize: fontSize,
        availableWidth: element.clientWidth,
        measuredWidth: element.scrollWidth,
        ...(parent
          ? {
              availableHeight: parent.clientHeight - 12,
              measuredHeight: parent.scrollHeight,
            }
          : {}),
        lastFittedFontSize: lastFitRef.current,
      });
      lastFitRef.current = next;
      element.style.fontSize = `${next}px`;
      setFitFontSize(next);
    };
    const schedule = () => {
      if (frame) return;
      frame =
        typeof window.requestAnimationFrame === "function"
          ? window.requestAnimationFrame(measure)
          : window.setTimeout(measure, 0);
    };
    schedule();
    const observer =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(schedule)
        : undefined;
    observer?.observe(element);
    window.addEventListener("resize", schedule, { passive: true });
    window.visualViewport?.addEventListener("resize", schedule, {
      passive: true,
    });
    document.fonts?.ready?.then(schedule).catch(() => undefined);
    return () => {
      observer?.disconnect();
      if (frame) {
        if (typeof window.cancelAnimationFrame === "function")
          window.cancelAnimationFrame(frame);
        else window.clearTimeout(frame);
      }
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
    };
  }, [fontSize, lineSpacing, safeVerseIndex, showChords]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") return;
    gesturePointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic tests do not register a native pointer.
    }
    if (gesturePointers.current.size === 1) {
      swipeStart.current = {
        x: event.clientX,
        y: event.clientY,
        time: Date.now(),
      };
    } else if (gesturePointers.current.size === 2) {
      const [first, second] = [...gesturePointers.current.values()];
      if (first && second) {
        pinchStart.current = {
          distance: Math.hypot(second.x - first.x, second.y - first.y),
          base: fontSize,
        };
      }
      swipeStart.current = undefined;
      setIsPinching(true);
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!gesturePointers.current.has(event.pointerId)) return;
    gesturePointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    const pinch = pinchStart.current;
    if (!pinch || gesturePointers.current.size < 2) return;
    const [first, second] = [...gesturePointers.current.values()];
    if (!first || !second || pinch.distance <= 0) return;
    event.preventDefault();
    const distance = Math.hypot(second.x - first.x, second.y - first.y);
    const next = Math.max(
      14,
      Math.min(72, pinch.base * (distance / pinch.distance)),
    );
    setFontSize(Math.round(next * 10) / 10);
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const wasPinching = Boolean(pinchStart.current);
    const start = swipeStart.current;
    gesturePointers.current.delete(event.pointerId);
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer already released.
    }
    if (wasPinching) {
      if (gesturePointers.current.size < 2) {
        pinchStart.current = undefined;
        setIsPinching(false);
      }
      return;
    }
    swipeStart.current = undefined;
    if (!start) return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (
      Math.abs(deltaX) >= 56 &&
      Math.abs(deltaX) > Math.abs(deltaY) * 1.35 &&
      Date.now() - start.time < 650
    ) {
      onNavigateSong(deltaX < 0 ? 1 : -1);
      return;
    }
    if (Math.abs(deltaY) >= 56 && Date.now() - start.time < 650) {
      const target = safeVerseIndex + (deltaY > 0 ? -1 : 1);
      if (target >= 0 && target < verses.length) setVerseIndex(target);
    }
  };

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (Math.abs(event.deltaY) > 30) {
      const target = safeVerseIndex + (event.deltaY > 0 ? 1 : -1);
      if (target >= 0 && target < verses.length) {
        event.preventDefault();
        setVerseIndex(target);
      }
    }
  };

  const chordLinesForVerse = useMemo(() => {
    if (!showChords) return [];
    return getChordLinesForVerse(safeVerseIndex) ?? [];
  }, [getChordLinesForVerse, safeVerseIndex, showChords]);

  const togglePlayback = () => {
    void (
      midiState.status === "playing" ? midiPlayer.pause() : midiPlayer.play()
    ).catch(() => undefined);
  };

  return (
    <div
      className="lyrics-panel"
      role="dialog"
      aria-modal="true"
      aria-label="Mode lirik"
    >
      <div className="lyrics-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="lyrics-inner">
        <header
          className={`lyrics-header${headerCollapsed ? " is-collapsed" : ""}`}
        >
          <div className="lyrics-main-line">
            <div className="lyrics-transport">
              <button
                type="button"
                className="lyrics-hdr-btn"
                onClick={() => onNavigateSong(-1)}
                aria-label="Lagu sebelumnya"
                title="Lagu sebelumnya"
              >
                <Icon name="skipPrevious" size={17} />
              </button>
              <button
                type="button"
                className="lyrics-hdr-btn lyrics-play-toggle"
                onClick={togglePlayback}
                aria-label={midiState.status === "playing" ? "Jeda" : "Putar"}
                disabled={!midiPlayer.getCurrentMidiUrl()}
              >
                <Icon
                  name={midiState.status === "playing" ? "pause" : "play"}
                  size={17}
                />
              </button>
              <span className="lyrics-midi-label">
                {formatMidiTime(midiState.position)}
              </span>
              <input
                type="range"
                className="lyrics-seek"
                min={0}
                max={Math.max(0.01, midiState.duration)}
                step={0.1}
                value={Math.min(midiState.duration, midiState.position)}
                onChange={(event) =>
                  void midiPlayer
                    .seek(Number(event.target.value))
                    .catch(() => undefined)
                }
                aria-label="Posisi lagu"
              />
              <span className="lyrics-midi-label">
                {formatMidiTime(midiState.duration)}
              </span>
              <button
                type="button"
                className="lyrics-hdr-btn"
                onClick={() => onNavigateSong(1)}
                aria-label="Lagu berikutnya"
                title="Lagu berikutnya"
              >
                <Icon name="skipNext" size={17} />
              </button>
            </div>
            <div className="lyrics-title">
              <span className="lyrics-song-number">
                {String(item.number).padStart(3, "0")} ·
              </span>
              <h2>{item.title}</h2>
            </div>
            <div className="lyrics-header-actions">
              <button
                type="button"
                className={`lyrics-ctrl-btn${showChords ? " is-active" : ""}`}
                onClick={() => setShowChords((current) => !current)}
                aria-pressed={showChords}
                aria-label={
                  showChords ? "Sembunyikan chord" : "Tampilkan chord"
                }
                title={showChords ? "Sembunyikan chord" : "Tampilkan chord"}
              >
                <Icon name="music" size={16} />
              </button>
              <button
                type="button"
                className="lyrics-ctrl-btn"
                onClick={onClose}
                aria-label="Tutup lirik"
                title="Tutup lirik"
              >
                <Icon name="cross" size={16} />
              </button>
              <button
                type="button"
                className="lyrics-ctrl-btn"
                onClick={() => setHeaderCollapsed((current) => !current)}
                aria-expanded={!headerCollapsed}
                aria-label={
                  headerCollapsed
                    ? "Tampilkan kontrol lain"
                    : "Sembunyikan kontrol lain"
                }
                title={
                  headerCollapsed
                    ? "Tampilkan kontrol lain"
                    : "Sembunyikan kontrol lain"
                }
              >
                <Icon name="tune" size={16} />
              </button>
            </div>
          </div>
          {!headerCollapsed && (
            <div className="lyrics-extra">
              <div className="lyrics-tune-line">
                <label className="lyrics-midi-group">
                  <span className="sr-only">Instrumen</span>
                  <select
                    className="lyrics-instrument-select"
                    value={midiSettings.instrument}
                    onChange={(event) =>
                      void midiPlayer
                        .setInstrument(Number(event.target.value))
                        .catch(() => undefined)
                    }
                    aria-label="Pilih alat musik"
                  >
                    <option value={-1}>{midiInstrumentLabel(-1)}</option>
                    {GM_INSTRUMENTS.map((name, program) => (
                      <option key={program} value={program}>
                        {String(program + 1).padStart(3, "0")} · {name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="lyrics-midi-group">
                  <button
                    type="button"
                    className="lyrics-hdr-btn"
                    onClick={() =>
                      void midiPlayer.setTempo(midiSettings.tempo - 2)
                    }
                    aria-label="Kurangi tempo"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    className="lyrics-tempo-input"
                    min={30}
                    max={220}
                    value={midiSettings.tempo}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (Number.isFinite(value))
                        void midiPlayer.setTempo(value);
                    }}
                    onBlur={(event) => {
                      const value = Number(event.target.value);
                      if (!Number.isFinite(value))
                        void midiPlayer.setTempo(midiSettings.tempo);
                    }}
                    aria-label="Tempo dalam BPM"
                    title="Ketik tempo (BPM)"
                  />
                  <button
                    type="button"
                    className="lyrics-hdr-btn"
                    onClick={() =>
                      void midiPlayer.setTempo(midiSettings.tempo + 2)
                    }
                    aria-label="Tambah tempo"
                  >
                    +
                  </button>
                </div>
                <div className="lyrics-midi-group lyrics-key-group">
                  <button
                    type="button"
                    className="lyrics-hdr-btn lyrics-key-btn"
                    onClick={() => setKeyMenuOpen((open) => !open)}
                    aria-haspopup="listbox"
                    aria-expanded={keyMenuOpen}
                    aria-label="Pilih nada dasar"
                  >
                    {chordKeyName(keyIndex, accidental)}
                  </button>
                  {keyMenuOpen && (
                    <div className="lyrics-key-dropdown" role="listbox">
                      {Array.from({ length: 12 }, (_, value) => (
                        <button
                          key={value}
                          type="button"
                          role="option"
                          aria-selected={value === keyIndex}
                          className={
                            value === keyIndex ? "is-selected" : undefined
                          }
                          onClick={() => {
                            void midiPlayer
                              .setTranspose(
                                transposeBetweenKeys(keyIndex, value),
                              )
                              .catch(() => undefined);
                            setKeyMenuOpen(false);
                          }}
                        >
                          {chordKeyName(value, accidental)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="lyrics-midi-group">
                  <button
                    type="button"
                    className="lyrics-hdr-btn"
                    onClick={() =>
                      void midiPlayer.setTranspose(midiSettings.transpose - 1)
                    }
                    aria-label="Turunkan nada"
                  >
                    <Icon name="south" size={15} />
                  </button>
                  <span className="lyrics-transpose-label">
                    {midiSettings.transpose > 0
                      ? `+${midiSettings.transpose}`
                      : midiSettings.transpose}
                  </span>
                  <button
                    type="button"
                    className="lyrics-hdr-btn"
                    onClick={() =>
                      void midiPlayer.setTranspose(midiSettings.transpose + 1)
                    }
                    aria-label="Naikkan nada"
                  >
                    <Icon name="north" size={15} />
                  </button>
                </div>
              </div>
              <div className="lyrics-text-line">
                <button
                  type="button"
                  className="lyrics-ctrl-btn"
                  onClick={() =>
                    setFontSize((current) => Math.max(14, current - 4))
                  }
                  aria-label="Perkecil font"
                  title="Perkecil font"
                >
                  <Icon name="textDecrease" size={16} />
                </button>
                <button
                  type="button"
                  className="lyrics-ctrl-btn"
                  onClick={() =>
                    setFontSize((current) => Math.min(72, current + 4))
                  }
                  aria-label="Perbesar font"
                  title="Perbesar font"
                >
                  <Icon name="textIncrease" size={16} />
                </button>
                <button
                  type="button"
                  className="lyrics-ctrl-btn"
                  onClick={() =>
                    setLineSpacing((current) =>
                      Math.max(1, Math.round((current - 0.2) * 10) / 10),
                    )
                  }
                  aria-label="Rapatkan teks"
                  title="Rapatkan teks"
                >
                  <Icon name="formatLineSpacing" size={16} />
                </button>
                <button
                  type="button"
                  className="lyrics-ctrl-btn"
                  onClick={() =>
                    setLineSpacing((current) =>
                      Math.min(3.5, Math.round((current + 0.2) * 10) / 10),
                    )
                  }
                  aria-label="Renggangkan teks"
                  title="Renggangkan teks"
                >
                  <Icon name="lineWeight" size={16} />
                </button>
                <button
                  type="button"
                  className="lyrics-ctrl-btn lyrics-verse-nav"
                  onClick={() =>
                    setVerseIndex((current) => Math.max(0, current - 1))
                  }
                  disabled={safeVerseIndex === 0}
                  aria-label="Bait sebelumnya"
                  title="Bait sebelumnya"
                >
                  <Icon name="chevronLeft" size={15} />
                </button>
                <span className="lyrics-verse-indicator">
                  Bait {safeVerseIndex + 1} dari {verses.length}
                </span>
                <button
                  type="button"
                  className="lyrics-ctrl-btn lyrics-verse-nav"
                  onClick={() =>
                    setVerseIndex((current) =>
                      Math.min(verses.length - 1, current + 1),
                    )
                  }
                  disabled={safeVerseIndex >= verses.length - 1}
                  aria-label="Bait berikutnya"
                  title="Bait berikutnya"
                >
                  <Icon name="chevronRight" size={15} />
                </button>
              </div>
            </div>
          )}
        </header>
        <div
          className="lyrics-content"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onWheel={onWheel}
        >
          <div className="lyrics-verse-container">
            <div
              ref={verseTextRef}
              className={`lyrics-verse-text${showChords ? " lyrics-chords-on" : ""}${isPinching ? " is-pinching" : ""}`}
              style={{ fontSize: `${fitFontSize}px`, lineHeight: lineSpacing }}
            >
              {verseLines.map((line, index) => {
                const chordLine = showChords
                  ? chordLinesForVerse[index]
                  : undefined;
                return (
                  <p key={`${index}-${line}`}>
                    {chordLine && chordLine.chords.length > 0 ? (
                      <ChordCapability
                        lines={[chordLine]}
                        transpose={midiSettings.transpose}
                        accidental={accidental}
                      />
                    ) : (
                      line || "\u00A0"
                    )}
                  </p>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
