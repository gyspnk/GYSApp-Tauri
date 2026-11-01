import { useHymnNotation } from "./hymn-notation.js";
import { useLyricReflow } from "./lyric-reflow.js";
import { useGestureFont } from "./gesture-font.js";
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
import { ChordCapability, type ChordTextLine } from "./chord-viewer.js";
import { MidiMusicControls, MidiTempoStepper } from "./midi-music-controls.js";
import { midiPlayer } from "./midi-player.js";
import { Icon } from "./icons.js";
import { measureHymnFontFit } from "./hymn-autofit.js";
import { translate, type Locale } from "./i18n.js";
import type { HymnCatalogEntry } from "@gys/contracts";
import { createSnapshotSelector } from "./snapshot-selector.js";
import { getHymnPdfMeta } from "./hymn-pdf-meta.js";

const readLyricsMidiState = createSnapshotSelector(
  midiPlayer.snapshot,
  ({ position: _position, ...state }) => state,
);

function LyricsMidiProgress({ locale }: { locale: Locale }) {
  const state = useSyncExternalStore(midiPlayer.subscribe, midiPlayer.snapshot);
  return (
    <>
      <span className="lyrics-midi-label">
        {formatMidiTime(state.position)}
      </span>
      <input
        type="range"
        className="lyrics-seek"
        min={0}
        max={Math.max(0.01, state.duration)}
        step={0.1}
        value={Math.min(state.duration, state.position)}
        onChange={(event) =>
          void midiPlayer
            .seek(Number(event.target.value))
            .catch(() => undefined)
        }
        aria-label={translate(locale, "kidung.lyrics.songPosition")}
        disabled={state.status === "loading"}
      />
      <span className="lyrics-midi-label">
        {formatMidiTime(state.duration)}
      </span>
    </>
  );
}

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
  locale: Locale;
  item: HymnCatalogEntry;
  verses: string[];
  /** Resolve chord lines for a specific verse index so in-panel verse swipes
   * show that verse's chords (gyschordweb parity). */
  getChordLinesForVerse: (
    verseIndex: number,
  ) => Array<ChordTextLine | undefined>;
  initialVerseIndex?: number;
  transpose?: number;
  sourceKeyIndex?: number;
  chordTranspose?: number;
  onTransposeChange?: (value: number) => void;
  onNavigateSong: (delta: -1 | 1) => void;
  onClose: () => void;
};

/**
 * gyschordweb `#lyrics-panel` parity: a fullscreen lyrics reader with an
 * inline MIDI transport (play/seek), chord toggle, instrument/tempo/key/
 * transpose controls, font and line-spacing steppers, and swipe gestures.
 */
