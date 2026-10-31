import { useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import { speechPlayer } from "./speech-player.js";
import { isEdgeSpeechConfigured } from "./edge-speech.js";
import { translate, type Locale } from "./i18n.js";
import { Icon } from "./icons.js";

/** The audio settings that matter day to day, inline in the settings page.
 * Engine choice and the Edge gateway stay in the Bible reader because they are
 * advanced, environment-specific options. */
export function AudioSettingsInline({ locale }: { locale: Locale }) {
  const speech = useSyncExternalStore(
    speechPlayer.subscribe,
    speechPlayer.snapshot,
  );
  const voices =
    speech.engine === "edge"
      ? (speech.edgeVoices ?? [])
      : speech.voices.filter((voice) =>
          speech.engine === "local" ? voice.local : true,
        );
  const selectedVoice = speech.voices.some(
    (voice) => voice.id === speech.voiceId,
  )
    ? speech.voiceId
    : "";
  return (
    <div className="audio-settings-inline">
      <label className="audio-setting-row">
        <span>{translate(locale, "bible.voice")}</span>
        <select
          className="audio-setting-select"
          value={selectedVoice}
          onChange={(event) => speechPlayer.setVoice(event.target.value)}
        >
          <option value="">{translate(locale, "bible.defaultVoice")}</option>
          {voices.map((voice) => (
            <option value={voice.id} key={voice.id}>
              {voice.name}
            </option>
          ))}
        </select>
      </label>
      {speech.engine !== "local" && !isEdgeSpeechConfigured() && (
        <p className="audio-setting-hint">
          {translate(locale, "bible.edgeHint")}
        </p>
      )}
      {speech.engine !== "local" &&
        isEdgeSpeechConfigured() &&
        speech.providerId === "browser-system" && (
          <p className="audio-setting-hint" role="status">
            {translate(locale, "bible.edgeFallback")}
          </p>
        )}
      <label className="audio-setting-row">
        <span>
          {translate(locale, "bible.readingSpeed")} · {speech.rate.toFixed(1)}×
        </span>
        <input
          type="range"
          min="0.5"
          max="2"
          step="0.1"
          value={speech.rate}
          aria-label={translate(locale, "bible.voiceRate")}
          onChange={(event) => speechPlayer.setRate(Number(event.target.value))}
        />
      </label>
      <label className="audio-setting-row">
        <span>
          {translate(locale, "bible.readingPitch")} · {speech.pitch.toFixed(1)}
        </span>
        <input
          type="range"
          min="0.5"
          max="2"
          step="0.1"
          value={speech.pitch}
          aria-label={translate(locale, "bible.readingPitch")}
          onChange={(event) =>
            speechPlayer.setPitch(Number(event.target.value))
          }
        />
      </label>
      <Link
        className="text-button audio-setting-link"
        to="/bible?settings=audio"
      >
        {translate(locale, "bible.audioSettings")}
        <Icon name="chevronRight" size={16} />
      </Link>
    </div>
  );
}
