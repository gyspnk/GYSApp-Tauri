import { useSyncExternalStore } from "react";
import { midiPlayer } from "./midi-player.js";
import { formatMidiTime } from "./kidung-shared.js";
import { translate, type Locale } from "./i18n.js";

export function HymnMidiProgress({
  locale,
  switching,
}: {
  locale: Locale;
  switching: boolean;
}) {
  const midiState = useSyncExternalStore(
    midiPlayer.subscribe,
    midiPlayer.snapshot,
    midiPlayer.snapshot,
  );
  return (
    <div
      className="hymn-midi-seekbar"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        margin: "6px 0",
      }}
    >
      <span
        className="hymn-midi-time"
        style={{
          fontVariantNumeric: "tabular-nums",
          fontSize: "0.8rem",
          minWidth: 32,
          textAlign: "right",
        }}
      >
        {formatMidiTime(midiState.position)}
      </span>
      <input
        className="hymn-midi-seek-input"
        type="range"
        min={0}
        max={midiState.duration || 100}
        step={0.1}
        value={Math.min(midiState.position, midiState.duration || 100)}
        onChange={(event) => {
          const v = Number(event.target.value);
          if (Number.isFinite(v))
            void midiPlayer.seek(v).catch(() => undefined);
        }}
        style={{ flex: 1 }}
        aria-label={translate(locale, "media.positionMidi")}
        disabled={midiState.status === "loading" || switching}
      />
      <span
        className="hymn-midi-time"
        style={{
          fontVariantNumeric: "tabular-nums",
          fontSize: "0.8rem",
          minWidth: 32,
        }}
      >
        {formatMidiTime(midiState.duration)}
      </span>
    </div>
  );
}
