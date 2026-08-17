# Changelog

## Unreleased — GA hardening slice

- Bible search now supports testament narrowing: “Perjanjian Lama (39)” and
  “Perjanjian Baru (27)” sit above the per-book choices in the Kitab
  selector and map to a typed `testament` search option enforced by the
  repository on canonical `bookOrder` (40+ = NT), shared by the worker and
  main-thread fallback. Unit coverage proves both bounds, and a browser E2E
  verifies OT search shows Kejadian but no NT book and vice versa.
- The native persistence boundary now enforces payload caps: verified blobs
  are bounded at 128 MB and key-value/database records at 8 MB, mirroring
  the existing secret and file-dialog limits, so a corrupt or future
  frontend cannot grow app-data without limit through a single command.
  `cargo fmt --check`, `cargo check`, `cargo test` (cap boundary cases
  included), and clippy with `-D warnings` all pass.
- The pre-commit gate now also runs `verify:generated` (music lock, chord
  manifest, hymn catalog, offline packs, literature covers, fork PDF
  provenance), matching the CI and pre-push gates, so a commit that drifts
  generated data is blocked at the earliest point instead of at push time.
- Added a permanent i18n completeness guard: a unit suite scans every source
  file for literal `translate(locale, …)` calls plus the curated dynamic
  keys (navigation table, shell online/offline ternary) and asserts that all
  148 keys exist with the same key set in Indonesian, English, and
  Simplified Chinese, resolve without falling back to another language, and
  that no table key is left unused. The manual audit confirmed the tables
  were already complete; the test now prevents future drift.
- The media E2E now also proves the floating player re-clamps inside the
  viewport when the window shrinks, so a saved drag position can never push
  the surface off-screen on a smaller device or rotation.
- No-key natural speech: in auto mode the platform's cloud/natural
  speechSynthesis voices (localService=false) are preferred over bundled
  local voices for listing and default selection, giving the "Edge/Natural
  preferred" chain without any app request; local voices remain the automatic
  fallback and an optional vetted Edge endpoint still upgrades the same chain.
- Network frugality: the web reuses the BFF HTTP cache (max-age +
  stale-while-revalidate, ETag/304) for Sauh, Suara Sejati, and Literature
  candidates so repeat visits inside the freshness window issue no requests;
  asset-manifest checks now revalidate conditionally instead of re-downloading.
- The browser suite now covers the Dasar Kepercayaan screen end to end: the
  vertical topic list keeps one active selection, search filters real pack
  content, and a personal note on a topic survives a full reload (notes are
  keyed per topic).
- The pre-push quality gate now also verifies generated-data provenance
  (`verify:generated`: music lock, chord manifest, hymn catalog, offline
  assets, literature covers) and re-runs the deterministic 144-file chord
  position audit in a no-write check mode that compares the fresh mapping
  against the committed report, so data-integrity drift blocks the push
  before anything reaches the remote.
- The TB reader now has persistent typography controls: compact A−/A+ buttons
  in the Bible header step the verse font between 14–26 px (line height
  1.4–2.2), applied through CSS variables to both split panes, bounded and
  keyboard-accessible, with the preference surviving reloads. The
  versioned storage is schema-validated with clamping and unit coverage, and
  a browser E2E verifies the size change, the stored value, and the reload
  persistence.
- Bible search now understands book names. The offline TB pack indexes each
  verse with its book display name, so natural queries like “Yohanes” or
  “Yohanes kasih” match instead of silently returning nothing (the pack only
  stores numeric book ids). Results are ranked so the book whose name matches
  the query surfaces before verses that merely mention the word in their
  text, with reference hits between the two; ordering stays canonical inside
  each tier. The worker protocol carries the book-name map at init, and the
  Bible page and the cross-space search share the same behavior. Unit
  coverage proves name/AND/whole-word/numeric-id queries plus ranking, and a
  browser E2E verifies the book of Yohanes appears ahead of text mentions
  like Matius 3:1.
