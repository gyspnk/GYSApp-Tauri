import { useEffect, useRef, useState } from "react";
import "./midi-player.css";
import { translate, type Locale } from "./i18n.js";
import { chordKeyName, transposeToKey } from "./chord-viewer.js";
import { GM_INSTRUMENTS } from "./midi-instruments.js";
import { midiPlayer } from "./midi-player.js";
import { Select } from "./select.js";
import { Icon } from "./icons.js";

const instruments = GM_INSTRUMENTS.map((label, value) => ({
  value,
  label,
  hint: String(value + 1).padStart(3, "0"),
  icon: "musicNote" as const,
}));

/** Quick taps step once; held pointers repeat the latest value and always clean up. */
function StepButton({
  onStep,
  disabled,
  label,
  children,
}: {
  onStep: () => void;
  disabled: boolean;
  label: string;
  children: string;
}) {
  const latest = useRef(onStep);
  latest.current = onStep;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const repeated = useRef(false);
  const stop = () => {
    if (timer.current !== undefined) clearTimeout(timer.current);
    timer.current = undefined;
  };
  useEffect(() => {
    const cancel = () => {
      stop();
      repeated.current = true;
    };
    window.addEventListener("blur", cancel);
    return () => {
      stop();
      window.removeEventListener("blur", cancel);
    };
  }, []);
  useEffect(() => {
    if (disabled) stop();
  }, [disabled]);
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={label}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        stop();
        repeated.current = false;
        const repeat = () => {
          repeated.current = true;
          latest.current();
          timer.current = setTimeout(repeat, 90);
        };
        timer.current = setTimeout(repeat, 400);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={() => {
        stop();
        repeated.current = true;
      }}
      onClick={(event) => {
        if (!repeated.current || event.detail === 0) latest.current();
      }}
    >
      {children}
    </button>
  );
}

/** Musical controls share the utility panel to keep the dock compact. */
export function MidiMusicControls({
  locale,
  keyIndex,
  accidental,
  transpose,
  instrument,
  surface = "dock",
  onTransposeChange = (value) =>
    void midiPlayer.setTranspose(value).catch(() => undefined),
}: {
  locale: Locale;
  keyIndex: number;
  accidental: "sharp" | "flat";
  transpose: number;
  instrument?: number | undefined;
  surface?: "dock" | "fullscreen" | "reader";
  onTransposeChange?: (value: number) => void;
}) {
  const fullscreen = surface === "fullscreen";
  const reader = surface === "reader";
  return (
    <div
      className="media-music-controls"
      role="group"
      aria-label={translate(locale, "media.musicGroup")}
    >
      {instrument !== undefined && (
        <Select
          className="media-instrument-control"
          label={
            reader
              ? translate(locale, "kidung.instrument")
              : fullscreen
                ? translate(locale, "kidung.lyrics.selectInstrument")
                : translate(locale, "media.instrumentMidi")
          }
          value={instrument}
          options={instruments}
          onChange={(value) =>
            void midiPlayer.setInstrument(value).catch(() => undefined)
          }
        />
      )}
      <Select
        className={`media-key-control${fullscreen ? " lyrics-key-select" : ""}`}
        label={
          reader
            ? translate(locale, "kidung.key")
            : fullscreen
              ? translate(locale, "kidung.lyrics.selectKey")
              : translate(locale, "media.keySelect")
        }
        value={keyIndex}
        options={Array.from({ length: 12 }, (_, value) => ({
          value,
          label: chordKeyName(value, accidental),
        }))}
        onChange={(value) =>
          onTransposeChange(transposeToKey(keyIndex, value, transpose))
        }
      />
      <div
        className={`media-transpose${reader ? " transpose-control" : ""}`}
        role="group"
        aria-label="Transpose"
      >
        <StepButton
          onStep={() => onTransposeChange(transpose - 1)}
          disabled={transpose <= -24}
          label={
            reader
              ? translate(locale, "kidung.transposeDown")
              : fullscreen
                ? translate(locale, "kidung.lyrics.transposeDown")
                : translate(locale, "media.transposeDown")
          }
        >
          −
        </StepButton>
        <strong
          key={transpose}
          className="media-transpose-value"
          aria-live="polite"
        >
          {transpose > 0 ? `+${transpose}` : transpose}
        </strong>
        <StepButton
          onStep={() => onTransposeChange(transpose + 1)}
          disabled={transpose >= 24}
          label={
            reader
              ? translate(locale, "kidung.transposeUp")
              : fullscreen
                ? translate(locale, "kidung.lyrics.transposeUp")
                : translate(locale, "media.transposeUp")
          }
        >
          +
        </StepButton>
        <button
          type="button"
          className="media-transpose-reset"
          onClick={() => onTransposeChange(0)}
          disabled={transpose === 0}
          aria-label={translate(locale, "kidung.resetTranspose")}
          title={translate(locale, "kidung.resetTranspose")}
        >
          <Icon name="reset" size={18} />
        </button>
      </div>
    </div>
  );
}

/** The same bounded editor is used by both player surfaces. */
export function MidiTempoStepper({
  locale,
  tempo,
  reader = false,
}: {
  locale: Locale;
  tempo: number;
  reader?: boolean;
}) {
  const [draft, setDraft] = useState(String(tempo));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setDraft(String(tempo));
  }, [tempo, editing]);
  const change = (value: number) =>
    void midiPlayer.setTempo(value).catch(() => undefined);
  return (
    <div
      className="midi-tempo-stepper"
      role="group"
      aria-label={
        reader
          ? translate(locale, "kidung.tempo")
          : translate(locale, "media.tempoControl")
      }
    >
      <StepButton
        disabled={tempo <= 30}
        onStep={() => change(Math.max(30, tempo - 2))}
        label={
          reader
            ? translate(locale, "kidung.tempoDown")
            : translate(locale, "kidung.lyrics.decreaseTempo")
        }
      >
        −
      </StepButton>
      <label>
        <input
          type="number"
          min={30}
          max={220}
          step={1}
          value={draft}
          aria-label={
            reader
              ? translate(locale, "media.tempoInput")
              : translate(locale, "kidung.lyrics.tempoBpm")
          }
          title={translate(locale, "kidung.lyrics.enterTempo")}
          onFocus={() => setEditing(true)}
          onChange={(event) => {
            const value = event.target.value;
            setDraft(value);
            const next = Number(value);
            if (
              value !== "" &&
              Number.isFinite(next) &&
              next >= 30 &&
              next <= 220
            )
              change(next);
          }}
          onBlur={() => {
            const next = Number(draft);
            if (draft !== "" && Number.isFinite(next))
              change(Math.max(30, Math.min(220, next)));
            else setDraft(String(tempo));
            setEditing(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setDraft(String(tempo));
            }
          }}
        />
        <span aria-hidden="true">BPM</span>
      </label>
      <StepButton
        disabled={tempo >= 220}
        onStep={() => change(Math.min(220, tempo + 2))}
        label={
          reader
            ? translate(locale, "kidung.tempoUp")
            : translate(locale, "kidung.lyrics.increaseTempo")
        }
      >
        +
      </StepButton>
    </div>
  );
}
