# Reader gesture and active SoundFont audit

Local source baseline: `6e7cc7cface5d4c52977d1d61cd098ec62069e47`.
Remote `main` was read with `git ls-remote`, and matched that SHA.
This workspace started clean; its stash and unreachable Git objects contained
none of the previous uncommitted history/transition/PDF/SQLite relocation work.
Those earlier changes remain unrecovered. No empty commit, native build, tag,
release, or push was made for this audit.

## Reproduction and changes

- Real Chromium CDP touch reproduced a vertical Bible gesture ending sideways
  changing Kejadian 1 to 2. The candidate now tracks finger identity, each
  movement's intent, multitouch, cancellation and a 650 ms time budget. Vertical
  or diagonal intent stays cancelled for the rest of the gesture; deliberate
  horizontal swipes and chapter buttons remain available.
- Reader pinch had a computed 160 ms font transition. Its pointer moves updated
  React state; fullscreen moves also wrote the saved font and triggered autofit.
  Both now preview the latest font through one animation frame, without layout
  reads in the move handler. Preferences commit once on release. Cancel, lost
  capture, route/verse changes and unmount clear pending frames and captures.
  Fullscreen prevents browser pinch takeover while allowing vertical scrolling.
- At 768 px, zoomed single/two-page PDFs in Faith, Literature and Kidung placed
  their left edge approximately 193–543 px before the scroll origin. Chromium's
  block layout still honored the stage's unsafe `justify-items: center`.
  Resetting this alignment restores a positive origin while keeping inner paper
  centering at fit. Vertical/horizontal layouts were checked separately.
  Pinch-to-one-finger continuation preserves pan and clears the zoom anchor.
  Faith's changing progress callback also caused a render loop; page progress
  now reports only on actual page/total changes.
- Android's reviewed `apps/native/android/MainActivity.kt` now paints a native
  view behind the status bar. Cached/default accent covers cold launch; web
  accent changes, resume and configuration requests synchronize the hex color.
  Relative luminance determines icon contrast. Existing consumed system/cutout
  and IME padding remains native-owned. AndroidX origin-scoped messaging accepts
  strings matching six-digit hex only from the native main frame. The callback
  uses a typed interface, with no JavaScript reflection methods requiring R8
  name preservation; existing JNI and plugin keep rules remain intact.
- MIDI defaults and legacy `instrument: -1` now resolve to preset 0 (piano).
  All 128 selectable programs remain available; the option to take a program
  from the MIDI file is removed from all four control surfaces. FluidSynth
  ignores file program/bank changes and selects the chosen preset from the
  active SoundFont before notes. Percussion uses that bank's standard drum kit.
  Installing/removing GeneralUser invalidates the live bank and rendered deck;
  compatible PCM caches remain separated by bank and chosen program. A failed
  active bank/synthesis surfaces an error instead of substituting an oscillator
  or quietly replacing an unreadable bank.

## Verification scope

The browser suites cover mouse drag and genuine CDP touch, all four PDF layouts
in three viewers, fit/centering, vector/detail rendering, controlled render
memory, pinch continuation, font preference writes, cancelled pinch, Bible
scroll/diagonal/multitouch/cancel and intentional horizontal navigation. Existing
responsive checks exercise 320/390/768/1440 px. A real FluidSynth PCM regression
compares file program/bank changes against selected SoundFont presets.

Native configuration-copy tests and web accent bridge tests cover source setup,
normalization and lifecycle messages. Android SDK/emulator are unavailable here:
Android compilation, actual status bar color, rotation, notch, keyboard and R8
installation remain **unverified**. No APK/EXE was built.

The canonical TB JSON remains SHA256
`7b022c06f36ef2d0fedef894f9297ddc8f4573d08184c77f4ba2d00352a83d3c`.
Bundle/asset/provenance/documentation checks are run against the local web build;
these are local results, not GitHub Actions evidence.

## Local check results

- `pnpm verify:prepush` passed formatting, documentation, generated provenance,
  workspace typechecks and tests, including 449 web tests.
- Production web build passed; `pnpm verify:bundle` measured initial JavaScript
  gzip at 178.6 KiB against the 180 KiB budget.
- `pnpm verify:native-assets` passed: 25 files, 24,299,460 runtime asset bytes.
- The latest 37-case browser run covered gestures, three PDF viewers/four
  layouts, Bible zoom and actual FluidSynth playback/cache behavior. 36 passed
  immediately; one Bible case passed on retry after a five-second initial-data
  readiness timeout, before any gesture ran. Only that readiness wait was
  adjusted to 20 seconds; gesture assertions were retained.
- A no-retry follow-up passed all nine gesture cases and five PDF layout cases.
  Its last PDF case hit the same initial-data readiness limit while typechecks
  ran concurrently. The initial canvas wait now matches the existing shared
  viewer suite's 20-second budget; layout assertions remain unchanged.
- The final six-case PDF layout run passed with retries disabled. Together
  with the no-retry gesture follow-up, all 43 distinct browser cases have
  successful coverage on the latest production build.
- Remote main was checked again after verification and remained the baseline
  SHA. The user subsequently authorized committing these verified fixes
  directly to main. Native build, tag and release restrictions remain in force.
