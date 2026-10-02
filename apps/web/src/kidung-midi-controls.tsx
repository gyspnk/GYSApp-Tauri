import { useSyncExternalStore } from "react";
import { translate, type Locale } from "./i18n.js";
import { midiPlayer } from "./midi-player.js";
import { GM_INSTRUMENTS, midiInstrumentLabel } from "./midi-instruments.js";
import { Icon } from "./icons.js";
import { applyAutoNextMode, getAutoNextMode } from "./midi-playlist.js";
import { formatMidiTime } from "./kidung-shared.js";

export function MidiControlsPanel({ locale }: { locale: Locale }) {
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
          <div className="hymn-midi-seekbar">
            <span className="hymn-midi-time hymn-midi-time-end">
              {formatMidiTime(midiState.position)}
            </span>
            <input
              className="hymn-midi-seek-input"
              type="range"
              min={0}
              max={midiState.duration}
              step={0.1}
              value={Math.min(midiState.position, midiState.duration)}
              onChange={(event) =>
                void midiPlayer
                  .seek(Number(event.target.value))
                  .catch(() => undefined)
              }
              aria-label={translate(locale, "media.positionMidi")}
            />
            <span className="hymn-midi-time">
              {formatMidiTime(midiState.duration)}
            </span>
          </div>
        )}
        {midiState.status === "loading" && (
          <div
            className="midi-preload-bar"
            role="progressbar"
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
            <option value={-1}>{midiInstrumentLabel(-1)}</option>
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
