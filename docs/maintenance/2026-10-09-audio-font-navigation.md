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
- 52 distinct browser regressions pass across targeted runs: hymn mode/history,
  system text scaling, MIDI toggle/dock, Bible and lyrics zoom, Faith pinch,
  appearance at 200% text, PDF loading and reader preferences. Legacy fixed-pixel
  zoom assertions now measure the base size relative to the system font size.
- Android ARM64 release Kotlin compilation passes. The Actions smoke additionally
  checks idle audio focus and enlarged text under Android `font_scale=2.0`.
- Other applications' actual playback interruption and device-specific font
  settings still need physical-device acceptance; focus diagnostics alone do
  not demonstrate every OEM media policy.

The preceding Android 17 credential/inset fix passed native Actions run
[37786619576](https://github.com/gyspnk/GYSApp-Tauri/actions/runs/37786619576).
Cloudflare production deployment remains pending owner credentials; follow the
[Worker setup guide](../cloudflare-worker-setup.md).

## Native Actions evidence

The APK build in [37854922569](https://github.com/gyspnk/GYSApp-Tauri/actions/runs/37854922569)
passes packaging, signing and alignment checks: 36,278,195 bytes, ARM64,
compressed JNI and 16 KiB ELF alignment. Its application source is `8bbadcd`;
subsequent commits refine tests only.

The first native run confirms that neither Home startup nor navigation to More
owns Android audio focus. Font checking initially stopped because Chromium
exposes the styled heading as `JELAJAHI KOLEKSI`, including CSS capitalization.
The test now uses that observed label; a follow-up run uses the same APK.

The follow-up [Android 17 run 37856493769](https://github.com/gyspnk/GYSApp-Tauri/actions/runs/37856493769)
passes all native checks. At system font scale 2.0 the heading grows from 52 to
103 physical pixels while the WebView safe viewport stays unchanged. Three-button
and gesture navigation, tall cutout, landscape and cold restart also pass.

Browser regression assertions account for system text size and wrapped chord
rows; mobile/tablet screenshot baselines reflect the intentionally larger fonts.
The updated visual fixtures retain viewport/overflow checks and were reviewed
for Home, Kidung, Lainnya, lyrics, Faith and literature.
