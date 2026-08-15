# Changelog

## Unreleased — GA hardening slice

- Native Tauri webviews now use an app-data key-value/blob bridge with
  path-safe keys, unique temporary files, atomic replacement, and allowlisted
  external URL handoff; browser builds keep their PWA adapter.
- Bible split-pane state and pointer geometry now live in a dedicated tested
  controller, keeping drag/persistence logic out of the reader component.
- Fixed missing split-ratio storage being interpreted as `0%` (and collapsing
  the pane to 42%), and added an ultra-narrow 320px header layout that keeps
  actions inside the viewport.

- Enforced the e-GYS local-only synchronization boundary: the scheduled
  GitHub Actions sync workflow and CI upstream fetch were removed, and a
  repository policy guard now fails verification if a workflow tries to clone,
  fetch, or invoke the private upstream. Maintainers continue to use the
  authenticated local pre-commit/pre-push hooks.
- Expired missing-song chord negative-cache entries after the 14-day rollback
  retention window, allowing a newly published song to recover without
  restarting the app. Asset downloads now share one in-flight request per
  versioned resource, including safe per-caller cancellation.

- Replaced per-keystroke Kidung lyric rescans with a reusable normalized index:
  ordered number/title lookup, prefix matching, AND terms, quoted phrases, and
  collection filtering now remain responsive on small devices.
- Virtualized vertical PDF canvas lifecycles: pages outside the preload window
  release their canvas and render task, while the first pages remain available
  for a fast initial frame. BFF Literature and Suara Sejati caches now share
  simultaneous upstream requests instead of issuing duplicate fetches.
- Native CSP now explicitly allowlists the verified TJC and immutable
  gyschordweb origins required by direct Sauh, chord, PDF, and MIDI loading;
  the canonical Sauh endpoint is attempted before the optional BFF proxy.

- Reproduced the canonical GYSChordWeb note-aligned PDF mapping in typed
  TypeScript: dominant notation-font detection, multi-character note splitting,
  lyric-row matching, relative chord positions, and responsive character cells
  are covered by golden tests and a Playwright media flow. The chord surface
  now uses this layout when the verified canonical song PDF is available and
  keeps a readable note-index fallback when it is not.
- Added per-song chord content in-flight deduplication and an in-memory MIDI
  PCM render cache keyed by source hash, TimGM soundfont, tempo, transpose,
  instrument, and sample rate with a 96 MB LRU cap. These prevent duplicate
  network/render work while keeping the initial bundle lazy.
- Added bounded/cancellable e-GYS provider SDK, Google prompt, and Apple popup
  flows so external authentication cannot remain indefinitely in a loading
  state; timeout/cancellation behavior is unit-tested.

- Moved the 31,172-verse TB search index behind a lazy module worker with a
  four-second startup timeout, cancellation of stale queries, and a typed local
  fallback. Long verse lists now opt into content-visibility to keep scrolling
  responsive on small devices.
- Added a source-context action to the global media session, so a minimized or
  expanded player can return to the active Bible verse or hymn without
  restarting playback. The minimized surface keeps a compact title/progress
  summary, clamps persisted coordinates after viewport changes, and Media
  Session handlers no longer re-register on every position tick.
- Reduced PWA activation work by splitting the service-worker v8 cache into a
  compact shell/index precache and a background-only TimGM/FluidSynth/MIDI
  warm-up. Heavy assets are skipped on Save-Data/2G connections and no longer
  block the first usable frame.
- Merged Home Daily Verse with the current Sauh Bagi Jiwa record and added
  internal `/sauh`, `/suara`, and `/suara/:postId` routes. The BFF now exposes a
  safe, bounded TJC article reader that strips executable markup, decodes
  entities, validates the response, and keeps the official source link as an
  explicit secondary action; Pages previews without a Worker use a similarly
  sanitized WordPress post-feed fallback.
- Added Bible title-drag/keyboard chapter quick navigation, a contextual
  selection toolbar for copy/share/note, and quoted phrase search with Unicode
  normalization. Duplicate external content opens were removed from the
  primary flow.
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
  minimizable media surface and route-persistent activity. MIDI now prefers a
  same-origin local FluidSynth worker with TimGM caching, explicit oscillator
  compatibility fallback, seek/volume/mute/tempo/transpose controls, Media
  Session, and wake-lock handling.
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
- Added a per-hymn, persisted Lirik/Chord/PDF mode selector so only one viewer
  surface is mounted at a time; mode tabs are responsive, keyboard-visible,
  and reduced-motion aware.
- Hardened the e-GYS boundary with typed provider/session schemas, explicit
  provider-exchange tests, HttpOnly cookie forwarding assertions, and correct
  normalization of the upstream WhatsApp READY response.
- Added a native packaging asset gate that fails when the Tauri frontend
  boundary omits any required Bible, hymn, soundfont, FluidSynth, or logo
  asset; the current verified core is 36,844,871 bytes.
- Added a same-origin canonical music proxy for MIDI/chord/PDF/soundfont bytes,
  with immutable source-commit checks and raw-asset fallback to prevent binary
  loads from being blocked by browser CORS/range behavior.
- Expanded the TB reader with sanitized source text, token/phrase/whole-word
  search, query history, chapter scrubber, swipe navigation, split reading,
  persistent bookmarks, verse selection, highlights, notes, copy, and share.
- Connected Bible read-aloud to the shared SpeechProvider/orchestrator with
  verse-range queueing, persistent voice/rate controls, local-voice status, and
  audio conflict coordination with MIDI.
- Added chord-token alignment, negative-cache protection, sanitized Sauh and
  Suara snapshots, visual regression coverage, and real Cargo checks for the
  native package.
- Preserved the bundle gate: 80.1 KiB gzip main application chunk and 156.3
  KiB gzip initial JavaScript; the Bible search worker, PDF.js, and its worker
  remain lazy-loaded while
  FluidSynth/WASM and TimGM stay same-origin on-demand assets.

The release is not declared GA until protected e-GYS/OAuth secrets, native
signing, device visual/accessibility evidence, and the remaining platform
artifact pipelines are available.
