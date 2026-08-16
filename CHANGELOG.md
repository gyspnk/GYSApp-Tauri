# Changelog

## Unreleased — GA hardening slice

- Guarded asynchronous MIDI load/render operations with a shared generation
  gate. Superseded worker/WASM results are discarded before they can replace
  the shell-level player, including during rapid song, seek, stop, tempo,
  transpose, or instrument changes. The Kidung caller and queue now honor
  stale-load results, and a focused unit suite covers the operation contract.
- Lazy-loaded the chord-to-PDF coordinate mapper so normal text-first Kidung
  navigation does not download PDF.js until chord verification or the PDF
  reader is actually requested. The route chunk and initial JavaScript budget
  remain below the release gate while canonical chord/PDF behavior is intact.

- Added a square official-logo mark for the favicon and PWA manifest. Browser
  metadata now resolves under GitHub Pages base paths, declares the actual SVG
  icon shape, and has a runtime regression check for 404s and manifest warnings.
  The shell cache is v10 so existing PWA clients cannot retain the old icon
  metadata after an update.
- Fixed deep-route metadata resolution so `/kidung/:songId` and other direct
  Pages links request the favicon and manifest from `/GYSApp-Tauri/` instead of
  a route-relative `/kidung/` directory; the regression flow covers the real
  hymn detail route.
- Hardened production PWA registration for reduced webview/service-worker
  implementations and made the generated asset manifest authoritative for
  bundled music seeds, removing guaranteed Pages MIDI 404 probes before
  canonical fallback loading. Registration guards now also tolerate a reduced
  environment that resolves the registration promise to `undefined`.
- Fixed the e-GYS WhatsApp handoff so popup reservation remains detectable in
  browsers that return a null WindowProxy for `noopener`; the opener is
  severed before the reserved window navigates to WhatsApp.
- Hardened the shared PDF reader lifecycle: loaded documents and virtualized
  page operator lists are cleaned up on route/song/retry transitions, and both
  hymn and Literature PDF failures keep an explicit in-shell `Coba lagi`
  action. Added browser coverage for the Literature failure path.
- Added stale PDF.js page cleanup for promises that resolve after navigation or
  unmount, and bounded the verified TJC cover/media service-worker cache to 96
  entries so long browsing sessions do not grow local storage without limit.
- Offline pack updates now have a versioned manifest check/diff flow: changed
  local assets are staged and SHA/size-verified before the active pointer is
  swapped, removed entries are cleaned afterward, and the More screen keeps a
  single update action with retryable status instead of adding another menu.
- Literature article progress now exposes a direct jump back to the saved
  scroll position; the action is no longer hidden inside the PDF-only control
  group.
- e-GYS synchronization now captures the verified upstream Springdoc/OpenAPI
  runtime boundary and enablement property in the generated contract, while
  keeping request/response schemas source-owned until the runtime document is
  available; no guessed API shapes are introduced.
- Refreshed the e-GYS route lock from upstream commit `022158f` and recorded
  the compatible branch-detail/update and region routes. The refresh command
  now keeps the prior contract as its breaking-change baseline, so forcing a
  checkout can never bypass compatibility checks.
- PDF reading progress is now keyed by the immutable fork/canonical resource
  version and the internal reader exposes a compact “Kembali ke halaman …”
  action after the user moves away from the saved location. Invalid saved pages
  are clamped to the current document instead of being reused blindly.
- Text-mode Kidung now has a bounded responsive auto-fit measurement for long
  chord/lyric lines, and key selection computes musical transpose from the
  verified source key instead of only changing a label. PDF/Text chord labels,
  MIDI transpose, and accidental presentation remain one shared state.
- Text-mode chord presentation now follows the measured visual lyric rows like
  the canonical gyschordweb viewer: wrapped lines keep their note-relative
  markers, while chord labels remain a lightweight DOM overlay instead of a
  per-character layout cell.
- Added per-hymn text typography controls with bounded persisted font size and
  line height, a persisted horizontal PDF mode, and a responsive two-page guard
  that uses a single readable page below 720 px. The global MIDI session now
  exposes source-program playback plus all 128 General MIDI instruments and
  persists instrument/tempo/transpose/volume preferences; Kidung transpose is
  synchronized with that session.
- Debounced identical Bible/hymn activity writes to prevent duplicate “recent”
  entries during route remounts and React Strict Mode effects.

- Hardened Sauh Bagi Jiwa and Suara Sejati normalization: missing/invalid dates
  and unreadable entries are discarded, links/images are constrained to trusted
  TJC origins, and the Home outage state no longer invents Daily Verse content.
  The shell performance flow now samples five navigations and records median,
  p95, and duplicate-module evidence.
- PDF and chord failure panels now keep recovery inside the hymn shell with an
  explicit retry action. The release E2E suite covers the forced failure path
  and the initial shell performance/module-duplication sanity gate.
- BFF deployment bindings now reject insecure e-GYS URLs and non-TJC content
  overrides, falling back only to packaged or canonical TJC sources; living
  README/architecture diagrams are validated by a repository-managed
  documentation gate in hooks and CI.
- Native Tauri webviews now use an app-data key-value/blob bridge with
  path-safe keys, unique temporary files, atomic replacement, and allowlisted
  external URL handoff; browser builds keep their PWA adapter.
- Bible split-pane state and pointer geometry now live in a dedicated tested
  controller, keeping drag/persistence logic out of the reader component.
- Fixed missing split-ratio storage being interpreted as `0%` (and collapsing
  the pane to 42%), and added an ultra-narrow 320px header layout that keeps
  actions inside the viewport.
- Added Axe accessibility coverage for Home/Kidung (including color contrast)
  and keyboard-visible focus coverage for the mobile Bible reader; dark/light
  muted tokens now meet the tested WCAG AA contrast threshold.
- Expanded the Windows native CI gate to run Rust formatting, unit tests, and
  clippy with warnings denied in addition to `cargo check`.

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
- Reduced PWA activation work by splitting the service-worker v10 cache into a
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
- Daily Sauh selection now prioritizes the publisher’s canonical date slug over
  unrelated posts edited on the same day; the obsolete static Psalm fallback
  was removed. Scoped diagnostics redact bearer/token/API-key values and cover
  content, assets, PDF, TTS, MIDI, Bible, literature, feedback, and e-GYS
  failures. PDF release smoke now verifies a rendered canvas and download link,
  while MIDI smoke verifies minimize/restore.
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
- Reframed Kidung as two persisted presentation modes (Lirik/PDF) with a
  shared chord capability. Note-aligned v2 markers now render as a DOM layer
  over PDF.js canvases and as the same-source Text mapping; transpose and
  sharp/flat changes update labels without decoding the PDF again. Mode tabs
  remain responsive, keyboard-visible, and reduced-motion aware.
- Hardened the e-GYS boundary with typed provider/session schemas, explicit
  provider-exchange tests, HttpOnly cookie forwarding assertions, and correct
  normalization of the upstream WhatsApp READY response.
- Added a native packaging asset gate that fails when the Tauri frontend
  boundary omits any required Bible, hymn, soundfont, FluidSynth, or logo
  asset; the current verified core is 36,845,594 bytes.
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
- Preserved the bundle gate: 81.0 KiB gzip main application chunk and 164.6
  KiB gzip initial JavaScript; the Bible search worker, PDF.js, and its worker
  remain lazy-loaded while
  FluidSynth/WASM and TimGM stay same-origin on-demand assets.

The release is not declared GA until protected e-GYS/OAuth secrets, native
signing, device visual/accessibility evidence, and the remaining platform
artifact pipelines are available.