- Global search now covers the Alkitab: the offline TB reader pack is loaded
  on demand and queried through the same lazy worker-backed index as the
  Bible screen, with stale-result protection and a retryable pack failure.
  Verse results carry sanitized snippets and open the internal reader via a
  validated `/bible?book/chapter/verse` deep link; out-of-range references
  fall back to the saved reading position instead of a missing chapter. The
  search surface label now names all six spaces in Indonesian, English, and
  Simplified Chinese, with unit coverage for entry building, deep-link
  parsing/resolution, and a browser E2E proving the Yohanes 3:16 result
  navigates into the shell and selects the verse.
- Advanced the canonical music/chord source from `gyschordweb@cbc7d386` to
  `gyschordweb@a3d1ea7`, adding the note-aligned chord documents for hymns 356,
  366, 395, and 432. The immutable music lock grew to 1,212 entries and the BFF
  chord manifest to 144 references; the deterministic PDF position audit now
  covers all 144 files / 3,291 entries with zero orphan or invalid mappings,
  and every derived manifest, provenance gate, and living document was
  regenerated and re-verified.

- Added a reproducible manual Windows release workflow with the pinned Tauri
  2.11 CLI. It builds the web shell, verifies generated provenance/docs, emits
  NSIS/MSI installers plus commit provenance, and can sign both packages with a
  protected PFX through `signtool` without ever committing certificate bytes.
- Aligned the shared chord capability with gyschordweb's verse-label matcher
  and note-aligned intro/outro sentinels; added a pinned 140-file PDF position
  audit and provenance gate so canonical chord regressions fail before release.
- Kidung PDF and chord layout now share one immutable source request per hymn,
  preventing Fork/canonical fallback races from applying coordinates from a
  different PDF than the reader displays; media E2E asserts no duplicate KR
  master download.

- Simplified Home to one calm flow: Daily Verse is fetched from the canonical
  Sauh Bagi Jiwa entry (with the existing verse/reflection switch), and the
  only resume/history surface is `Lanjutkan`. Suara Sejati remains a full
  standalone route instead of duplicating content and requests on Home.
- Made Sauh startup resilient to slow or CORS-blocked live revalidation: the
  verified current-day snapshot races the direct/BFF request and appears
  immediately, while a successful live response updates the short-lived cache
  and publishes the fresh post to Home and the Sauh reader without a reload.
- Hardened the native e-GYS boundary: native BFF calls identify themselves for
  the existing CSRF policy, WhatsApp opens in the system browser, and the
  Tauri CSP can no longer be bypassed by injecting browser Google/Apple SDKs;
  those provider buttons now explain the protected native-SDK prerequisite.
- Added a versioned IndexedDB binary store behind the browser platform
  boundary. Cache Storage remains fast for HTTP resources, while verified
  chord/PDF/media blobs are retained across reloads and restricted webviews.
- Reset/cache maintenance now clears both durable IndexedDB stores and all
  GYS-owned service-worker caches in one explicit boundary; Tauri removes only
  its versioned key-value/blob directories. Existing app metadata is left
  intact, and partial failures are recorded and surfaced instead of being
  reported as a false successful reset.
- Added low-cost loading-state motion and `content-visibility` boundaries for
  long hymn, faith, literature, and Suara lists; reduced-motion users still
  receive the static presentation.
- CI now coalesces the push and pull-request events for the same source branch
  and cancels superseded runs, so the expensive native and browser gates do
  not duplicate work during normal PR delivery.

- Expanded feature-critical Kidung localization to Indonesian, English, and
  Simplified Chinese, including viewer modes, chord/PDF/MIDI actions, queue,
  typography controls, and recovery states. Added golden conservative Text
  chord matching tests plus a rapid hymn/viewer E2E race flow.
- Refreshed the packaged Sauh fallback from the canonical `sbj260816` post so
  the Pages preview continues to show a real daily verse when direct browser
  CORS is unavailable; direct and optional BFF revalidation remain first.

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
- Refreshed the e-GYS route lock from upstream commit `a7a25e8` and recorded
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
- Preserved the bundle gate: 84.7 KiB gzip main application chunk and 168.4
  KiB gzip initial JavaScript after the durable reset boundary and release E2E
  coverage were added; the Bible search worker, PDF.js, and its worker remain
  lazy-loaded while
  FluidSynth/WASM and TimGM stay same-origin on-demand assets.

The release is not declared GA until protected e-GYS/OAuth secrets, native
signing, device visual/accessibility evidence, and the remaining platform
artifact pipelines are available.
