# Native package size audit — 2026-10-08

Measure artifact bytes, not Cargo target-directory size. The published baseline
is `v0.1.0-preview.20261008` at `5a3a964`; local candidates also include pending
reader fixes. Neither local artifacts nor source changes have been published.

| Artifact         | Published baseline | Smallest local candidate | Reduction |
| ---------------- | -----------------: | -----------------------: | --------: |
| ARM64 APK        |        224,979,531 |               36,273,975 |     83.9% |
| Windows x64 NSIS |         37,749,587 |               33,621,057 |     10.9% |

These are the smallest **tested candidates**, not a proof of a global minimum.
Keep complete offline functionality rather than removing content or shifting
required assets to a first-run download.

## Repeated comparisons

The same compacted assets were used when comparing native optimization levels.
Both use full LTO, one code-generation unit, stripped symbols and panic unwinding.

| Candidate                                     | Native library/executable | APK/NSIS bytes |
| --------------------------------------------- | ------------------------: | -------------: |
| Android `s`, stored JNI                       |                42,244,720 |     44,258,115 |
| Android `z`, stored JNI                       |                41,028,880 |     43,042,275 |
| Android `z`, compressed JNI                   |                41,028,880 |     36,274,307 |
| Android `z`, compressed JNI, 16 KiB alignment |                41,028,880 |     36,273,975 |
| Windows `s`, 64 MiB NSIS dictionary           |                43,102,720 |     33,929,689 |
| Windows `z`, 64 MiB NSIS dictionary           |                41,095,168 |     33,621,057 |

Windows dictionary comparison repacked the published executable with identical
minimal NSIS wrappers to isolate compression, not installation behavior:

| Dictionary MiB | Wrapper bytes |
| -------------: | ------------: |
|              8 |    37,714,535 |
|             16 |    37,688,254 |
|             32 |    37,673,894 |
|             64 |    37,670,989 |

The 64 MiB dictionary covers the complete final executable and retains standard
solid LZMA. It increases installer extraction memory; app memory is unaffected.
Repeat the final executable with 64 and 128 MiB dictionaries: both minimal
wrappers are exactly 33,461,056 bytes. Keep 64 MiB because doubling dictionary
memory provides no additional reduction for the final payload.

## Additional aggressive packaging audit

Repack every Deflated entry of the final APK at ZIP compression level 9 while
preserving each decoded payload byte, then perform 16 KiB ZIP alignment and
sign again with the same local preview identity. The unsigned ZIP is 36,252,453
bytes, but the valid aligned/signed APK is **36,308,650 bytes**, 34,675 bytes
larger than the standard Gradle output. Signature verification, payload parity
and the ARM64/ELF checks pass. Reject the extra repacking pipeline: an unsigned
ZIP reduction does not demonstrate a smaller distributable package.

Together with the 64/128 MiB NSIS tie, native `s`/`z` comparisons and five SQLite
page-size trials, this preserves the smallest fully packaged candidates tested.
No runtime capabilities, offline content, panic recovery or asset quality are
removed for a misleading size reduction.

## Lossless asset audit

The Bible source had 6,865 free 1 KiB pages. VACUUM removes free pages while
retaining **every** table, index, row and row ID, including the old verse table.
Five page sizes were compared using Brotli quality 9, matching release assets.

|               SQLite page bytes | Database bytes | Brotli bytes |
| ------------------------------: | -------------: | -----------: |
| Original 1,024, with free pages |     21,340,160 |    5,020,240 |
|                 Compacted 1,024 |     14,009,344 |    3,567,031 |
|                 Compacted 2,048 |     13,246,464 |    3,494,890 |
|                 Compacted 4,096 |     12,922,880 |    3,456,976 |
|                 Compacted 8,192 |     12,812,288 |    3,457,088 |
|                Compacted 16,384 |     12,828,672 |    3,479,751 |

Choose 4 KiB by compressed package size. Recheck all rows/schema against the
original Git source, `integrity_check`, and the byte-identical generated browser
reader pack. Refresh the Bible, pack and asset manifests after changing bytes.
Three Python tests cover dry-run preservation, atomic/idempotent replacement,
and rejection of a candidate with altered row IDs.

All ten faith PDFs were audited for lossless object deduplication. Most gave
negligible savings after Brotli or became slightly larger; retain those originals.
`Yesus-Kristus.pdf` shrinks from 3,544,443 to 2,096,784 bytes without changing PDF
version, metadata, attachments, bookmarks, page geometry, text, links, annotations,
vector drawings or decoded images. All 26 pages render pixel-identically at
144 DPI. No image downsampling or font removal is performed. Its manifest retains
the official source URL and original SHA-256 beside the derivative digest.

TimGM (5,994,284 bytes), four fonts, both Bible representations, catalogs,
synthesis/PDF engines and all ten doctrine PDFs remain bundled. Post-build
asset/provenance verification passes. Twelve production browser tests render all
ten PDFs offline and exercise zoom/responsive reader behavior, without retries.

## Packaging verification and limits

Android: Rust 1.99.0, Tauri CLI 2.11.4, NDK 27.2.12479018, JDK 17,
Gradle 8.14.3. Signature verification, non-debuggable manifest, single ARM64 ABI,
ZIP alignment and 16 KiB ELF load alignment pass. All 25 exported JNI/native
entry points remain present. Tauri's generated and plugin consumer ProGuard
rules are preserved; plugin class names remain in the release DEX.
The packaging workflow repeats the APK ABI/compression/ELF check. Three tests
reject a 4 KiB-only library, a wrong ABI and stored JNI, and accept the compatible
package; together with the database tests, all six Python checks pass.

Compressed JNI changes **download size versus installed footprint**: Android
extracts the intact library once during installation. Installed disk usage is
larger than the stored-JNI candidate, although much smaller than the old debug
APK. Runtime does not perform custom extraction or download required files.

Windows: cross-built on Linux with cargo-xwin 0.23.1, Rust 1.99.0 and NSIS 3.08.
Both candidates use the same SDK/compiler/installer configuration. The final
installer was produced by Tauri's NSIS template with the small dictionary hook.
This validates compilation and packaging sizes; Windows installation, WebView2,
account/keyring, MIDI/audio and restart acceptance still require Windows native
QA. Android device runtime/installation acceptance is also pending. Local preview
signing is not a stable production upgrade key; Windows remains unsigned.

## Reproduce

To compact an original Bible source and refresh its package hashes:

```sh
python scripts/compact-bible-database.py --write
node scripts/generate-offline-manifest.mjs
python -m unittest discover -s scripts -p 'compact_bible_database_test.py'
```

To reproduce the audited PDF derivative from the original official file and
original manifest, install the generator-only `PyMuPDF==1.26.6` and run
`python scripts/compact-faith-pdf.py`. The tool verifies content before replacing
the source and records original provenance. It refuses interactive/protected PDFs
and skips the already compacted booklet. PyMuPDF is not an app/runtime dependency.

After Android initialization, use `pnpm --filter @gys/native bundle:android`.
Use `pnpm --filter @gys/native bundle:windows` on Windows. Override
`CARGO_PROFILE_RELEASE_OPT_LEVEL=s` or `z` to repeat native profile comparisons;
copy each artifact before building the next. Run native QA before publishing.
Ordinary pushes do not dispatch packaging or update a release.
