import { useSyncExternalStore } from "react";
import { translate, type Locale } from "./i18n.js";
import { midiPlayer } from "./midi-player.js";
import { GM_INSTRUMENTS } from "./midi-instruments.js";
import { Icon } from "./icons.js";
import { applyAutoNextMode, getAutoNextMode } from "./midi-playlist.js";
import { HymnMidiProgress } from "./kidung-midi-progress.js";
import { createSnapshotSelector } from "./snapshot-selector.js";

const readControlState = createSnapshotSelector(
  midiPlayer.snapshot,
  ({ position: _position, ...state }) => state,
);

export function MidiControlsPanel({ locale }: { locale: Locale }) {
  const midiSettings = useSyncExternalStore(
    midiPlayer.subscribeSettings,
    midiPlayer.settingsSnapshot,
    midiPlayer.settingsSnapshot,
  );
  const midiState = useSyncExternalStore(
    midiPlayer.subscribe,
    readControlState,
    readControlState,
  );
  const setTempo = (next: number) =>
    void midiPlayer.setTempo(next).catch(() => undefined);
  const isActive =
    midiState.status === "playing" ||
    midiState.status === "paused" ||
    midiState.status === "ready" ||
    midiState.status === "stopped";
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
  return (
    <div className="hymn-midi-controls-panel">
      <div className="hymn-midi-dock-row">
        <button
          type="button"
          className="hymn-midi-dock-play"
          onClick={() =>
            void (midiState.status === "playing"
              ? midiPlayer
                  .pause()
                  .then(() => undefined)
                  .catch(() => undefined)
              : midiPlayer
                  .play()
                  .then(() => undefined)
                  .catch(() => undefined))
          }
          disabled={!midiPlayer.getCurrentMidiUrl()}
          aria-label={
            midiState.status === "playing"
              ? translate(locale, "kidung.pauseMidi")
              : translate(locale, "kidung.playMidi")
          }
        >
          <Icon
            name={midiState.status === "playing" ? "pause" : "play"}
            size={18}
          />
        </button>
        {isActive && midiState.duration > 0 && (
          <HymnMidiProgress locale={locale} switching={false} />
        )}
        {midiState.status === "loading" && (
          <div
            className="midi-preload-bar"
            role="progressbar"
            aria-label={translate(locale, "kidung.loadingMidi")}
            aria-valuenow={midiState.loadingProgress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="midi-preload-fill"
              style={{ width: `${Math.max(4, midiState.loadingProgress)}%` }}
            />
          </div>
        )}
      </div>
      <div className="hymn-midi-dock-row">
        <label>
          <span>{translate(locale, "kidung.instrument")}</span>
          <select
            aria-label={translate(locale, "kidung.instrument")}
            value={midiSettings.instrument}
            onChange={(event) =>
              void midiPlayer
                .setInstrument(Number(event.target.value))
                .catch(() => undefined)
            }
          >
            {GM_INSTRUMENTS.map((name, program) => (
              <option key={program} value={program}>
                {String(program + 1).padStart(3, "0")} · {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{translate(locale, "kidung.tempo")}</span>
          <input
            type="number"
            min={30}
            max={220}
            value={midiSettings.tempo}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isFinite(value)) setTempo(value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter")
                (event.target as HTMLInputElement).blur();
            }}
            aria-label={translate(locale, "media.tempoInput")}
          />
          <span>BPM</span>
        </label>
        <label>
          <span>{translate(locale, "media.volumeShort")}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={midiState.muted ? 0 : midiState.volume}
            onChange={(event) =>
              void midiPlayer
                .setVolume(Number(event.target.value))
                .catch(() => undefined)
            }
            aria-label={translate(locale, "media.volumeMidi")}
          />
        </label>
        <button
          type="button"
          className="quiet-button hymn-midi-loop"
          onClick={cycleLoopMode}
          aria-pressed={midiLoopMode !== "off"}
          aria-label={translate(locale, "media.loopControl", {
            mode: loopLabel,
          })}
          title={translate(locale, "media.loopTitle", { mode: loopLabel })}
        >
          <Icon name="repeat" size={16} />
          <span className="hymn-loop-label">{loopLabel}</span>
        </button>
        <button
          type="button"
          className="quiet-button hymn-midi-mute"
          onClick={() =>
            void midiPlayer.setMuted(!midiState.muted).catch(() => undefined)
          }
          aria-label={translate(
            locale,
            midiState.muted ? "media.unmuteMidi" : "media.muteMidi",
          )}
          aria-pressed={midiState.muted}
          title={translate(
            locale,
            midiState.muted ? "media.unmuteMidi" : "media.muteMidi",
          )}
        >
          <Icon name={midiState.muted ? "volumeOff" : "volume"} size={16} />
        </button>
      </div>
    </div>
  );
}
