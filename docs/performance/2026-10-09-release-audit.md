# Release audit — 9 October 2026

## Loading and responsiveness

Sauh's loading card previously shrank to 68 px while its logo/bar/label needed
113 px, clipping the label. The loading state now owns an intrinsic card height;
logo and full label fit at 320/390/768/1440 px and 100/150% font size.

Production preview benchmark, 30 browser navigations on the local executor:
content-ready median **376.4 ms**, p95 **411.3 ms**. No duplicate application module
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

## Included pending fixes

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
