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
- Made the GYSAPP-Fork KR master PDF (immutable source commit) the primary
  viewer/download source, with signed GYSApp-Data package fallback and PDF
  signature validation.
- Added local e-GYS upstream synchronization and generated API/OAuth contract
  snapshots. The verified authentication boundary is provider ID-token
  exchange with an HttpOnly session cookie; no unsupported callback route is
  invented. Raw upstream checkouts stay ignored and cannot be staged.
- Added repository-managed pre-commit/pre-push gates, provenance checks,
  Mermaid architecture/lifecycle documentation, and a progress/release ledger.
- Added versioned local-storage migrations, diagnostics redaction, an asset
  manifest/cache lifecycle, atomic offline-pack installation, and bounded
  music prefetch/cache hints.
- Added the local PDF.js reader flow for TJC literature through an allowlisted
  BFF PDF/range proxy, with page-aware resume and a deduplicated “Terakhir
  dilihat” shelf.
- Added a continuous GYSChordWeb-style PDF mode with lazy per-page rendering,
  keyboard focus, smooth page jumps, and bounded mobile memory use.
- Added a same-origin canonical music proxy for MIDI/chord/PDF/soundfont bytes,
  with immutable source-commit checks and raw-asset fallback to prevent binary
  loads from being blocked by browser CORS/range behavior.
- Expanded the TB reader with sanitized source text, token/phrase/whole-word
  search, query history, chapter scrubber, swipe navigation, split reading,
  persistent bookmarks, verse selection, highlights, notes, copy, and share.
- Added chord-token alignment, negative-cache protection, sanitized Sauh and
  Suara snapshots, visual regression coverage, and real Cargo checks for the
  native package.
- Preserved the bundle gate: 100.9 KiB gzip main application chunk and 135.7
  KiB gzip initial JavaScript; PDF.js and its worker remain lazy-loaded.

The release is not declared GA until protected e-GYS/OAuth secrets, native
signing, device visual/accessibility evidence, and the remaining platform
artifact pipelines are available.
