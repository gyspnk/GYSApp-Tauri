import { useEffect, useState, useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import { translate, type Locale } from "./i18n.js";
import { Select } from "./select.js";
import {
  readHymnViewerPrefs,
  setDefaultPdfLayout,
  writeHymnViewerPrefs,
  type HymnViewerPrefs,
} from "./hymn-viewer-prefs.js";
import {
  getMidiPlaylist,
  subscribeMidiPlaylist,
  updateMidiPlaylistOptions,
} from "./midi-playlist.js";
import {
  readNaturalChordPreference,
  writeNaturalChordPreference,
} from "./hymn-preferences.js";
import type { ShellTheme } from "./settings.js";
import { clearAppData } from "./app-data.js";
import {
  CHORD_FILL_PRESETS,
  CHORD_THEME_PRESETS,
  readChordUiPrefs,
  subscribeChordUiPrefs,
  writeChordUiPrefs,
  type ChordUiPrefs,
} from "./chord-ui-prefs.js";
import { KidungLocalNav } from "./kidung-local-nav.js";

export function HymnSettingsPage({
  locale,
  theme,
  setLocale,
  setTheme,
}: {
  locale: Locale;
  theme: ShellTheme;
  setLocale?: (locale: Locale) => void;
  setTheme?: (theme: ShellTheme) => void;
}) {
  const playlist = useSyncExternalStore(
    subscribeMidiPlaylist,
    getMidiPlaylist,
    getMidiPlaylist,
  );
  const [compactPlayer, setCompactPlayer] = useState(
    () =>
      typeof window !== "undefined" &&
      localStorage.getItem("gys-media-minimized") === "1",
  );
  const [naturalChords, setNaturalChords] = useState(() =>
    readNaturalChordPreference(),
  );
  const [chordUiPrefs, setChordUiPrefs] = useState<ChordUiPrefs>(() =>
    readChordUiPrefs(),
  );
  useEffect(
    () => subscribeChordUiPrefs(() => setChordUiPrefs(readChordUiPrefs())),
    [],
  );
  const updateChordUiPrefs = (patch: Partial<ChordUiPrefs>) => {
    setChordUiPrefs((current) => writeChordUiPrefs({ ...current, ...patch }));
  };
  const [viewPrefs, setViewPrefs] = useState<HymnViewerPrefs>(() =>
    readHymnViewerPrefs(),
  );
  const [defaultPdfLayout, setDefaultPdfLayoutState] = useState<
    "single" | "double" | "vertical"
  >(() => {
    const prefs = readHymnViewerPrefs();
    return prefs.defaultTwoPage
      ? "double"
      : prefs.defaultVerticalScroll
        ? "vertical"
        : "single";
  });
  const applyViewPrefs = (next: HymnViewerPrefs) => {
    setViewPrefs(next);
    writeHymnViewerPrefs(next);
  };
  const setPlayerPreference = (next: boolean) => {
    setCompactPlayer(next);
    if (typeof window !== "undefined") {
      localStorage.setItem("gys-media-minimized", next ? "1" : "0");
      window.dispatchEvent(new Event("gys-media-preference-change"));
    }
  };
  return (
    <div className="page hymn-page kidung-tool-page">
      <KidungLocalNav active="settings" locale={locale} />
      <header className="kidung-tool-heading">
        <div>
          <h1>{translate(locale, "kidung.settings")}</h1>
        </div>
      </header>
      <div className="kidung-settings-layout">
        <section
          className="kidung-settings-section"
          aria-labelledby="kidung-appearance-heading"
        >
          <p className="date-line">
            {translate(locale, "kidung.settingsAppearance")}
          </p>
          <h2 id="kidung-appearance-heading">
            {translate(locale, "kidung.settingsLanguageTheme")}
          </h2>
          <div className="kidung-settings-controls">
            <Select
              value={locale}
              onChange={(value) => setLocale?.(value)}
              label={translate(locale, "kidung.settingsLanguage")}
              options={[
                {
                  value: "id",
                  label: translate(locale, "kidung.settingsLanguage.id"),
                },
                {
                  value: "en",
                  label: translate(locale, "kidung.settingsLanguage.en"),
                },
                {
                  value: "zh",
                  label: translate(locale, "kidung.settingsLanguage.zh"),
                },
              ]}
              disabled={!setLocale}
            />
            <Select
              value={theme}
              onChange={(value) => setTheme?.(value)}
              label={translate(locale, "kidung.settingsTheme")}
              options={[
                {
                  value: "light",
                  label: translate(locale, "theme.light"),
                },
                { value: "dark", label: translate(locale, "theme.dark") },
                {
                  value: "system",
                  label: translate(locale, "theme.system"),
                },
                { value: "sepia", label: translate(locale, "theme.sepia") },
                {
                  value: "amoled",
                  label: translate(locale, "theme.amoled"),
                },
              ]}
              disabled={!setTheme}
            />
          </div>
        </section>
        <section
          className="kidung-settings-section"
          aria-labelledby="kidung-player-heading"
        >
          <p className="date-line">
            {translate(locale, "kidung.settingsAudio")}
          </p>
          <h2 id="kidung-player-heading">
            {translate(locale, "kidung.settingsMidiPlayer")}
          </h2>
          <label className="kidung-settings-switch">
            <input
              type="checkbox"
              checked={compactPlayer}
              onChange={(event) => setPlayerPreference(event.target.checked)}
            />
            <span>
              <strong>
                {translate(locale, "kidung.settingsCompactPlayer")}
              </strong>
              <small>
                {translate(locale, "kidung.settingsCompactPlayerDescription")}
              </small>
            </span>
          </label>
          <div className="kidung-settings-controls">
            <Select
              value={playlist.crossfadeMs}
              onChange={(value) =>
                updateMidiPlaylistOptions({ crossfadeMs: value })
              }
              label={translate(locale, "kidung.settingsCrossfade")}
              options={[
                {
                  value: 0,
                  label: translate(locale, "kidung.settingsCrossfade.off"),
                },
                {
                  value: 2000,
                  label: translate(locale, "kidung.settingsCrossfade.gentle"),
                },
                {
                  value: 3000,
                  label: translate(locale, "kidung.settingsCrossfade.gapless"),
                },
                {
                  value: 5000,
                  label: translate(locale, "kidung.settingsCrossfade.dramatic"),
                },
              ]}
            />
          </div>
          <label className="kidung-settings-switch">
            <input
              type="checkbox"
              checked={naturalChords}
              onChange={(event) => {
                const next = event.target.checked;
                setNaturalChords(next);
                writeNaturalChordPreference(next);
              }}
            />
            <span>
              <strong>
                {translate(locale, "kidung.settingsNaturalChords")}
              </strong>
              <small>
                {translate(locale, "kidung.settingsNaturalChordsDescription")}
              </small>
            </span>
          </label>
          <label className="kidung-settings-switch">
            <input
              type="checkbox"
              checked={viewPrefs.preloadEnabled}
              onChange={(event) =>
                applyViewPrefs({
                  ...viewPrefs,
                  preloadEnabled: event.target.checked,
                })
              }
            />
            <span>
              <strong>{translate(locale, "kidung.settingsPreloadNext")}</strong>
              <small>
                {translate(locale, "kidung.settingsPreloadNextDescription")}
              </small>
            </span>
          </label>
          <div className="kidung-settings-controls">
            <Select
              value={viewPrefs.preloadCount}
              onChange={(value) =>
                applyViewPrefs({ ...viewPrefs, preloadCount: value })
              }
              label={translate(locale, "kidung.settingsPreloadCount")}
              options={[
                {
                  value: 1,
                  label: translate(
                    locale,
                    "kidung.settingsPreloadCountOption",
                    {
                      count: 1,
                    },
                  ),
                },
                {
                  value: 2,
                  label: translate(
                    locale,
                    "kidung.settingsPreloadCountOption",
                    {
                      count: 2,
                    },
                  ),
                },
                {
                  value: 3,
                  label: translate(
                    locale,
                    "kidung.settingsPreloadCountOption",
                    {
                      count: 3,
                    },
                  ),
                },
              ]}
            />
            <Select
              value={defaultPdfLayout}
              onChange={(value) => {
                setDefaultPdfLayout(value);
                setDefaultPdfLayoutState(value);
              }}
              label={translate(locale, "kidung.settingsPdfLayout")}
              options={[
                {
                  value: "single",
                  label: translate(locale, "kidung.settingsPdfSingle"),
                },
                {
                  value: "double",
                  label: translate(locale, "kidung.settingsPdfDouble"),
                },
                {
                  value: "vertical",
                  label: translate(locale, "kidung.settingsPdfVertical"),
                },
              ]}
            />
          </div>
          <div className="kidung-settings-summary">
            <span>{translate(locale, "kidung.settingsSavedPlaylist")}</span>
            <strong>
              {translate(locale, "kidung.settingsSongCount", {
                count: playlist.items.length,
              })}
            </strong>
          </div>
          <Link className="text-button" to="/kidung?section=playlist">
            {translate(locale, "kidung.settingsManagePlaylist")}
          </Link>
        </section>
        <section
          className="kidung-settings-section"
          aria-labelledby="kidung-chord-heading"
        >
          <p className="date-line">
            {translate(locale, "kidung.settingsChord")}
          </p>
          <details className="kidung-settings-disclosure">
            <summary>
              <h2 id="kidung-chord-heading">
                {translate(locale, "kidung.settingsChordAppearance")}
              </h2>
            </summary>
            <div className="kidung-settings-controls">
              <label className="kidung-settings-switch">
                <input
                  type="checkbox"
                  checked={chordUiPrefs.syncThemeWithAccent}
                  onChange={(event) =>
                    updateChordUiPrefs({
                      syncThemeWithAccent: event.target.checked,
                    })
                  }
                />
                <span>
                  <strong>
                    {translate(locale, "kidung.settingsSyncChordTheme")}
                  </strong>
                </span>
              </label>
              <div
                className="chord-ui-palette"
                role="group"
                aria-label={translate(locale, "kidung.settingsChordThemeGroup")}
              >
                {CHORD_THEME_PRESETS.map((preset) => {
                  const colorLabel = translate(
                    locale,
                    `kidung.chordColor.${preset.key}`,
                  );
                  return (
                    <button
                      key={preset.key}
                      type="button"
                      className={`chord-ui-swatch${chordUiPrefs.theme === preset.key ? " is-selected" : ""}${chordUiPrefs.syncThemeWithAccent ? " is-disabled" : ""}`}
                      disabled={chordUiPrefs.syncThemeWithAccent}
                      style={{ background: preset.color }}
                      aria-label={translate(
                        locale,
                        "kidung.settingsChordThemeSwatch",
                        { color: colorLabel },
                      )}
                      title={colorLabel}
                      onClick={() => updateChordUiPrefs({ theme: preset.key })}
                    />
                  );
                })}
              </div>
              <label className="kidung-settings-switch">
                <input
                  type="checkbox"
                  checked={chordUiPrefs.syncFillWithAccent}
                  onChange={(event) =>
                    updateChordUiPrefs({
                      syncFillWithAccent: event.target.checked,
                    })
                  }
                />
                <span>
                  <strong>
                    {translate(locale, "kidung.settingsSyncChordFill")}
                  </strong>
                </span>
              </label>
              <Select
                value={chordUiPrefs.fill}
                onChange={(value) =>
                  updateChordUiPrefs({
                    fill: value as "none" | "soft" | "solid",
                  })
                }
                label={translate(locale, "kidung.settingsFillStyle")}
                options={[
                  {
                    value: "none",
                    label: translate(locale, "kidung.settingsFillNone"),
                  },
                  {
                    value: "soft",
                    label: translate(locale, "kidung.settingsFillSoft"),
                  },
                  {
                    value: "solid",
                    label: translate(locale, "kidung.settingsFillSolid"),
                  },
                ]}
              />
              <div
                className="chord-ui-palette"
                role="group"
                aria-label={translate(locale, "kidung.settingsChordFillGroup")}
              >
                {CHORD_FILL_PRESETS.map((preset) => {
                  const colorLabel = translate(
                    locale,
                    `kidung.chordColor.${preset.key}`,
                  );
                  return (
                    <button
                      key={preset.key}
                      type="button"
                      className={`chord-ui-swatch is-fill${chordUiPrefs.fillColor === preset.key ? " is-selected" : ""}${chordUiPrefs.syncFillWithAccent ? " is-disabled" : ""}`}
                      disabled={chordUiPrefs.syncFillWithAccent}
                      style={{ background: preset.color }}
                      aria-label={translate(
                        locale,
                        "kidung.settingsChordFillSwatch",
                        { color: colorLabel },
                      )}
                      title={colorLabel}
                      onClick={() =>
                        updateChordUiPrefs({ fillColor: preset.key })
                      }
                    />
                  );
                })}
              </div>
              <label className="chord-ui-slider">
                <span>
                  {translate(locale, "kidung.settingsOpacity", {
                    percent: chordUiPrefs.fillOpacityPercent,
                  })}
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={chordUiPrefs.fillOpacityPercent}
                  onChange={(event) =>
                    updateChordUiPrefs({
                      fillOpacityPercent: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label className="chord-ui-slider">
                <span>
                  {translate(locale, "kidung.settingsFontSize", {
                    percent: chordUiPrefs.fontOverridePercent,
                  })}
                </span>
                <input
                  type="range"
                  min={80}
                  max={180}
                  step={5}
                  value={chordUiPrefs.fontOverridePercent}
                  onChange={(event) =>
                    updateChordUiPrefs({
                      fontOverridePercent: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label className="chord-ui-slider">
                <span>
                  {translate(locale, "kidung.settingsPadding", {
                    percent: chordUiPrefs.fillPaddingPercent,
                  })}
                </span>
                <input
                  type="range"
                  min={0}
                  max={400}
                  step={10}
                  value={chordUiPrefs.fillPaddingPercent}
                  onChange={(event) =>
                    updateChordUiPrefs({
                      fillPaddingPercent: Number(event.target.value),
                    })
                  }
                />
              </label>
            </div>
          </details>
        </section>
        <section
          className="kidung-settings-section"
          aria-labelledby="kidung-info-heading"
        >
          <p className="date-line">
            {translate(locale, "kidung.settingsInfo")}
          </p>
          <h2 id="kidung-info-heading">
            {translate(locale, "kidung.settingsVersionStorage")}
          </h2>
          <div className="kidung-settings-summary">
            <span>{translate(locale, "kidung.settingsAppVersion")}</span>
            <strong>0.1.0</strong>
          </div>
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              void clearAppData()
                .then(() =>
                  window.setTimeout(() => window.location.reload(), 400),
                )
                .catch(() => {
                  window.alert(translate(locale, "more.resetIncomplete"));
                });
            }}
          >
            {translate(locale, "kidung.settingsReset")}
          </button>
          <small className="kidung-settings-note">
            {translate(locale, "kidung.settingsResetDescription")}
          </small>
        </section>
      </div>
    </div>
  );
}