export function LyricsPanel({
  locale,
  item,
  verses,
  getChordLinesForVerse,
  initialVerseIndex = 0,
  transpose: readerTranspose,
  sourceKeyIndex: readerSourceKey,
  chordTranspose,
  onTransposeChange,
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
    readBoolean(HEADER_COLLAPSED_KEY, true),
  );
  const [accidental, setAccidental] = useHymnNotation();
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
  const manualFont = useRef(false);
  const gestureFont = useGestureFont(verseTextRef);
  const gestureTarget = useRef<HTMLElement | null>(null);
  const controlsToggle = useRef<HTMLButtonElement>(null);

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

  const midiSettings = useSyncExternalStore(
    midiPlayer.subscribeSettings,
    midiPlayer.settingsSnapshot,
    midiPlayer.settingsSnapshot,
  );
  const midiState = useSyncExternalStore(
    midiPlayer.subscribe,
    readLyricsMidiState,
    readLyricsMidiState,
  );
  const safeVerseIndex = Math.min(verseIndex, Math.max(0, verses.length - 1));
  useLyricReflow(verseTextRef, `${item.id}-${safeVerseIndex}`);
  useEffect(() => {
    setIsPinching(false);
    return () => {
      gestureFont.cancel();
      const ids = [...gesturePointers.current.keys()];
      gesturePointers.current.clear();
      pinchStart.current = undefined;
      swipeStart.current = undefined;
      for (const id of ids) {
        if (gestureTarget.current?.hasPointerCapture(id))
          gestureTarget.current.releasePointerCapture(id);
      }
      gestureTarget.current = null;
    };
  }, [item.id, safeVerseIndex]);

  const verseLines = (verses[safeVerseIndex] ?? "").split("\n");
  const sourceKey =
    readerSourceKey ?? getHymnPdfMeta(item.id)?.keySemitone ?? 0;
  const displayedTranspose = readerTranspose ?? midiSettings.transpose;
  const keyIndex = (((sourceKey + displayedTranspose) % 12) + 12) % 12;

  // Autofit: reduce the preferred font size until the verse fits both the
  // width and the height of the content area. Refits on resize, visualViewport
  // and font load (gyschordweb v9).
  useLayoutEffect(() => {
    const element = verseTextRef.current;
    if (!element) return;
    let frame = 0;
    let disposed = false;
    const measure = () => {
      frame = 0;
      if (disposed || pinchStart.current) return;
      element.style.lineHeight = String(lineSpacing);
      const parent = element.closest(".lyrics-content") as HTMLElement | null;
      const next = manualFont.current
        ? fontSize
        : measureHymnFontFit(
            element,
            fontSize,
            parent ? parent.clientHeight - 12 : element.clientHeight,
            lastFitRef.current,
          );
      lastFitRef.current = next;
      setFitFontSize(next);
    };
    const schedule = () => {
      if (disposed || frame || pinchStart.current) return;
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
      disposed = true;
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
    gestureTarget.current = event.currentTarget;
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
          base: fitFontSize,
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
    gestureFont.queue(Math.round(next * 10) / 10);
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!gesturePointers.current.has(event.pointerId)) return;
    const cancelled = event.type !== "pointerup";
    if (cancelled) {
      const ids = [...gesturePointers.current.keys()];
      gesturePointers.current.clear();
      for (const id of ids)
        if (event.currentTarget.hasPointerCapture(id))
          event.currentTarget.releasePointerCapture(id);
    }

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
        const base = pinchStart.current?.base;
        const size = cancelled ? undefined : gestureFont.finish();
        if (cancelled) {
          gestureFont.cancel();
          if (verseTextRef.current && base !== undefined)
            verseTextRef.current.style.fontSize = `${base / 16}rem`;
        }
        pinchStart.current = undefined;
        setIsPinching(false);
        if (size !== undefined) {
          manualFont.current = true;
          setFitFontSize(size);
          setFontSize(size);
        }
      }
      return;
    }
    swipeStart.current = undefined;
    if (!start || cancelled) return;
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
    return getChordLinesForVerse(safeVerseIndex) ?? [];
  }, [getChordLinesForVerse, safeVerseIndex]);

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
      aria-label={translate(locale, "kidung.lyrics.mode")}
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
                aria-label={translate(locale, "kidung.lyrics.previousSong")}
                title={translate(locale, "kidung.lyrics.previousSong")}
              >
                <Icon name="skipPrevious" size={18} />
              </button>
              <button
                type="button"
                className="lyrics-hdr-btn lyrics-play-toggle"
                onClick={togglePlayback}
                aria-label={translate(
                  locale,
                  midiState.status === "playing"
                    ? "kidung.lyrics.pause"
                    : "kidung.lyrics.play",
                )}
                disabled={!midiPlayer.getCurrentMidiUrl()}
              >
                <Icon
                  name={midiState.status === "playing" ? "pause" : "play"}
                  size={18}
                />
              </button>
              <LyricsMidiProgress locale={locale} />
              <button
                type="button"
                className="lyrics-hdr-btn"
                onClick={() => onNavigateSong(1)}
                aria-label={translate(locale, "kidung.lyrics.nextSong")}
                title={translate(locale, "kidung.lyrics.nextSong")}
              >
                <Icon name="skipNext" size={18} />
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
                aria-label={translate(
                  locale,
                  showChords
                    ? "kidung.lyrics.hideChords"
                    : "kidung.lyrics.showChords",
                )}
                title={translate(
                  locale,
                  showChords
                    ? "kidung.lyrics.hideChords"
                    : "kidung.lyrics.showChords",
                )}
              >
                <Icon name="chord" size={16} />
              </button>
              <button
                type="button"
                className="lyrics-ctrl-btn"
                onClick={onClose}
                aria-label={translate(locale, "kidung.lyrics.close")}
                title={translate(locale, "kidung.lyrics.close")}
              >
                <Icon name="cross" size={16} />
              </button>
              <button
                type="button"
                className="lyrics-ctrl-btn"
                ref={controlsToggle}
                onClick={() => setHeaderCollapsed((current) => !current)}
                aria-expanded={!headerCollapsed}
                aria-label={translate(
                  locale,
                  headerCollapsed
                    ? "kidung.lyrics.showControls"
                    : "kidung.lyrics.hideControls",
                )}
                title={translate(
                  locale,
                  headerCollapsed
                    ? "kidung.lyrics.showControls"
                    : "kidung.lyrics.hideControls",
                )}
              >
                <Icon name="settings" size={16} />
              </button>
            </div>
          </div>
          {!headerCollapsed && (
            <div
              className="lyrics-extra"
              onKeyDown={(event) => {
                if (event.key !== "Escape") return;
                event.preventDefault();
                event.stopPropagation();
                setHeaderCollapsed(true);
                controlsToggle.current?.focus({ preventScroll: true });
              }}
            >
              <h3 className="media-panel-heading">
                {translate(locale, "media.musicGroup")}
              </h3>
              <MidiMusicControls
                locale={locale}
                keyIndex={keyIndex}
                accidental={accidental}
                transpose={displayedTranspose}
                {...(onTransposeChange ? { onTransposeChange } : {})}
                instrument={midiSettings.instrument}
                surface="fullscreen"
              />
              <MidiTempoStepper locale={locale} tempo={midiSettings.tempo} />
              <h3 className="media-panel-heading">
                {translate(locale, "kidung.textSettings")}
              </h3>
              <div className="lyrics-text-line">
                <button
                  type="button"
                  className="lyrics-ctrl-btn"
                  onClick={() => {
                    manualFont.current = true;
                    setFontSize((current) => Math.max(14, current - 4));
                  }}
                  aria-label={translate(locale, "kidung.lyrics.decreaseFont")}
                  title={translate(locale, "kidung.lyrics.decreaseFont")}
                >
                  <Icon name="textDecrease" size={16} />
                </button>
                <button
                  type="button"
                  className="lyrics-ctrl-btn"
                  onClick={() => {
                    manualFont.current = true;
                    setFontSize((current) => Math.min(72, current + 4));
                  }}
                  aria-label={translate(locale, "kidung.lyrics.increaseFont")}
                  title={translate(locale, "kidung.lyrics.increaseFont")}
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
                  aria-label={translate(
                    locale,
                    "kidung.lyrics.decreaseSpacing",
                  )}
                  title={translate(locale, "kidung.lyrics.decreaseSpacing")}
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
                  aria-label={translate(
                    locale,
                    "kidung.lyrics.increaseSpacing",
                  )}
                  title={translate(locale, "kidung.lyrics.increaseSpacing")}
                >
                  <Icon name="lineWeight" size={16} />
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
          onLostPointerCapture={onPointerEnd}
          onWheel={onWheel}
        >
          <div className="lyrics-verse-container">
            <div
              ref={verseTextRef}
              className={`lyrics-verse-text${showChords ? " lyrics-chords-on" : ""}${isPinching ? " is-pinching" : ""}`}
              style={{
                fontSize: `${fitFontSize / 16}rem`,
                lineHeight: lineSpacing,
              }}
            >
              {verseLines.map((line, index) => {
                const chordLine = chordLinesForVerse[index];
                return (
                  <p key={`${index}-${line}`}>
                    <ChordCapability
                      lines={[
                        chordLine ?? { text: line || "\u00A0", chords: [] },
                      ]}
                      active={showChords}
                      transpose={chordTranspose ?? displayedTranspose}
                      accidental={accidental}
                      locale={locale}
                    />
                  </p>
                );
              })}
            </div>
          </div>
        </div>
        <div className="lyrics-verse-footer">
          <button
            type="button"
            className="lyrics-ctrl-btn lyrics-verse-nav"
            onClick={() => setVerseIndex((current) => Math.max(0, current - 1))}
            disabled={safeVerseIndex === 0}
            aria-label={translate(locale, "kidung.lyrics.previousVerse")}
            title={translate(locale, "kidung.lyrics.previousVerse")}
          >
            <Icon name="chevronLeft" size={16} />
          </button>
          <span className="lyrics-verse-indicator">
            {translate(locale, "kidung.lyrics.verseCount", {
              current: safeVerseIndex + 1,
              total: verses.length,
            })}
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
            aria-label={translate(locale, "kidung.lyrics.nextVerse")}
            title={translate(locale, "kidung.lyrics.nextVerse")}
          >
            <Icon name="chevronRight" size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
