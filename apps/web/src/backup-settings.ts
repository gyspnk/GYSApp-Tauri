type PortableStorage = Pick<Storage, "getItem" | "setItem" | "length" | "key">;

const PORTABLE_BACKUP_KEYS = new Set([
  "gys-locale",
  "gys-theme",
  "gys-shell-settings-v1",
  "gys-activity-v1",
  "gys-favorites-v1",
  "gys-literature-progress-v2",
  "gys-bible-book",
  "gys-bible-chapter",
  "gys-bible-version-v1",
  "gys-bible-last-reading",
  "gys-bible-bookmarks",
  "gys-bible-notes-v1",
  "gys-bible-highlights-v1",
  "gys-bible-search-history-v1",
  "gys-bible-split-v1",
  "gys-bible-split-ratio-v1",
  "gys-daily-sauh-mode-v1",
  "gys-sidebar-collapsed-v1",
  "gys-media-minimized",
  "gys-media-position-v1",
  "gys-midi-preferences-v1",
  "gys-hymn-typography-v1",
  "gys-speech-voice-v1",
  "gys-speech-rate-v1",
  "gys-speech-engine-v1",
  "gys-report-draft",
  "gys-reminder-time-v1",
  "gys-midi-playlist-v1",
  "gys-hymn-view-mode-v1",
  "gys-hymn-chord-visibility-v1",
  "gys-accent-color",
  "gys-bible-secondary-version",
  "gys-bible-split-sync-scroll-v1",
  "gys-bible-typography-v1",
  "gys-chord-ui-prefs",
  "gys-hymn-natural-chords",
  "gys-hymn-view-scope",
  "gys-hymn-viewer-prefs-v1",
  "gys-kidung-active-playlist",
  "gys-kidung-playlists-v1",
  "gys-lyrics-font-size",
  "gys-lyrics-header-collapsed",
  "gys-lyrics-line-spacing",
  "gys-lyrics-show-chords",
  "gys-hymn-accidental",
  "gys-speech-pitch-v1",
  "gys-speech-volume-v1",
  "gys-ui-preferences-v1",
]);

const PORTABLE_BACKUP_PREFIXES = [
  "gys-pdf-page:",
  "gys-pdf-layout:",
  "gys-faith-pdf-",
  "gys-faith-note-",
];

export function isPortableBackupSetting(key: string): boolean {
  return (
    PORTABLE_BACKUP_KEYS.has(key) ||
    PORTABLE_BACKUP_PREFIXES.some((prefix) => key.startsWith(prefix))
  );
}

export function collectPortableBackupSettings(
  storage: PortableStorage = localStorage,
): Record<string, string> {
  const keys = new Set(PORTABLE_BACKUP_KEYS);
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && isPortableBackupSetting(key)) keys.add(key);
  }
  return Object.fromEntries(
    [...keys].flatMap((key) => {
      const value = storage.getItem(key);
      return value === null ? [] : [[key, value]];
    }),
  );
}

export function restorePortableBackupSettings(
  settings: unknown,
  storage: PortableStorage = localStorage,
): number {
  if (!settings || typeof settings !== "object" || Array.isArray(settings))
    throw new Error("settings missing");
  let restored = 0;
  for (const [key, value] of Object.entries(settings)) {
    if (!isPortableBackupSetting(key) || typeof value !== "string") continue;
    storage.setItem(key, value);
    restored += 1;
  }
  return restored;
}
