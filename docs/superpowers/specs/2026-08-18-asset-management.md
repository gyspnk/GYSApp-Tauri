# Asset Management and Optional Distribution Specification

## Problem Statement

The web/Tauri application has a generic offline pack updater, but Settings does
not expose a complete asset manager. GitHub Pages should install only the small
core pack during service-worker installation, while the downloadable builds and
the web asset manager should offer the optional Bible and hymnal assets already
released in GYSApp-Data. The current Bible reader is TB-only JSON and the hymn
catalog is primarily KR, so simply adding release URLs would create assets that
are downloaded but not usable.

## Solution

Add a versioned distributed-asset catalog backed by the stable manifests in
GYSApp-Data. Normalize the three release tracks (bibles, hymnals, soundfont)
into a single catalog, display every supported asset in a new Manajemen Aset
surface inside Pengaturan, and install optional packages only after checksum
verification and package decoding. Keep the Pages service worker limited to the
core offline assets and cache the catalog metadata so the manager remains
discoverable offline.

The browser implementation will decode the Fork-compatible GYSPKG1 format
(AES-SIC/CTR, PKCS#7, gzip) in a lazy code path. Bible packages are SQLite
databases; a lazy SQLite WASM adapter will project their `book` and `bible`
tables to the existing BibleReaderPack shape. Hymnal metadata/indexes are
derived from the pinned GYSAPP-Fork structure while master PDFs are downloaded
from GYSApp-Data. Installed records are versioned and swapped atomically so a
failed update leaves the previous usable asset intact.

## User Stories

1. As a GitHub Pages visitor, I want the shell and core Bible/hymn indexes to be
   cached automatically during service-worker installation, so the app opens
   offline without downloading every optional package.
2. As a Pages visitor, I want to see the complete asset manager even when the
   network is unavailable, so I can distinguish bundled assets from assets that
   require an online download.
3. As a reader, I want to see Terjemahan Baru, KJV, and CUV as separate Bible
   versions, so I can select the translation I need.
4. As a reader, I want a downloaded KJV or CUV package to open in the existing
   chapter, search, split-view, bookmark, note, and speech flows, so download
   status reflects real usability.
5. As a hymn user, I want KR, English/HYMNE, Mandarin/MDR, and ASM-I/M/P
   collections listed separately, so I can download only the song books I use.
6. As a hymn user, I want the downloaded hymnal PDF and its matching catalog
   metadata to be selected automatically, so opening a song does not fall back
   to a missing KR-only path.
7. As a musician, I want GeneralUser-GS available as an optional SoundFont,
   so I can choose the larger instrument bank without inflating first load.
8. As a user on limited storage, I want package sizes and installed sizes shown
   before downloading, so I can make an informed choice.
9. As a user with an unreliable connection, I want download progress, cancel,
   retry, and failure feedback, so a transient failure is recoverable.
10. As a user updating an installed asset, I want checksum and size validation
    before activation, so an interrupted or corrupted package cannot replace a
    working version.
11. As a user removing an optional asset, I want only that asset removed while
    core assets and other installed versions remain usable.
12. As a maintainer, I want GYSApp-Data release manifests and immutable release
    URLs validated against an allowlist, so the manager cannot become an
    arbitrary network fetcher.
13. As a maintainer, I want the local catalog snapshot to act as an offline
    fallback while runtime refresh uses GYSApp-Data, so a temporary raw GitHub
    outage does not hide the manager.
14. As a maintainer, I want the service worker's core list to exclude optional
    Bible, hymnal, and GeneralUser payloads, so activation remains within the
    startup budget.
15. As a maintainer, I want generated catalog provenance to identify the
    GYSApp-Data manifest/release and GYSAPP-Fork metadata source, so later asset
    changes are auditable.

## Implementation Decisions

- Use the stable `latest/bibles-manifest.json`, `latest/hymnals-manifest.json`,
  and `latest/soundfont-manifest.json` files in GYSApp-Data for runtime catalog
  refresh. Keep a generated same-origin snapshot as the offline fallback.
- Keep the existing core `AssetManifestV1` and service-worker shell contract
  for Pages. Add a separate distributed catalog model rather than forcing
  release packages into the core local/remote asset list.
- Supported distributed definitions are `b_tb`, `b_kjv`, `b_cuv`, `KR`,
  `HYMNE`, `MDR`, `ASM-I`, `ASM-M`, `ASM-P`, and `GeneralUser-GS`. TB and KR
  remain bundled/core; all other definitions are optional and removable.
- Validate catalog track, code, release tag, install filename, positive size,
  SHA-256, and release URL. Trust only the GYSApp-Data raw manifest host and
  GitHub release asset hosts needed after redirect.
- Download the package as a stream where possible, report progress, verify the
  package byte count and SHA-256, then decode it. A package with the `GYSPKG1`
  header uses AES-256 SIC/CTR with the Fork key and a 128-bit counter, removes
  valid PKCS#7 padding, and is gzip-decoded. Non-GYSPKG payloads are copied as
  raw bytes for SoundFont compatibility.
- Store decoded payloads in a versioned browser asset cache and store a small
  installed registry separately. Swap the registry only after the payload is
  fully written and verified; retain the previous registry/cache entry until
  the new pointer is active.
- Load the optional SQLite runtime only when an installed Bible version is
  selected. Query the same stable columns used by the canonical generator:
  `book(id, bs, bl, c)` and `bible(b, c, v, t)`. Project results to the current
  `BibleReaderPack` contract so existing navigation/search UI can remain the
  highest-level seam.
- Generalize the Bible reader pack translation field from the TB literal to a
  non-empty code while preserving TB's existing source and generated data.
  Persist the selected Bible code and scope reading position keys by code to
  prevent KJV/CUV positions from being mixed with TB.
- Generate optional hymn catalog/index metadata from the pinned
  GYSAPP-Fork structure. Use GYSApp-Data release packages for master PDFs and
  resolve the selected hymnal's local decoded PDF before falling back to the
  existing KR source path.
- Add a Manajemen Aset section under the existing Data & Offline Settings area.
  It will show grouped rows with title, code, status, release/version, size,
  progress, Download/Update/Stop/Delete actions, and a refresh action. Bundled
  rows are visibly installed but cannot be deleted.
- Keep existing core pack verification controls. The new manager controls
  optional distributed assets and does not make the initial service-worker
  install wait on release downloads.
- Make the catalog loader and package manager injectable at the module seam so
  tests can supply manifest fixtures, package bytes, and an in-memory cache
  without hitting GitHub.

## Testing Decisions

- Test public behavior at the contract/manager seam: valid manifests normalize
  to the supported rows; malformed tracks, URLs, sizes, checksums, or duplicate
  codes are rejected; runtime fetch failure falls back to the snapshot.
- Add decoder fixtures for a raw payload and a GYSPKG1 payload. Assert that the
  decoder reproduces the SQLite header and rejects invalid padding, bad header,
  and truncated ciphertext.
- Add package-manager tests for checksum/size failure, cancellation, update
  atomicity, registry persistence, delete, and concurrent deduplication. Use the
  existing BrowserAssetStore cache test style and a real in-memory cache seam.
- Add Bible adapter tests using a tiny SQLite fixture with `book` and `bible`
  tables. Assert code-specific books/verses/search data and fallback to TB when
  an optional package is absent.
- Add hymnal resolution tests for each supported code and verify that the
  matching installed PDF is selected before the bundled/fork fallback.
- Add component tests for the Settings manager rows and progress/status actions
  using the existing Vitest/React test conventions.
- Extend service-worker/documentation tests to prove optional release payloads
  are not in the install-time core list while the catalog snapshot is.
- Run the existing unit suite, typecheck, build, generated-provenance checks,
  and Playwright settings/offline smoke flows after implementation.

## Out of Scope

- Replacing the GYSApp-Data release process or publishing new release assets.
- Downloading all optional packages automatically on first launch.
- Adding faith PDFs or arbitrary third-party asset sources to this first manager
  slice; the catalog boundary can support them later.
- Rewriting the existing PDF/chord/MIDI readers beyond the hymnal asset
  resolution needed for the supported collections.
- Treating the static client-side package key as a confidentiality boundary;
  HTTPS, release checksum, and source allowlisting remain the integrity model.

## Further Notes

The GYSAPP-Fork asset manager is the behavior reference, not the binary source
for optional downloads. GYSApp-Data remains the authoritative distribution
source for the packages released by the project. The current TB/KR generated
assets and the prior Suara Sejati pagination changes must remain untouched
unless a new test demonstrates a direct integration requirement.
