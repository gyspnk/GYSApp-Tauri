from pathlib import Path

path = Path("apps/web/src/more.tsx")
text = path.read_text()
old = '''  "gys-hymn-chord-visibility-v1",\n];'''
new = '''  "gys-hymn-chord-visibility-v1",\n\n  // Durable user settings and user-created presentation data. Keep this\n  // allowlist explicit so device sessions, auth tokens, diagnostics, and\n  // cache/download state are never exported by accident.\n  "gys-accent-color",\n  "gys-bible-secondary-version",\n  "gys-bible-split-sync-scroll-v1",\n  "gys-bible-typography-v1",\n  "gys-chord-ui-prefs",\n  "gys-hymn-natural-chords",\n  "gys-hymn-view-scope",\n  "gys-hymn-viewer-prefs-v1",\n  "gys-kidung-active-playlist",\n  "gys-kidung-playlists-v1",\n  "gys-lyrics-font-size",\n  "gys-lyrics-header-collapsed",\n  "gys-lyrics-line-spacing",\n  "gys-lyrics-show-chords",\n  "gys-hymn-accidental",\n  "gys-speech-pitch-v1",\n  "gys-speech-volume-v1",\n];'''
if text.count(old) != 1:
    raise SystemExit(f"Expected one backup allowlist tail, found {text.count(old)}")
path.write_text(text.replace(old, new, 1))
