# GYSApp-Tauri progress

Status meanings: `Done & Verified` means the implementation, relevant tests,
local manual flow, and documentation have all been checked. `Implemented /
Needs Verification` means the code exists but depends on a protected external
service or platform artifact that cannot be exercised in this workspace.

## Done & Verified

- The Dasar Kepercayaan screen has a focused browser flow: list selection
  state, content search, and per-topic note persistence across a reload.
  The Playwright suite now runs 45 flows.
- The pre-push gate now runs `verify:generated` (lock/manifest/catalog
  provenance) and the chord position audit in `--check` mode: the full
  144-file deterministic mapping is recomputed against the immutable
  gyschordweb checkout and compared to the committed report ignoring only
  its generation timestamp, so any orphan/invalid mapping or drifted audit
  blocks the push without dirtying the tree.
- The TB reader gained persisted typography controls (A−/A+ in the Bible
  header, 14–26 px font with 1.4–2.2 line height) applied as CSS variables
  to both split panes. The versioned preference is clamped and
  schema-validated with unit coverage, the controls are bounded and
  keyboard-accessible, and a browser E2E proves the size change persists
  across a full reload.
- Bible search now indexes book display names alongside the numeric pack
  ids, so natural queries like “Yohanes” or “Yohanes kasih” return the book
  itself instead of nothing. Matches are ranked in three stable tiers —
  book-name hits, reference hits, then plain text hits — so a book whose
  name matches the query appears ahead of verses in earlier books that only
  mention the word (Matius 3:1 “Yohanes Pembaptis”), and canonical book
  order is preserved inside each tier. The worker init message carries the
  name map, and both the Bible page and the cross-space search use the same
  client, so the fix applies everywhere. `pnpm audit` reports zero known
  vulnerabilities. Focused unit tests cover name/AND/whole-word/numeric-id
  queries plus ranking, and a browser E2E proves the book of Yohanes
  outranks Matius text mentions.
- The cross-space search (⌘K) now includes the offline TB Bible. The
  31,172-verse pack is loaded on demand and searched through the same
  lazy worker-backed client as the Bible screen, with a stale-result guard
  for rapid query changes and a retryable pack failure. Verse results show a
  sanitized snippet and deep-link straight into the internal reader at
  `/bible?book=…&chapter=…&verse=…`; the reader validates and clamps the
  reference against the loaded pack before applying it, so invalid links fall
  back to the saved reading position instead of landing on a missing chapter.
  The search label was updated in Indonesian, English, and Simplified
  Chinese, and the flow has focused unit coverage plus a browser E2E that
  searches Yohanes 3:16, navigates into the shell reader, and verifies the
  deep-linked verse is selected. Full lint, strict typecheck, all unit
  suites, the production build, and the 42-flow Playwright suite pass.
- Clean-room MIT pnpm monorepo, typed contracts, responsive Quiet Sanctuary
  shell, local PWA assets, and GitHub Pages delivery.
- The pinned Tauri 2.11 CLI is now part of the native workspace and the manual
  Windows release workflow has been exercised locally end-to-end: a 16.9 MB
  NSIS installer was produced after the web build, with an optional protected
  PFX/signtool path for signed release artifacts. CI still keeps the native
  compile gate separate from credential-dependent signing.
- PWA bootstrap is budgeted: service-worker v10 installs the shell and compact
  indexes first, then warms the heavy MIDI/FluidSynth binaries in the
  background with a Save-Data/2G guard.
- Production PWA registration now tolerates reduced webview service-worker
  objects and records registration failures without crashing the shell. The
  generated asset manifest inventories bundled PDF/MIDI/chord seeds, so
  remote-only hymn assets skip guaranteed Pages 404 probes before verified
  canonical loading. The registration guard also handles reduced adapters that
  resolve the registration promise to `undefined`.
- PWA metadata now ships a square official-logo mark for both favicon and
  install manifest; Pages-relative resolution is covered by runtime-health
  coverage so browser console metadata warnings do not regress. The service
  worker cache version is bumped with the metadata change so existing clients
  receive the corrected manifest instead of a stale cached copy. Deep hymn
  routes now use the same base-rooted metadata URLs and no longer emit route
  relative `/kidung/assets` 404s.
