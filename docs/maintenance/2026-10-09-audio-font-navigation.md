# Android audio, system typography and hymn Back navigation

- Remove the global click/touch audio-unlock warm-up. It played a silent WAV
  during ordinary navigation and could interrupt another Android media app.
  Keep the lock-screen bridge only while MIDI or Bible speech is actually playing.
- Visibility restoration resumes an existing, playing MIDI context only. It
  neither creates a context nor resumes paused playback.
- Set WebView `textZoom` from Android `Configuration.fontScale` on creation,
  configuration changes and resume. Font scaling is independent of PDF zoom,
  icon dimensions and display density.
- Use relative font sizes across styles and reader text, preserving typography
  preferences as base sizes. Browser default text size can now affect text;
  Android applies its native accessibility scale. Standard mobile typography
  starts at 112.5% (18px with the browser's 16px default).
- Replace the current history entry when switching hymns from either song
  controls or verse boundaries. Back returns to the originating hymn list
  rather than replaying the sequence of hymn changes.

## Verification

- 437 web unit tests pass, including regressions that previously activated
  silent audio on unrelated gestures and created an idle context on resume.
- 13 browser regressions pass without retries: hymn mode/history, text scaling
  on mobile/desktop, MIDI toggle, persistent dock and dock animation.
- Android ARM64 release Kotlin compilation passes. The Actions smoke additionally
  checks idle audio focus and enlarged text under Android `font_scale=2.0`.
- Other applications' actual playback interruption and device-specific font
  settings still need physical-device acceptance; focus diagnostics alone do
  not demonstrate every OEM media policy.

The preceding Android 17 credential/inset fix passed native Actions run
[37786619576](https://github.com/gyspnk/GYSApp-Tauri/actions/runs/37786619576).
Cloudflare production deployment remains pending owner credentials; follow the
[Worker setup guide](../cloudflare-worker-setup.md).
