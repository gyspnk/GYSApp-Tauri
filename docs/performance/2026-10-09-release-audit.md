# Release audit — 9 October 2026

## Loading and responsiveness

Sauh's loading card previously shrank to 68 px while its logo/bar/label needed
113 px, clipping the label. The loading state now owns an intrinsic card height;
logo and full label fit at 320/390/768/1440 px and 100/150% font size.

Production preview benchmark, 30 browser navigations on the local executor:
content-ready median **373.7 ms**, p95 **385.3 ms**. No duplicate application module
requests were observed. These are browser measurements, not Android-device
latency or a guarantee for remote content/provider responses.

## Additional size reduction

Six additional doctrine PDFs were compacted with PyMuPDF 1.26.6, saving
**903,447 bytes** before native archive compression. All pages were compared at
144 DPI with identical pixels, text, geometry, images, drawings, links,
annotations, document metadata, and attachments. Original source hashes and
bytes remain in each PDF manifest's optimization record. The ten PDFs and
TimGM6mb soundfont remain bundled offline.

Three candidates (Roh Kudus, Perjamuan Kudus, Hari Sabat) failed the lossless
validation and retain their originals. No downsampling or capability removal
was used to obtain a smaller number. The repeated candidate audit confirmed no
additional reduction for the previously compacted Yesus Kristus booklet.

Reproduce a candidate with `python scripts/compact-faith-pdf.py Alkitab.pdf` on
its original manifest-matched source; optimized entries refuse repeated writes.

Existing size controls remain: release Rust `z`/LTO/single codegen unit/symbol
stripping, compact Bible SQLite, R8/minified non-debuggable ARM64 APK with
compressed JNI libraries, and solid-LZMA NSIS with the measured 64 MiB dictionary.
The earlier 64/128 MiB installer comparison did not justify raising the dictionary.
Native archive savings must be measured on the actual builds; source-byte savings
are not an APK/EXE size prediction.

## Included fixes

This release also includes compact account/profile menus, mobile overscroll
prevention, adaptive Kidung navigation and section transitions, truthful PDF byte
progress with animated stall notices, shared download-progress replay, and
partitioned BFF auth cookies for WhatsApp tracking with third-party restrictions.
The native bridge/provider readiness was checked against e-GYS production;
a complete real-account WhatsApp sign-in remains a separate device check.

Checks: Sauh bounds/font-scale regressions, navigation/scroll/animation coverage,
provider and cookie regressions, visual snapshots, unit/policy/generated-asset
checks, web/BFF typecheck, native Kotlin compile, bundle budgets, and native
packaging/provenance checks. GitHub Actions performs the native release builds
and Android runtime QA; APK and EXE sizes are recorded after those builds.

## Measured release artifacts

Packaged source: `114f28e5f81923db3473fed9775d7cc490b8aeb7`.
Compared with published `v0.1.0-preview.20261008.1`:

| Artifact          | Previous bytes | Current bytes | Saved bytes |
| ----------------- | -------------: | ------------: | ----------: |
| Android ARM64 APK |     36,274,675 |    36,270,243 |       4,432 |
| Windows x64 EXE   |     33,521,682 |    33,512,100 |       9,582 |

The additional archive reduction is small: the existing native compression
already removes much of the PDF source overhead. The 903,447 source-byte saving
must not be presented as a 903 KB APK/EXE saving. Keep the offline fallback data
and all instrument samples; removing them would change current capabilities.

Downloaded release assets match both SHA256 manifests and source provenance.
Android signing, compressed ARM64 JNI, ZIP alignment, and 16 KiB ELF checks pass.
Windows compilation and packaging pass; native Windows installation/runtime QA
was not performed on this Linux executor. Exact hashes and timings are recorded
in `2026-10-09-release-audit.json`.

## Explicit release workflow

`.github/workflows/release-request.yml` only starts automatically when
`.github/release-request.json` changes on `main`. It requires an existing draft
release and validates its tag. An ordinary app commit does not publish a release.
Change `requestId` only after the owner requests new release artifacts; `tag` and
`notes` identify that request. The workflow dispatches Android and Windows from
`main` with the exact requesting commit as the package input, waits for packaging,
Android 17 runtime and that commit's CI, then compares downloaded artifact hashes,
byte counts and provenance before publishing. A failed check leaves the draft
unpublished. It uses the workflow's GitHub token with explicit contents/actions
permissions and does not need a personal access token.

The MIDI audit also found that pause ignored a pending audio-context preparation.
Pause now invalidates that operation and keeps the player paused when preparation
finishes. The deferred-audio regression fails before the fix and passes after it.
The Media Session fixture now sustains its first note so automatic end-of-track
advancement does not race the explicit transport checks; ten parallel repetitions
pass without retry.

## Published verification

Preview release: [v0.1.0-preview.20261009](https://github.com/gyspnk/GYSApp-Tauri/releases/tag/v0.1.0-preview.20261009).
The public APK/EXE downloads were checked again after publication: both match
their SHA256 manifests, packaged source commit and recorded byte counts.

Final CI run `37875240588` passes all jobs: 741 browser cases pass on the first
attempt, one fullscreen lyrics gesture case passes on retry, and three
BFF-dependent cases are skipped. The MIDI transport case passes on the first
attempt in CI and also passes ten focused local repetitions without retry.
The gesture retry is retained in the evidence; this is not a zero-retry run.

Android run `37875257828` passes packaging and Android 17 emulator checks:
More/settings, cold restart, gesture and three-button navigation, portrait and
landscape cutouts, font scale 2.0, and absence of idle audio focus. Windows
packaging run `37875260212` and release verification run `37875240608` pass.
The publication retains preview signing limitations described in the release notes.