- e-GYS WhatsApp login now reserves the popup without the `noopener` feature
  that makes allowed popups look blocked, then severs `window.opener` before
  navigating to the external WhatsApp URL; both blocked and allowed paths are
  unit-tested.
- e-GYS provenance is current at upstream commit `a7a25e8`; the generated
  contract includes the compatible branch detail/update and region routes.
  Forced refreshes still diff against the checked-in contract, so removed
  routes cannot be hidden by regeneration.
- TB search now builds and queries its 31,172-verse normalized index in a lazy
  module worker. Stale searches are cancelled, worker startup has a bounded
  timeout, and SSR/older-browser startup failures fall back to the typed local
  repository without leaving an infinite loading state.
- TB Bible, multilingual faith list with contextual actions, 533-song hymn
  catalog, ordered search, persistent reading/activity state, and single
  `Lanjutkan` home item.
- Today's Sauh Bagi Jiwa and real Suara Sejati feed with validated static
  snapshots, online/BFF revalidation, image mapping, and offline recovery.
  Home Daily Verse is sourced from the same Sauh item, while `/sauh`,
  `/suara`, and `/suara/:postId` keep the reader inside the application shell.
  Upstream entries without a readable body, valid publication date, or trusted
  TJC URL are discarded; foreign image URLs are never rendered, and an outage
  shows an actionable unavailable state instead of fabricated devotional text.
  TJC article HTML is normalized by the BFF into a bounded, schema-validated
  plain-text reader; Pages previews without a Worker use the same constrained
  WordPress feed fallback, and no remote page is opened as the primary action.
  Daily selection prioritizes the publisher's canonical `sbjYYMMDD` slug over
  unrelated posts edited on the same calendar day; no static verse fallback is
  rendered when Sauh does not provide a reference.
- Home/reader Sauh revalidation tries the canonical TJC WordPress endpoint
  directly, then the optional BFF proxy, then the validated offline snapshot;
  BFF Literature and Suara Sejati routes deduplicate concurrent upstream reads.
  The verified snapshot now races live revalidation instead of waiting for a
  four-second CORS/timeout path, so Home remains usable immediately while a
  successful live response refreshes the in-memory cache.
  The packaged Sauh snapshot was refreshed from the canonical `sbj260816`
  post (Hakim-Hakim 3:31) for the current Pages release, so a browser that
  cannot satisfy TJC's CORS policy still shows a real source-backed daily
  entry instead of fabricated text.
  When live revalidation finishes after the snapshot has painted, a typed
  browser event updates Home and the dedicated Sauh reader in place, so fresh
  direct-source content is visible without a route reload.
- Home now uses Sauh as the sole Daily Verse source and keeps a single
  `Lanjutkan` surface. Suara Sejati remains available from its dedicated route
  without adding another Home shelf or network request to the first render.
- GYSChordWeb chord manifest/cache/integrity validation, immutable GYSApp-Fork
  hymnal PDF database/download source with signed package fallback, local
  PDF.js worker, canonical MIDI loading, local FluidSynth/TimGM rendering with
  Web Audio fallback, and shell-level minimizable media surface with seek,
  volume, mute, tempo, transpose, Media Session, wake-lock, and persisted
  pointer-drag positioning controls. The global player can return to the
  active verse/hymn and keeps a compact title/progress summary while
  minimized; persisted coordinates are clamped after viewport changes and
  Media Session handlers no longer re-register on every position tick. Hymn
  detail now has two presentation modes (`Lirik` / `PDF`) with a shared chord
  capability, remembers presentation/chord visibility per song, and never
  renders duplicate viewer surfaces. Note-aligned v2 chord JSON is mapped
  against the exact active PDF text coordinates (Fork KR master first, canonical
  per-song fallback; dominant notation font,
  multi-character note splitting, row matching, and responsive lyric/chord
  cells), rendered as a DOM overlay over PDF.js canvas, and reused for
  Text-mode line association. Transpose and accidental changes update labels
  without re-rendering the PDF. Simultaneous song opens share one verified
  chord download, and rendered MIDI PCM uses a bounded 96 MB
  source/soundfont/tempo/transpose/sample-rate cache. The next hymn now warms
  the complete binary → parser → FluidSynth PCM path through a serial,
  hash-keyed preload queue; foreground loads cancel queued neighbours while
  active renders remain safely shareable, so navigation cannot duplicate WASM
  work or replace the current session.
