import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import { useLocation } from "react-router-dom";
import { SpeechEnginePreferenceSchema } from "@gys/contracts";
import { translate, type Locale } from "./i18n.js";
import type { ShellTheme as Theme } from "./settings.js";
import { midiPlayer } from "./midi-player.js";
import { speechPlayer } from "./speech-player.js";
import { playMidiPlaylistItem } from "./midi-queue.js";
import { getMidiPlaylist, subscribeMidiPlaylist } from "./midi-playlist.js";
import {
  getCustomEdgeEndpoint,
  isEdgeSpeechConfigured,
  setCustomEdgeEndpoint,
} from "./edge-speech.js";
import { GM_INSTRUMENTS, midiInstrumentLabel } from "./midi-instruments.js";
import { recordDiagnostic } from "./diagnostics.js";
import { Select } from "./select.js";
import { Icon } from "./icons.js";
import { useBibleHeaderState } from "./bible-header-store.js";

export function BibleHeader({
  locale,
  setLocale,
  theme,
  setTheme,
  online,
  onOpenSearch,
  searchTriggerRef,
  pathname,
  onFocusPageSearch,
}: {
  locale: Locale;
  setLocale: (value: Locale) => void;
  theme: Theme;
  setTheme: (value: Theme) => void;
  online: boolean;
  onOpenSearch: () => void;
  searchTriggerRef: RefObject<HTMLButtonElement | null>;
  pathname: string;
  onFocusPageSearch: () => void;
}) {
  const isBibleRoute = pathname === "/bible";
  const location = useLocation();
  const bibleHeader = useBibleHeaderState();
  const [hamburgerOpen, setHamburgerOpen] = useState(false);
  const hamburgerRef = useRef<HTMLDivElement>(null);
  const shouldOpenAudioSettings =
    isBibleRoute &&
    new URLSearchParams(location.search).get("settings") === "audio";

  const midiSnapshot = useSyncExternalStore(
    midiPlayer.subscribe,
    midiPlayer.snapshot,
    midiPlayer.snapshot,
  );
  const midiPlaylist = useSyncExternalStore(
    subscribeMidiPlaylist,
    getMidiPlaylist,
    getMidiPlaylist,
  );
  const isMidiPlaying = midiSnapshot.status === "playing";
  const queuedMidiItem =
    midiPlaylist.items[midiPlaylist.currentIndex] ?? midiPlaylist.items[0];

  const speechSnapshot = useSyncExternalStore(
    speechPlayer.subscribe,
    speechPlayer.snapshot,
    speechPlayer.snapshot,
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        hamburgerRef.current &&
        !hamburgerRef.current.contains(event.target as Node)
      ) {
        setHamburgerOpen(false);
      }
    };
    if (hamburgerOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [hamburgerOpen]);

  useEffect(() => {
    if (shouldOpenAudioSettings && bibleHeader) setHamburgerOpen(true);
  }, [bibleHeader, shouldOpenAudioSettings]);

  const handleToggleMidi = () => {
    if (isMidiPlaying) {
      void midiPlayer.pause().catch(() => undefined);
    } else if (midiSnapshot.songId) {
      void midiPlayer.play().catch(() => undefined);
    } else if (queuedMidiItem) {
      void playMidiPlaylistItem(queuedMidiItem.songId).catch((error) =>
        recordDiagnostic("warn", "midi.header-play", error),
      );
    }
  };

  return (
    <header className="topbar is-reader-context">
      <div className="reader-context-bar">
        <div className="reader-context-left">
          {isBibleRoute && bibleHeader?.active ? (
            <>
              <button
                className="reader-context-book-picker quick-nav-handle"
                type="button"
                onClick={(event) =>
                  bibleHeader.onOpenPicker(event.currentTarget)
                }
                onPointerDown={bibleHeader.startQuickNav}
                onKeyDown={bibleHeader.quickNavKeyDown}
                role="button"
                tabIndex={0}
                aria-label={translate(locale, "bible.bookPickerAria")}
                title={translate(locale, "bible.pickBookChapter")}
              >
                <Icon name="book" size={15} />
                <strong className="picker-book-title">
                  {bibleHeader.bookName} {bibleHeader.chapter}
                </strong>
                <span className="picker-chevron">
                  <Icon name="chevronDown" size={12} />
                </span>
              </button>

              <div className="reader-version-select-wrap">
                <Select
                  value={bibleHeader.versionCode}
                  onChange={bibleHeader.onSelectVersion}
                  className="topbar-select reader-context-select version-select"
                  label={translate(
                    locale,
                    bibleHeader.splitView
                      ? "bible.versionOne"
                      : "bible.version",
                  )}
                  options={bibleHeader.versionOptions}
                />
                {bibleHeader.splitView &&
                  bibleHeader.secondaryVersionCode &&
                  bibleHeader.onSelectSecondaryVersion && (
                    <Select
                      value={bibleHeader.secondaryVersionCode}
                      onChange={bibleHeader.onSelectSecondaryVersion}
                      className="topbar-select reader-context-select version-select secondary-version-select"
                      label={translate(locale, "bible.versionTwo")}
                      options={bibleHeader.versionOptions}
                    />
                  )}
              </div>
            </>
          ) : (
            <div className="reader-context-title">
              <span>
                {isBibleRoute
                  ? translate(locale, "bible.reading")
                  : "Kidung Rohani"}
              </span>
              <strong>{isBibleRoute ? "Alkitab" : "Kidung"}</strong>
            </div>
          )}
        </div>

        <div className="reader-context-actions">
          {isBibleRoute && bibleHeader?.active ? (
            <>
              <button
                className={`reader-context-button reader-search-btn${bibleHeader.searchOpen ? " is-active" : ""}`}
                type="button"
                aria-expanded={bibleHeader.searchOpen}
                aria-controls="bible-search-form"
                aria-label={translate(locale, "bible.searchVerses")}
                title={translate(locale, "bible.searchVerses")}
                onClick={bibleHeader.onToggleSearch}
              >
                <Icon name="search" size={15} />
              </button>
              {bibleHeader.speechAvailable && (
                <button
                  className={`reader-context-button reader-speech-btn${bibleHeader.speaking ? " is-speaking" : ""}`}
                  type="button"
                  onClick={bibleHeader.onToggleSpeech}
                  aria-label={
                    bibleHeader.speechStatus === "paused"
                      ? translate(locale, "bible.resumeReading")
                      : bibleHeader.speechStatus === "speaking"
                        ? translate(locale, "bible.pauseReading")
                        : bibleHeader.speaking
                          ? translate(locale, "bible.stopReading")
                          : translate(locale, "bible.readAloud")
                  }
                  title={translate(
                    locale,
                    bibleHeader.speaking
                      ? "bible.stopChapter"
                      : "bible.readChapter",
                  )}
                >
                  <Icon
                    name={
                      bibleHeader.speechStatus === "speaking"
                        ? "pause"
                        : bibleHeader.speechStatus === "paused"
                          ? "play"
                          : bibleHeader.speaking
                            ? "stop"
                            : "play"
                    }
                    size={15}
                  />
                </button>
              )}

              {/* Hamburger menu di paling kanan */}
              <div className="reader-hamburger-wrapper" ref={hamburgerRef}>
                <button
                  className={`reader-context-button reader-hamburger-btn${hamburgerOpen ? " is-active" : ""}`}
                  type="button"
                  aria-expanded={hamburgerOpen}
                  aria-label={translate(locale, "bible.menu")}
                  title={translate(locale, "bible.menu")}
                  onClick={() => setHamburgerOpen((v) => !v)}
                >
                  <span className="hamburger-icon" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                </button>
                {hamburgerOpen && (
                  <>
                    <div
                      className="reader-hamburger-backdrop"
                      onClick={() => setHamburgerOpen(false)}
                      aria-hidden="true"
                    />
                    <div
                      className="reader-hamburger-drawer"
                      role="dialog"
                      aria-label={translate(locale, "bible.menuTitle")}
                    >
                      <div className="hamburger-drawer-header">
                        <div className="hamburger-drawer-title">
                          <Icon name="book" size={16} />
                          <strong>
                            {translate(locale, "bible.menuTitle")}
                          </strong>
                        </div>
                        <button
                          className="hamburger-drawer-close"
                          type="button"
                          onClick={() => setHamburgerOpen(false)}
                          aria-label={translate(locale, "bible.closeMenu")}
                          title={translate(locale, "bible.closeMenu")}
                        >
                          ✕
                        </button>
                      </div>

                      <div className="hamburger-drawer-body">
                        <div className="hamburger-section">
                          <div className="hamburger-group">
                            <button
                              className="hamburger-item"
                              type="button"
                              onClick={() => {
                                bibleHeader.onOpenNotes();
                                setHamburgerOpen(false);
                              }}
                            >
                              <div className="hamburger-item-icon">
                                <Icon name="bookmark" size={16} />
                              </div>
                              <div className="hamburger-item-text">
                                <strong>
                                  {translate(locale, "bible.notes")}
                                </strong>
                              </div>
                            </button>
                          </div>
                        </div>

                        {/* Section 1: Typography */}
                        <div className="hamburger-card">
                          <div className="hamburger-card-header">
                            <span className="hamburger-section-label">
                              {translate(locale, "bible.textSize")}
                            </span>
                            <span className="hamburger-size-badge">
                              {bibleHeader.fontSize}px
                            </span>
                          </div>
                          <div className="hamburger-typography-stepper">
                            <button
                              type="button"
                              className="typography-step-btn"
                              onClick={bibleHeader.onDecreaseFontSize}
                              disabled={
                                bibleHeader.fontSize <= bibleHeader.minFontSize
                              }
                              aria-label={translate(
                                locale,
                                "bible.decreaseText",
                              )}
                            >
                              <span className="step-label">A−</span>
                              <small>{translate(locale, "bible.small")}</small>
                            </button>
                            <div className="typography-size-indicator">
                              <strong>{bibleHeader.fontSize}</strong>
                              <small>pt</small>
                            </div>
                            <button
                              type="button"
                              className="typography-step-btn"
                              onClick={bibleHeader.onIncreaseFontSize}
                              disabled={
                                bibleHeader.fontSize >= bibleHeader.maxFontSize
                              }
                              aria-label={translate(
                                locale,
                                "bible.increaseText",
                              )}
                            >
                              <span className="step-label">A+</span>
                              <small>{translate(locale, "bible.large")}</small>
                            </button>
                          </div>
                        </div>

                        {/* Section 2: Mode Tampilan */}
                        <div className="hamburger-section">
                          <span className="hamburger-section-label">
                            {translate(locale, "bible.viewMode")}
                          </span>
                          <div className="hamburger-group">
                            <button
                              className={`hamburger-item${bibleHeader.splitView ? " is-active" : ""}`}
                              type="button"
                              onClick={() => {
                                bibleHeader.onToggleSplitView();
                              }}
                            >
                              <div className="hamburger-item-icon">
                                <Icon name="columns" size={16} />
                              </div>
                              <div className="hamburger-item-text">
                                <strong>
                                  {translate(locale, "bible.splitView")}
                                </strong>
                                <small>
                                  {translate(locale, "bible.splitViewHint")}
                                </small>
                              </div>
                              <div
                                className={`hamburger-switch ${bibleHeader.splitView ? "is-on" : ""}`}
                              >
                                <span className="switch-thumb" />
                              </div>
                            </button>

                            {bibleHeader.splitView && (
                              <button
                                className={`hamburger-item${bibleHeader.syncScroll ? " is-active" : ""}`}
                                type="button"
                                onClick={() => bibleHeader.onToggleSyncScroll()}
                              >
                                <div className="hamburger-item-icon">
                                  <Icon name="arrow" size={16} />
                                </div>
                                <div className="hamburger-item-text">
                                  <strong>
                                    {translate(locale, "bible.syncScroll")}
                                  </strong>
                                  <small>
                                    {translate(locale, "bible.syncScrollHint")}
                                  </small>
                                </div>
                                <div
                                  className={`hamburger-switch ${bibleHeader.syncScroll ? "is-on" : ""}`}
                                >
                                  <span className="switch-thumb" />
                                </div>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Section 3: Audio Alkitab Suara */}
                        <div className="hamburger-section">
                          <span className="hamburger-section-label">
                            {translate(locale, "bible.audioBible")}
                          </span>
                          <div className="hamburger-group">
                            <button
                              className={`hamburger-item${speechSnapshot.playerOpen || bibleHeader.speaking ? " is-active" : ""}`}
                              type="button"
                              disabled={!bibleHeader.speechAvailable}
                              onClick={() => {
                                bibleHeader.onToggleSpeech();
                                setHamburgerOpen(false);
                              }}
                            >
                              <div className="hamburger-item-icon">
                                <Icon
                                  name={
                                    speechSnapshot.playerOpen ||
                                    bibleHeader.speaking
                                      ? "bible"
                                      : "play"
                                  }
                                  size={16}
                                />
                              </div>
                              <div className="hamburger-item-text">
                                <strong>
                                  {translate(locale, "bible.audioPlayer")}
                                </strong>
                                <small>
                                  {speechSnapshot.playerOpen ||
                                  bibleHeader.speaking
                                    ? translate(locale, "bible.audioActive")
                                    : translate(
                                        locale,
                                        "bible.showAudioPlayer",
                                      )}
                                </small>
                              </div>
                              <span
                                className={`hamburger-badge ${speechSnapshot.playerOpen || bibleHeader.speaking ? "is-playing" : ""}`}
                              >
                                {speechSnapshot.playerOpen ||
                                bibleHeader.speaking
                                  ? translate(locale, "bible.active")
                                  : translate(locale, "bible.showAudioPlayer")}
                              </span>
                            </button>

                            <button
                              className={`hamburger-item speech-settings-toggle${bibleHeader.speechControlsOpen ? " is-active" : ""}`}
                              type="button"
                              aria-expanded={bibleHeader.speechControlsOpen}
                              onClick={bibleHeader.onToggleSpeechControls}
                            >
                              <div className="hamburger-item-icon">
                                <Icon name="settings" size={16} />
                              </div>
                              <div className="hamburger-item-text">
                                <strong>
                                  {translate(locale, "bible.audioSettings")}
                                </strong>
                                <small>
                                  {bibleHeader.speechControlsOpen
                                    ? translate(
                                        locale,
                                        "bible.closeAudioOptions",
                                      )
                                    : translate(locale, "bible.configureAudio")}
                                </small>
                              </div>
                              <div className="hamburger-expand-badge">
                                <Icon
                                  name={
                                    bibleHeader.speechControlsOpen
                                      ? "chevronUp"
                                      : "chevronDown"
                                  }
                                  size={15}
                                />
                              </div>
                            </button>
                          </div>

                          {/* Pengaturan Detail Alkitab Suara */}
                          {bibleHeader.speechControlsOpen && (
                            <div className="drawer-speech-card">
                              <label className="drawer-speech-row">
                                <span>{translate(locale, "bible.engine")}</span>
                                <select
                                  className="drawer-speech-select"
                                  value={speechSnapshot.engine}
                                  onChange={(event) =>
                                    speechPlayer.setEngine(
                                      SpeechEnginePreferenceSchema.parse(
                                        event.target.value,
                                      ),
                                    )
                                  }
                                >
                                  <option value="auto">
                                    {translate(locale, "bible.autoTts")}
                                  </option>
                                  <option
                                    value="edge"
                                    disabled={!isEdgeSpeechConfigured()}
                                  >
                                    {translate(locale, "bible.edgeOnlineTts")}
                                  </option>
                                  <option value="local">
                                    {translate(locale, "bible.localTts")}
                                  </option>
                                </select>
                              </label>

                              <label className="drawer-speech-row">
                                <span>{translate(locale, "bible.voice")}</span>
                                <select
                                  className="drawer-speech-select"
                                  value={
                                    speechSnapshot.voices.some(
                                      (v) => v.id === speechSnapshot.voiceId,
                                    )
                                      ? speechSnapshot.voiceId
                                      : ""
                                  }
                                  onChange={(e) =>
                                    speechPlayer.setVoice(e.target.value)
                                  }
                                >
                                  <option value="">
                                    {translate(locale, "bible.defaultVoice")}
                                  </option>
                                  {(speechSnapshot.engine === "edge"
                                    ? (speechSnapshot.edgeVoices ?? [])
                                    : speechSnapshot.voices.filter((voice) =>
                                        speechSnapshot.engine === "local"
                                          ? voice.local
                                          : true,
                                      )
                                  ).map((voice) => (
                                    <option value={voice.id} key={voice.id}>
                                      {voice.name}
                                    </option>
                                  ))}
                                </select>
                                {speechSnapshot.engine !== "local" &&
                                  !isEdgeSpeechConfigured() && (
                                    <small className="drawer-speech-hint">
                                      {translate(locale, "bible.edgeHint")}
                                    </small>
                                  )}
                              </label>

                              {speechSnapshot.engine === "edge" && (
                                <label className="drawer-speech-row">
                                  <span className="drawer-speech-label">
                                    {translate(locale, "bible.gatewayEndpoint")}{" "}
                                    ({translate(locale, "bible.optional")})
                                  </span>
                                  <input
                                    type="url"
                                    className="drawer-speech-input"
                                    placeholder={translate(
                                      locale,
                                      "bible.edgeEndpointPlaceholder",
                                    )}
                                    defaultValue={getCustomEdgeEndpoint()}
                                    onBlur={(e) => {
                                      setCustomEdgeEndpoint(e.target.value);
                                      void speechPlayer.loadVoices();
                                    }}
                                  />
                                </label>
                              )}

                              <div className="drawer-speech-row">
                                <div className="drawer-speech-row-header">
                                  <span className="drawer-speech-label">
                                    {translate(locale, "bible.readingSpeed")}
                                  </span>
                                  <span className="drawer-speech-val">
                                    {speechSnapshot.rate.toFixed(1)}×
                                  </span>
                                </div>
                                <input
                                  type="range"
                                  className="drawer-speech-range"
                                  aria-label={translate(
                                    locale,
                                    "bible.voiceRate",
                                  )}
                                  min="0.5"
                                  max="2"
                                  step="0.1"
                                  value={speechSnapshot.rate}
                                  onChange={(e) =>
                                    speechPlayer.setRate(Number(e.target.value))
                                  }
                                />
                              </div>

                              <div className="drawer-speech-row">
                                <div className="drawer-speech-row-header">
                                  <span className="drawer-speech-label">
                                    {translate(locale, "bible.readingPitch")}
                                  </span>
                                  <span className="drawer-speech-val">
                                    {speechSnapshot.pitch.toFixed(1)}×
                                  </span>
                                </div>
                                <input
                                  type="range"
                                  className="drawer-speech-range"
                                  aria-label={translate(
                                    locale,
                                    "bible.voicePitch",
                                  )}
                                  min="0.5"
                                  max="2"
                                  step="0.1"
                                  value={speechSnapshot.pitch}
                                  onChange={(e) =>
                                    speechPlayer.setPitch(
                                      Number(e.target.value),
                                    )
                                  }
                                />
                              </div>

                              <div className="drawer-speech-row">
                                <div className="drawer-speech-row-header">
                                  <span className="drawer-speech-label">
                                    {translate(locale, "bible.volume")}
                                  </span>
                                  <span className="drawer-speech-val">
                                    {Math.round(speechSnapshot.volume * 100)}%
                                  </span>
                                </div>
                                <input
                                  type="range"
                                  className="drawer-speech-range"
                                  aria-label={translate(
                                    locale,
                                    "bible.voiceVolume",
                                  )}
                                  min="0"
                                  max="1"
                                  step="0.05"
                                  value={speechSnapshot.volume}
                                  onChange={(e) =>
                                    speechPlayer.setVolume(
                                      Number(e.target.value),
                                    )
                                  }
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Section 4: Tampilan & Bahasa */}
                        <div className="hamburger-section">
                          <span className="hamburger-section-label">
                            {translate(locale, "more.appearance")}
                          </span>
                          <div
                            className="hamburger-group"
                            style={{
                              padding: "12px 14px",
                              display: "grid",
                              gridTemplateColumns: "1fr 1fr",
                              gap: "10px",
                            }}
                          >
                            <Select
                              value={locale}
                              onChange={setLocale}
                              className="topbar-select"
                              label={translate(locale, "shell.language")}
                              options={[
                                { value: "id", label: "ID" },
                                { value: "en", label: "EN" },
                                { value: "zh", label: "中文" },
                              ]}
                            />
                            <Select
                              value={theme}
                              onChange={setTheme}
                              className="topbar-select theme-select"
                              label={translate(locale, "shell.theme")}
                              options={[
                                {
                                  value: "system",
                                  label: translate(locale, "theme.system"),
                                  shortLabel: "",
                                  icon: "system",
                                },
                                {
                                  value: "light",
                                  label: translate(locale, "theme.light"),
                                  shortLabel: "",
                                  icon: "sun",
                                },
                                {
                                  value: "dark",
                                  label: translate(locale, "theme.dark"),
                                  shortLabel: "",
                                  icon: "moon",
                                },
                                {
                                  value: "amoled",
                                  label: translate(locale, "theme.amoled"),
                                  shortLabel: "",
                                  icon: "amoled",
                                },
                                {
                                  value: "sepia",
                                  label: translate(locale, "theme.sepia"),
                                  shortLabel: "",
                                  icon: "sepia",
                                },
                              ]}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              {isBibleRoute ? (
                <button
                  className="reader-context-button"
                  type="button"
                  disabled={isBibleRoute && !bibleHeader?.active}
                  onClick={
                    isBibleRoute && bibleHeader?.active
                      ? bibleHeader.onFocusSearch
                      : onFocusPageSearch
                  }
                  aria-label={
                    isBibleRoute
                      ? translate(locale, "bible.searchVerses")
                      : "Buka pencarian lagu"
                  }
                >
                  <Icon name="search" size={15} />
                </button>
              ) : null}
              <button
                className={`reader-context-button reader-midi-btn${isMidiPlaying ? " is-active" : ""}`}
                type="button"
                onClick={handleToggleMidi}
                aria-label={translate(locale, "bible.musicPlayer")}
                title={translate(locale, "bible.musicPlayer")}
              >
                <Icon name="music" size={15} />
              </button>
            </>
          )}
        </div>

        {!isBibleRoute && (
          <div className="reader-context-settings">
            <Select
              value={locale}
              onChange={setLocale}
              className="topbar-select reader-context-select"
              label={translate(locale, "shell.language")}
              options={[
                { value: "id", label: "ID" },
                { value: "en", label: "EN" },
                { value: "zh", label: "中文" },
              ]}
            />
            <Select
              value={theme}
              onChange={setTheme}
              className="topbar-select reader-context-select theme-select"
              label={translate(locale, "shell.theme")}
              options={[
                {
                  value: "system",
                  label: translate(locale, "shell.themeSystem"),
                  shortLabel: "",
                  icon: "system",
                },
                {
                  value: "light",
                  label: translate(locale, "shell.themeLight"),
                  shortLabel: "",
                  icon: "sun",
                },
                {
                  value: "dark",
                  label: translate(locale, "shell.themeDark"),
                  shortLabel: "",
                  icon: "moon",
                },
                {
                  value: "amoled",
                  label: translate(locale, "shell.themeAmoled"),
                  shortLabel: "",
                  icon: "amoled",
                },
                {
                  value: "sepia",
                  label: translate(locale, "shell.themeSepia"),
                  shortLabel: "",
                  icon: "sepia",
                },
              ]}
            />
          </div>
        )}
      </div>
    </header>
  );
}
