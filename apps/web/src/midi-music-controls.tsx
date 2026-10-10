import { translate, type Locale } from "./i18n.js";
import { chordKeyName, transposeBetweenKeys } from "./chord-viewer.js";
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

/** Musical controls stay available without opening the utility menu. */
export function MidiMusicControls({
  locale,
  keyIndex,
  accidental,
  transpose,
  instrument,
}: {
  locale: Locale;
  keyIndex: number;
  accidental: "sharp" | "flat";
  transpose: number;
  instrument: number;
}) {
  return (
    <div className="media-music-controls">
      <Select
        className="media-instrument-control"
        label={translate(locale, "media.instrumentMidi")}
        value={instrument}
        options={instruments}
        onChange={(value) =>
          void midiPlayer.setInstrument(value).catch(() => undefined)
        }
      />
      <Select
        className="media-key-control"
        label={translate(locale, "media.keySelect")}
        value={keyIndex}
        options={Array.from({ length: 12 }, (_, value) => ({
          value,
          label: chordKeyName(value, accidental),
        }))}
        onChange={(value) => {
          let next = transpose + transposeBetweenKeys(keyIndex, value);
          if (next > 24) next -= 12;
          if (next < -24) next += 12;
          void midiPlayer.setTranspose(next).catch(() => undefined);
        }}
      />
      <div className="media-transpose" role="group" aria-label="Transpose">
        <button
          type="button"
          onClick={() =>
            void midiPlayer.setTranspose(transpose - 1).catch(() => undefined)
          }
          disabled={transpose <= -24}
          aria-label={translate(locale, "media.transposeDown")}
        >
          −
        </button>
        <strong
          key={transpose}
          className="media-transpose-value"
          aria-live="polite"
        >
          {transpose > 0 ? `+${transpose}` : transpose}
        </strong>
        <button
          type="button"
          onClick={() =>
            void midiPlayer.setTranspose(transpose + 1).catch(() => undefined)
          }
          disabled={transpose >= 24}
          aria-label={translate(locale, "media.transposeUp")}
        >
          +
        </button>
        <button
          type="button"
          className="media-transpose-reset"
          onClick={() => void midiPlayer.setTranspose(0).catch(() => undefined)}
          disabled={transpose === 0}
          aria-label={translate(locale, "kidung.resetTranspose")}
          title={translate(locale, "kidung.resetTranspose")}
        >
          <Icon name="repeat" size={17} />
        </button>
      </div>
    </div>
  );
}