- Canonical gyschordweb note-aligned chord files now accept the documented
  intro/outro sentinels (`-1`/`99999`), and the deterministic PDF audit covers
  all 140 files / 3191 entries with zero orphan or invalid mappings.
- Kidung now resolves the Fork-master/canonical PDF through one immutable
  in-flight promise per hymn. The visible reader and note-aligned chord
  extraction therefore share the same bytes, source version, and page
  geometry even when the Fork source falls back; the media E2E proves one KR
  master request for a chord-then-PDF open.
- Browser binary platform blobs now persist in a versioned IndexedDB store and
  are backfilled from Cache Storage when needed, so verified chord/document
  data survives reloads even when an embedded webview cannot expose Cache
  Storage reliably.
- Reset and cache maintenance now reaches every durable app-owned store: the
  browser clears both IndexedDB object stores plus GYS service-worker caches,
  while Tauri removes only the versioned key-value/blob directories. The
  reset boundary is covered by a browser end-to-end test and reports
  diagnostics/actionable feedback on restricted-storage failures rather than
  claiming data was removed.
- MIDI asynchronous work now carries a generation guard across song loads,
  FluidSynth worker startup/render, seek, stop, and instrument/tempo/transpose
  changes. A late worker result is ignored before it can replace the shared
  shell session; stale loads return a boolean so Kidung and playlist callers
  cannot start superseded audio. The guard has focused unit coverage and the
  full 42-flow Playwright suite still passes after the change.
- Kidung text now has accessible per-hymn font-size and line-spacing controls;
  PDF has persisted single/two/vertical/horizontal layouts with a narrow-screen
  two-page guard, version-aware page progress with an explicit return-to-saved
  page action, and MIDI exposes all 128 General MIDI programs plus the source
  program while persisting media preferences across sessions. Text mode now
  measures the rendered chord/lyric line and applies a bounded 14 px minimum
  auto-fit on viewport/orientation changes, without changing the user's saved
  typography preference. Chord markers are measured against the actual wrapped
  character rows and rendered as a relative DOM overlay, keeping note-relative
  placement when a lyric line wraps instead of rebuilding a cell per character.
  Key selection is a real shortest-path transpose from the canonical source
  key, so the displayed key and PDF/Text/MIDI state stay synchronized.
  Identical Bible and hymn activity writes are debounced so route remounts
  cannot create duplicate recent entries.
- Kidung catalog search now builds one normalized index per catalog revision and
  supports number/title prefix lookup, AND terms, quoted phrases, and collection
  filtering without re-normalizing all lyrics on each keystroke.
- Chord negative-cache misses now expire after the documented 14-day rollback
  retention window, and versioned asset downloads share one in-flight request
  while preserving cancellation for individual callers.
- The offline pack manager now validates remote manifests at runtime, detects
  changed/added/removed identities, stages only changed local assets through
  the checksum/size-verified Cache Storage transaction, publishes a persisted
  active-manifest pointer, and cleans removed entries after the pointer swap.
  The More surface exposes a single update action plus a compact manual
  version check, with retryable error state and no duplicate navigation menu.
- e-GYS synchronization is enforced as local-only: the GitHub Actions sync
  workflow and upstream-fetch CI step were removed, and generated verification
  has a policy guard with regression tests for forbidden workflow access.
- Vertical PDF mode releases canvases and render tasks when pages leave its
  preload window, keeping long documents bounded in memory. The native Tauri
  CSP explicitly permits only the verified TJC and immutable gyschordweb asset
  origins needed by the app.
- The PWA service worker now bounds verified TJC cover/media storage to 96
  entries and prunes the oldest responses on activation and access, keeping
  offline browsing useful without unbounded disk growth.
