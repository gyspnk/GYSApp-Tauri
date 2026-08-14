# Changelog

## Unreleased — GA hardening slice

- Unified the Home “continue” surface so the same recent activity is not shown
  twice; Daily Verse now selects today’s Sauh Bagi Jiwa entry and keeps its
  source, verse, and image provenance.
- Added real TJC literature catalog enrichment with 279 verified cover images,
  lazy/fallback cover rendering, detail routes, favorites, reading progress,
  PDF validation, and offline Cache Storage downloads.
- Added one global, keyboard-accessible search index for Kidung, literature,
  Iman, Sauh Bagi Jiwa, and Suara Sejati, using the checked-in offline packs as
  the offline-first baseline and fresher BFF data when available.
- Kept Kidung’s canonical gyschordweb PDF/chord/MIDI boundaries, with a shared
  minimizable media surface and route-persistent activity.
- Added local e-GYS upstream synchronization and generated API/OAuth contract
  snapshots. The verified authentication boundary is provider ID-token
  exchange with an HttpOnly session cookie; no unsupported callback route is
  invented. Raw upstream checkouts stay ignored and cannot be staged.
- Added repository-managed pre-commit/pre-push gates, provenance checks,
  Mermaid architecture/lifecycle documentation, and a progress/release ledger.
- Preserved the current bundle gate: roughly 99.2 KiB gzip main application
  chunk and 127.9 KiB gzip initial JavaScript; PDF.js and its worker remain
  lazy-loaded.

The release is not declared GA until protected e-GYS/OAuth secrets, native
signing, device visual/accessibility evidence, and the remaining platform
artifact pipelines are available.