- Literature ebook shelf, category/filter/sort discovery, detail route,
  local favorites, versioned page/scroll progress, deduplicated “Terakhir
  dilihat” resume shelf, PDF.js in-app reader, verified PDF offline cache via
  the allowlisted BFF proxy, and explicit error/retry states. The generated real TJC snapshot maps 279/297 catalog
  entries to source cover images; the remaining 18 have explicit source-backed
  fallback because no cover is exposed by the upstream metadata. Article
  readers now also expose an explicit jump back to a saved scroll position;
  the action is available outside the PDF-only controls. Shared PDF document
  and virtualized page resources are now cleaned up on route/song/retry
  transitions, and Literature failures expose an in-shell retry button.
- Native e-GYS BFF/session/profile adapter with branch and membership mapping;
  no WebView or client-side credential storage. Provider exchange and
  WhatsApp READY responses are schema-validated against the upstream
  ID-token/HttpOnly-cookie contract; upstream session identity is validated
  before profile normalization. Native requests carry the explicit
  `x-gys-client: native` CSRF-policy marker; WhatsApp opens through the system
  browser, while Google/Apple buttons are guarded in Tauri until protected
  native provider SDK/client-ID prerequisites are supplied.
- TB reader hardening: source markup is sanitized, search supports token/phrase/
  whole-word filters with local history, and the reader has persistent notes,
  highlights, verse selection, split columns with a draggable/keyboard-safe
  divider, title-drag chapter quick navigation, contextual selection actions,
  chapter scrubber, and swipe navigation. Bible read-aloud now uses
  the shared SpeechProvider/orchestrator, prefers a configured Edge
  compatibility gateway with an explicit local fallback, queues verse ranges,
  exposes engine/voice/rate controls, highlights and scrolls the verse currently
  being spoken, provides previous/next verse navigation from the expanded
  global media surface, and shares that surface so speech and MIDI never play
  audibly together.
- GYSChordWeb-style continuous PDF rendering now lazy-loads visible pages;
  canonical binary assets can use the allowlisted same-origin Worker proxy,
  then fall back to the immutable raw source without duplicate in-flight fetches.
- MIDI queue persistence now follows the canonical playlist behavior: validated
  add/remove/reorder, loop, shuffle, auto-next preference, import/export, and
  backup-compatible local state are exposed from the Kidung and Lainnya flows.
- Local-first e-GYS revision/route-contract synchronization, generated route
  metadata, breaking route removal detection, repository-managed pre-commit
  and pre-push hooks, and documented workflow. Every synchronization refreshes
  the temporary checkout before inspecting Java sources, even when the
  checked-in commit is unchanged. The derived contract also records the
  upstream Springdoc/OpenAPI runtime boundary (`/v3/api-docs`, Swagger UI
  path, enablement property, and controller-generated schema provenance)
  without copying or inventing request/response shapes.
- Tauri webviews now select a real native platform adapter: key-value records
  and verified chord/media blobs use app-data filesystem commands with
  path-safe keys, unique temporary files, atomic replacement, and typed
  base64 validation. Rust unit tests cover traversal-safe keys and replacement
  cleanup; `cargo fmt --check`, `cargo check`, `cargo test`, and clippy pass,
  and the Windows CI job now runs the same native gate.
- The shared `PlatformServices` seam now models database, transient secret,
  notifications, file dialogs, sharing, deep links, and lifecycle in addition
  to key-value/blob/speech. Browser adapters execute the available APIs;
  Tauri now bridges OS keyring, native dialogs/filesystem, notifications, and
  deep-link registration through explicit plugins. Signed/device runtime checks
  remain the GA evidence gate rather than being implied by a desktop compile.
- Bible split ratio now defaults safely when storage is empty (no accidental
  42% pane), and the responsive E2E matrix covers 320/390/768/1024/1440/1920
  plus landscape without horizontal overflow.
- Formatting, lint, strict typecheck, unit/contract tests, production build,
  bundle budget, generated provenance, Playwright smoke coverage, and desktop
  plus mobile visual baselines pass locally. The current Playwright suite has
  42 passing flows, including the 320–1920px and landscape shell matrix plus
  Axe light/dark zero-violation checks and keyboard focus coverage. A
  browser media flow also opens
  canonical chord JSON, the fork hymnal PDF reader/download, and MIDI from the
  same hymn detail route; a forced upstream failure now proves the PDF mode
  exposes an in-shell retry action, and the performance flow records five
  navigation samples with median/p95 timing and module-duplication evidence.
  Production runtime-health coverage also asserts that PWA registration does
  not surface an uncaught error when the browser exposes a reduced service
  worker registration, and that favicon/manifest metadata resolves without
  browser warnings, with a direct hymn deep-link metadata regression check.
  Native `cargo check` is wired into
  the pre-push gate.
  `pnpm verify:native-assets` proves the Tauri frontend boundary includes the
  18 required offline/runtime assets (36,845,850 bytes in the current build).
  Commit `c571217` is deployed to GitHub Pages with HTTP 200, the 533-item
  `gyschordweb@cbc7d386` catalog, the source-backed `sbj260816` Sauh snapshot,
  and the Sauh/native-auth hardening bundle. Pages run `31935244669` and PR
  gate `31935246940` passed, including the native cargo gate and 41 browser
  flows.
- Feature-critical Kidung controls now use the shared id/en/zh message table,
  including search, viewer modes, chord/PDF/MIDI actions, queue controls,
  typography, and recovery states. Indonesian copy remains stable for the
  existing accessibility contract while English and Simplified Chinese no
  longer fall back to Indonesian on the primary hymn flow.
- BFF source bindings now reject insecure e-GYS URLs and non-TJC content
  origins before any upstream request is made. Living documentation is checked
  by `pnpm verify:docs` in local hooks and CI, including the feature lifecycle
  Mermaid diagrams in the README and architecture guide.
- The browser diagnostic journal is bounded to 80 redacted events and receives
  scoped failures from content, assets, PDF, TTS, MIDI, Bible, literature,
  feedback, and e-GYS boundaries without persisting bearer or token values.
- BFF cookie-authenticated state changes now require an allowlisted `Origin` or
  same-site Fetch Metadata signal (with an explicit native-client escape hatch),
  and the global media handle is keyboard-movable with arrow keys and re-clamps
  after minimize/expand transitions. Focus styling and E2E coverage keep the
  drag affordance usable without a pointer.
- The normalized e-GYS profile now preserves the current upstream operational
  capabilities (`viewBranches`, event view/create/update/archive) alongside the
  member permissions, while remaining compatible with older deployments that
  omit those fields.

- The canonical music/chord source is now pinned at `gyschordweb@a3d1ea7`,
  adding note-aligned chord documents for hymns 356, 366, 395, and 432. The
  immutable music lock grew to 1,212 entries (from 1,208) and the BFF chord
  manifest to 144 references (from 140); the deterministic PDF position audit
  covers all 144 files / 3,291 entries with zero orphan or invalid mappings.
  Every derived manifest (lock, chord manifest, hymn catalog, offline pack,
  asset manifest, position audit) was regenerated from the immutable snapshot,
  all provenance gates were updated, and lint, typecheck, and the full unit
  suite pass.

## Implemented / Needs Verification

- Live e-GYS OAuth/session/profile requires protected Worker configuration and
  a reachable production backend; preview builds intentionally show a safe
  signed-out state when those secrets are absent. Provider SDK loading and
  Google/Apple prompts are bounded by cancellation/timeouts so a blocked popup
  cannot leave the account surface stuck in a busy state.
- Native Tauri packaging/signing and iOS/Android store artifacts require their
  platform toolchains and signing material.
- Full canonical-vs-rewrite MIDI performance parity, screen-reader audit, and
  visual baseline review require the target device/browser matrix.
- Edge speech audio requires the protected `EDGE_TTS_URL` Worker binding; when
  it is absent, the UI reports only detected system voices and does not claim
  offline Edge availability. When the optional `EDGE_TTS_VOICES_URL` catalog is
  absent, the Edge default remains usable but no unverified voice options are
  displayed. Rate, pitch, and volume preferences persist locally.

## Next controlled work

- Add cover URL records to the versioned asset manifest when the source begins
  exposing a stable version/checksum for them.
- Extend e-GYS contract extraction with concrete OpenAPI request/response
  schemas when the upstream runtime document is available in an authenticated
  checkout; the current upstream checkout exposes the generator/configuration
  but no checked-in JSON document.
- Complete native packaging/signing and device evidence: build/install smoke
  tests for Windows, Android, and iOS, plus live keyring, notification,
  file-dialog, lifecycle, and deep-link checks on each target.
