# Codebase simplification map

This is the local replacement for a wayfinder root issue. It is the single
low-resolution index for the multi-session simplification effort.

## Destination

An offline-first GYSApp-Tauri codebase with smaller responsibility surfaces,
stable adapters, faster verified paths, explicit deletion evidence, and
compact agent context. Existing behavior and source-of-truth parity remain
more important than line-count reduction.

## Working rules

- One frontier decision per session.
- Resolve a decision with a test, runtime probe, or bounded audit before
  graduating the next frontier.
- Keep uncertain future work under `Not yet specified`.
- e-GYS v2 WIP is protected and remains discovery-only at runtime.

## Decisions so far

- `2026-09-07 / CF-054`: run the due maintenance-skill review and fix the
  documentation verifier's day-threshold comparison; no agent rule changes
  were needed. Canonical data and e-GYS v2 evidence are protected.

- `2026-09-22 / CF-056`: consolidate the current UI audit and runtime
  baseline into one release-readiness receipt; isolate each performance case,
  classify forced upstream failures as unavailable-source behavior, and keep
  the dirty working tree untouched outside the focused test/documentation
  changes. Production bottleneck evidence was not found, so no speculative
  optimization was added.

- `2026-09-22 / CF-059`: close the current Preview/Beta UI audit after the
  measured CF-057 shelf-containment and CF-058 Bible first-paint slices. The
  remaining frontier is limited to GA/native/provider prerequisites; no new
  visual work is opened without a measured regression. The global formatter
  failure is recorded as a pre-existing dirty-tree condition, not a claim that
  the full working tree is formatted.

- `2026-09-22 / CF-062`: compact the measured desktop Kidung text-reader
  toolbar with CSS-only grid placement; keep the mobile stacked composition,
  44px controls, and existing reader semantics. Jev found no evidence for
  additional shell, Bible, Faith, or PDF changes, so no speculative loading or
  layout refactor was opened.

- `2026-09-22 / CF-063`: recenter Kidung text sheets in both single-verse and
  all-verses modes, and account for the Bible split divider on both ready and
  loading layouts so the two desktop panes remain equal. The fixes are CSS-only
  and preserve reader state, PDF sources, and content ordering.

- `2026-09-22 / CF-064`: map the canonical PDF's numbered lyric variants to
  the same note-row chords so Kidung text mode renders chords in every verse
  when `Semua` is selected. Jev confirmed the parser association as the root
  cause; the fix keeps the canonical source and conservative text matcher.

- `2026-09-24 / CF-065`: verify the exact-source hymn inventory, correct
  catalog availability and variant lookup, enable keyless direct Edge speech
  in Tauri, and compact the Kidung list. Keep broader feature parity open until
  packaged-runtime and remaining route-level evidence is collected.

- `2026-09-24 / CF-069`: make Bible search and Notes contextual, start search
  filters closed, and keep audio settings reachable through the existing
  reader drawer/deep link. Preserve the pending annotation-model design scope.

- `2026-09-24 / CF-070`: keep Kidung Play and chord visibility on one compact
  reader row; move lower-frequency actions into More. When SoundFont is absent,
  route Play to its asset section without starting a download.

- `2026-09-24 / CF-073`: bump the shell cache and native startup URL after
  offline-assets UI edits rendered stale content in the standard Tauri
  profile. Keep complete offline upgrade/recovery as the remaining frontier.

- `2026-09-24 / CF-074`: make saved Kidung playlists import/export the pinned
  upstream JSON shape, support song reordering and keep low-frequency tools
  behind More. Retain internal MIDI queue import/export and verify the flow on
  phone before closing the remaining native autoplay and long-session gaps.

- `2026-09-24 / CF-075`: fullscreen the whole PDF reader so its exit control
  stays reachable; download loaded PDF bytes as a named blob for cross-origin
  sources. Keep packaged cache recovery and overlay-version pairing open.

- `2026-09-24 / CF-076`: mirror the selected saved-playlist ID with its songs
  and restore it after localStorage eviction without overwriting newer local
  state. Keep native multi-song autoplay and long-session playback open.

- `2026-09-24 / CF-077`: migrate legacy Bible notes to per-verse note
  collections; support multiple notes, active-verse filtering, removable
  presets, and validated custom highlight colors. Back up the custom palette
  and verify 44px mobile selection-toolbar targets. Keep packaged annotation
  restore and locale/text-scale review open.

- `2026-09-25 / CF-078`: add packaged Tauri WebView2 regression coverage for
  stopping Edge synthesis, changing voices, and pause/resume/stop. Keep signed
  installer proof and the browser voice matrix open.

- `2026-09-25 / CF-079`: verify same-voice repeat playback in the packaged
  Edge smoke and prevent first Service Worker control from reloading a fresh
  native profile. Keep full browser/native update and offline recovery open.

- `2026-09-25 / CF-080`: remove closed Bible search from the accessibility and
  keyboard order while preserving toolbar activation and focus. Keep the full
  locale, 200% text, and packaged annotation matrix open.

- `2026-09-25 / CF-081`: move the Kidung queue shortcut into the MIDI dock's
  advanced disclosure so primary playback stays focused. Keep native
  multi-song autoplay and long-session playback open.

- `2026-09-25 / CF-082`: verify the MIDI dock's seek, volume, mute, tempo,
  transpose, and instrument controls against an active browser player. Keep
  packaged control behavior and long-session playback open.

- `2026-09-25 / CF-083`: disconnect completed FluidSynth buffer/gain nodes on
  natural end and crossfade, preventing inactive audio nodes from accumulating
  across queue changes. Keep packaged memory-soak evidence open.

- `2026-09-25 / CF-084`: accept a BFF chord manifest only when its source,
  complete entry set, song IDs, sizes, and hashes match the offline music lock;
  otherwise use the bundled lock. Preserve the shared PDF resource used by the
  viewer and geometry mapper. Keep all-song Fork/distributed compatibility and
  packaged PDF cache recovery open.

- `2026-09-25 / CF-085`: discard a cached Fork PDF distribution package when
  its published size or checksum no longer matches, fetch a replacement, and
  cache only verified package bytes. Keep offline-only and packaged profile
  recovery proof open.

- `2026-09-25 / CF-086`: disable the temporary Bible search header action until
  the reader header is ready, so its click can open and focus the search field.
  Keep full locale, large-result, and packaged annotation verification open.

- `2026-09-25 / CF-087`: use the existing translate-only Kidung disclosure
  animation for reader menus, preserving full 44px nested touch targets while
  they open. Keep packaged MIDI controls and long-session proof open.

- `2026-09-25 / CF-088`: run all specified native Rust quality gates locally;
  keep signed installer installation/upgrade and the OS media matrix open.

- `2026-09-25 / CF-089`: cache the schema- and URL-validated KR release
  manifest with its package, and reuse it when the network is unavailable;
  retain package size/SHA and master-PDF integrity checks. Keep packaged
  offline-profile recovery open.

- `2026-09-25 / CF-090`: add reviewed Kidung PDF visual baselines at 390×844
  and 1440×900. Keep all-song source pairing and route/theme/locale state
  coverage open.

- `2026-09-25 / CF-091`: allow 0.001px of CDP geometry rounding in PDF touch
  target assertions without changing the 44px CSS requirement. Keep the
  backup-import server resource flake visible in the full-suite receipt.

- `2026-09-25 / CF-092`: label browser speech from the active voice and verify
  Auto/system and explicit local voice routing. Keep real OS voice inventory
  and signed-installer verification open.

- `2026-09-25 / CF-093`: audit all locked chord references against their
  canonical PDFs and the Fork KR master; keep packaged offline recovery and
  distributed PDF lifecycle proof open.

- `2026-09-25 / CF-094`: pin SHA-256 for newly installed distributed payloads
  and validate cached payload/metadata bytes on reads; retain package checks,
  atomic updates, and compatibility with existing records. Keep real
  browser/PWA/Tauri reinstall and offline lifecycle proof open.

- `2026-09-25 / CF-095`: backfill SHA-256 for legacy payload records on their
  first size-valid read, without replacing a newer cache record. Keep legacy
  offline bytes usable and preserve package-integrity checks; historical
  same-size corruption before migration cannot be proved from the cache alone.
  Continue with clean-profile browser/PWA/Tauri offline lifecycle verification.

- `2026-09-25 / CF-096`: distinguish a hymn with no canonical chord entry from
  a transient chord-load failure; do not show network advice or retry for the
  former. Preserve retry behavior for actual load errors and keep packaged
  chord-cache recovery open.

- `2026-09-25 / CF-097`: put Literature search/category/sort controls directly
  after the page intro, before discovery shelves; hide unfiltered shelves
  while a query or category is active. Keep source-list, offline and locale
  cross-product verification open.

- `2026-09-25 / CF-098`: verify distributed-asset recovery from a partial
  response disconnect: no incomplete record is installed, and a second request
  succeeds. The 390×844 Data Offline controls fit without horizontal overflow;
  clean-profile offline/update/reinstall coverage remains open.

- `2026-09-25 / CF-099`: verify a fresh browser profile installs a distributed
  Bible, reloads the app offline through the Service Worker, and reads the
  cached database without another package request. Browser remove/reinstall
  and manager update/reinstall now pass; keep the full native asset matrix open.

- `2026-09-25 / CF-100`: review and refresh eight Literature catalog visual
  baselines across mobile, tablet, desktop, and dark mode. The full Playwright
  suite completes with one transient e-GYS timeout that passes on retry; offline
  restart remains an opt-in test requiring the local BFF.

- `2026-09-25 / CF-101`: exercise Bible and Kidung across Indonesian, English,
  and Chinese; all five themes; and 200% root text scale at 390×844. Keep the
  other routes and native preference persistence open.

- `2026-09-25 / CF-109`: verify Bible search labels in Indonesian, English, and
  Chinese, and cap the broad mobile result list at 40 without horizontal
  overflow. Packaged startup and large-pack latency remain open.

- `2026-09-25 / CF-110`: verify broad Bible search pagination: 40 initial
  results, then 80 after “Tampilkan lebih banyak ayat” in ID/EN/ZH. Preserve the
  31,172-verse offline pack and keyless Edge path. The packaged WebView2 smoke
  records 151ms home, 1,169ms Bible readiness, and 390ms search; set a latency
  budget and continue offline/filter parity next.

- `2026-09-22 / CF-058`: shape Bible offline-pack loading like the ready reader
  with localized busy status, responsive split panes, reduced-motion behavior,
  and a delayed-pack transition guard; package loading and retry contracts were
  preserved.

- `2026-09-22 / CF-057`: remove only the escaping negative shelf gutter margins
  while retaining contained card scrolling and first/last-card reachability;
  the focused responsive guard and the combined visual/accessibility matrix
  passed without changing content or route order.

- `2026-09-07 / CF-053`: make the Kidung viewer accent token follow the main
  theme accent (`--accent` from Lainnya > Penampilan) with sacred gold as the
  fallback; chord/PDF surfaces already subscribe to the same source.
  Canonical data and shared MIDI state are protected.

- `2026-09-07 / CF-052`: restyle the committed Kidung Teks/PDF viewer toggle
  to hymnal paper/gold instead of the generic blue glow; the app shell keeps
  its own tokens. Canonical data and shared MIDI state are protected.

- `2026-09-05 / CF-051`: preserve the existing Kidung Teks/PDF navigation; use
  normal grid flow for the title, two header rows below 900px, and viewport-
  bounded reader menus. Canonical data and shared MIDI state are protected.

- `2026-09-03 / CF-001`: establish repository-local context and documentation
  guardrails before structural refactors; `App.tsx` shell composition is the
  first deepening candidate because it has strong leverage and a stable route
  seam.
- `2026-09-03 / CF-001`: isolate the route-independent navigation surface in
  `apps/web/src/app-navigation.tsx` and share Bible warming through
  `apps/web/src/bible-prefetch.ts`; keep route composition, media, and feature
  controllers in `App.tsx` until a later seam is proven.
- `2026-09-03 / CF-002`: the Edge speech path must expose actual gateway
  voices only, select by Bible language, label browser fallback honestly, and
  retain e-GYS v2 boundaries; verified in the prior speech-focused slice.
- `2026-09-03 / CF-003`: no unconfigured Edge gateway is treated as real Edge
  audio; protected `EDGE_TTS_URL` remains a deployment prerequisite.
- `2026-09-03 / CF-006`: remove only the unreferenced PDF probes, duplicate
  `scripts/serve.py`, and generated Python bytecode; retain the root localhost
  wrapper and `.codex/stabilization-*` archives pending a separate archive
  decision.
- `2026-09-03 / CF-007`: keep the 99-flow browser suite as the release gate,
  parallelize the five independent package unit suites, and make changed-file
  E2E selection skip documentation and unit-test-only edits. Four local
  workers is the measured stable setting; eight workers produced resource
  contention and two failures, so it is not the default.
- `2026-09-03 / CF-004`: move Bible local persistence and highlight parsing to
  `apps/web/src/bible-storage.ts`; preserve every existing storage key and
  keep the reader render/controller boundary in `bible.tsx` for the next
  decision.
- `2026-09-03 / CF-005`: move Kidung catalog validation, lyric parsing cache,
  deduplication, and display-neutral formatters to
  `apps/web/src/kidung-catalog.ts`; leave PDF/MIDI resources and viewer state
  in `kidung.tsx` pending a separate proof.
- `2026-09-03 / CF-008`: remove the unused `@tanstack/react-query` dependency
  and its transitively unused `@tanstack/query-core` package after a
  repository-wide import/reference audit; no runtime caller or behavior was
  removed.
- `2026-09-03 / CF-009`: keep a configured BFF as the first online-content
  candidate across localhost port boundaries, allow the actual `5173` and
  `5174` preview origins in the BFF CORS boundary, and give the BFF path a
  longer bounded wait than the direct WordPress fallback. This fixes the
  preview path without weakening the exact-origin allowlist.
- `2026-09-03 / CF-010`: keep Bible annotation transforms beside the versioned
  storage rules; notes append per verse, note deletion removes one entry, and
  highlight updates validate preset or custom colors before returning a new
  immutable state.
- `2026-09-03 / CF-011`: resolve a single verified Kidung PDF identity for the
  viewer and note-aligned chord geometry, preserving Fork, distributed, and
  canonical fallback order while leaving MIDI and viewer state in the page.
- `2026-09-03 / CF-012`: share lock-verified MIDI bytes, source hash, URL, and
  normalized parser input between foreground playback and adjacent-track
  preload through `kidung-resources.ts`; keep generation guards and
  viewer/session state in `kidung.tsx`.
- `2026-09-03 / CF-013`: remove CSS rules and grouped selector members whose
  required class tokens have no runtime source reference; retain active rules
  and the single stylesheet until a measured ownership split is proven.
- `2026-09-03 / CF-014`: subscribe the Kidung catalog directly to the durable
  MIDI playlist external store; remove its manual render tick so queue badges
  cannot remain stale after an add or restore.
- `2026-09-03 / CF-015`: make streamed distributed packages and optional
  hymnal indexes enforce the manifest's exact byte count even when an upstream
  omits `content-length`; keep the stream bounded and fail on truncation.
- `2026-09-03 / CF-016`: move Bible markup decoding, semantic verse segments,
  and query highlighting to `bible-text.tsx`; keep the reader and search
  controllers in `bible.tsx` while sharing one text-rendering seam.
- `2026-09-03 / CF-017`: make selective local E2E reuse a timestamp-validated
  production build through `scripts/ensure-e2e-build.mjs`; the complete
  `pnpm test:e2e` path always rebuilds. Replace only positive sleeps that wait
  for state with bounded assertions; retain waits that prove dwell thresholds.
- `2026-09-03 / CF-018`: keep the Kidung PDF metadata promise and its settled
  value as separate cache views, so tempo/key detection reaches synchronous
  MIDI consumers after warm-up; treat Chromium's sub-pixel `dvh` rounding as
  one CSS-pixel tolerance in the mobile geometry proof.
- `2026-09-03 / CF-019`: bound configured Edge speech responses at the BFF
  stream boundary, validate an advertised byte count when present, and keep
  chunked responses from bypassing the 10 MB media limit; broader route
  extraction remains deferred because middleware, bindings, and cache/error
  state are still shared by the application factory.
- `2026-09-03 / CF-020`: retain the tracked native icon set, including
  byte-identical iOS files with different target names; the filenames are
  platform packaging inputs, so an apparent duplicate is not a safe deletion
  without a platform bundle regeneration proof.
- `2026-09-03 / CF-021`: move the cached-first Home route into `home.tsx` and
  map that module to its Sauh, Suara, and literature browser flows; keep route
  composition and `Shell` orchestration in `App.tsx` until their remaining
  coupling is measured.
- `2026-09-03 / CF-023`: allow only Tauri v2 Windows production's exact
  `http://tauri.localhost` origin through the e-GYS BFF CORS boundary so the
  keyring-backed bearer profile request can complete after native login.
- `2026-09-03 / CF-024`: keep Bible intent prefetch lazy and encode the TB
  reader wire pack as numeric verse tuples; normalize at the contracts boundary
  so the reader and search callers retain the existing rich verse shape.
- `2026-09-03 / CF-025`: keep Kidung parity on the canonical 533-item identity
  list, resolve PDF tempo from each song's mapped master-PDF page, and keep
  SoundFont identity in the shared MIDI render/cache key. The PDF viewer uses
  a pointer-anchored preview with a debounced PDF.js commit and lets zoomed
  canvases grow inside the stage; responsive control placement is verified by
  viewport geometry rather than by weakening the controls.
- `2026-09-03 / CF-026`: detect browser Google e-GYS accounts through the
  reviewed live-v1 callback adapter, store only the opaque session in an
  HttpOnly BFF cookie, and keep Apple/WhatsApp browser handoff as an explicit
  official-portal fallback because e-GYS exposes no safe cross-origin signal.
- `2026-09-03 / CF-027`: detect an already active e-GYS session only inside
  the same origin-allowlisted Tauri WebView through a minimal profile probe;
  validate and strip the profile at the native and web IPC boundaries, while
  keeping Chrome tab sessions out of scope.
- `2026-09-04 / CF-028`: make documentation a required delivery artifact;
  every maintenance slice records its changed fact, proof, protected
  prerequisite, and next frontier, while the maintenance skill is reviewed on
  a bounded cadence enforced by `pnpm verify:docs`.
- `2026-09-04 / CF-029`: use the administrator-confirmed live v1 Apple
  callback and WhatsApp challenge/WebSocket contract for explicit browser
  login, exchanging only opaque sessions through the BFF; passive detection of
  an unrelated Chrome e-GYS tab remains out of scope.
- `2026-09-04 / CF-030`: recover Sauh's featured image from the official
  `wp-image-{featured_media}` content tag when WordPress omits `_embedded`,
  validate the image against the existing TJC/S3 allowlist, and keep the live
  feed to the two newest records plus required fields; reserve the initial GYS
  loading shell dimensions in HTML before the app bundle runs.
- `2026-09-04 / CF-031`: preserve the live v1 WhatsApp challenge session in a
  short-lived, path-scoped HttpOnly BFF cookie, forward it only as upstream
  `connect.sid` for the WebSocket and OTP confirmation, and keep the browser
  socket behind the trusted e-GYS-origin relay; defer Apple browser UI until a
  later administrator-approved smoke test.
- `2026-09-04 / CF-032`: prefer the highest valid official Sauh `srcset`
  candidate, invalidate cached missing/low-resolution thumbnails before reuse,
  and initialize shared `LazyImage` state from an already-complete DOM image so
  Home-to-detail navigation cannot leave a loaded image under a skeleton.
- `2026-09-04 / CF-033`: treat a WhatsApp WebSocket close/error after a valid
  OTP frame as completion of the delivery channel, not as a failed login;
  preserve the OTP confirmation path while still reporting disconnects that
  happen before any OTP arrives.
- `2026-09-04 / CF-034`: keep Kidung text mode on one selected verse, remove
  the unsupported all-verses scope and its dead selectors, and retain the
  compact verse/song footer while resolving chords for the active verse.
- `2026-09-04 / CF-035`: model browser WhatsApp login as a No. Ref approval
  flow; keep e-GYS's internal WebSocket confirmation code inside the existing
  BFF exchange with the mobile response marker, remove the user-facing OTP
  controls, and finish profile detection automatically after approval while
  keeping Apple deferred.
- `2026-09-04 / CF-038`: keep the BFF as the authoritative e-GYS WhatsApp
  socket relay by requiring the short-lived challenge session, normalizing
  numeric/string approval frames, and allowing the final frame to flush before
  upstream close/error handling; do not add a ref-polling route without an
  e-GYS status API.
- `2026-09-04 / CF-039`: initialize Google Identity Services once per page,
  share overlapping React StrictMode render leases, and decode text or binary
  WhatsApp socket frames before the existing approval exchange; keep the
  Google Cloud JavaScript-origin allowlist as an external deployment
  prerequisite.
- `2026-09-04 / CF-046`: treat a browser profile probe with no session as an
  expected empty state (`200 { profile: null }`), while retaining `401` when a
  present session is rejected by e-GYS; keep provider access decisions on the
  Google/WhatsApp login routes.

Validation for CF-006: the reference audit returned no operational matches;
`pnpm verify:generated`, `pnpm verify:docs`, `pnpm format:check`, `pnpm test`,
`pnpm typecheck`, `pnpm build`, `pnpm verify:native-assets`,
`pnpm verify:bundle`, and `pnpm lint` pass. The final browser gate is 99/99
with a 37-flow smoke suite after the one-flow deduplication.

## Documentation and skill cadence

- Last maintenance skill review: 2026-09-25
- Skill review frontier: CF-109
- Review triggers: 30 calendar days or 10 new resolved frontier decisions,
  whichever comes first.
- Review scope: compare the maintenance skill, `AGENTS.md`, `CONTEXT.md`,
  `scripts/verify-documentation.mjs`, the active spec, and this map; update
  every affected pointer and retain proof, protected prerequisites, and the
  next frontier.
- Review result: the active pasted goal spec, verifier, and map still agree on
  dated frontier receipts, protected prerequisites, next-frontier evidence, and
  the 30-day/10-frontier review triggers. The `gysapp-maintenance` skill,
  workspace `AGENTS.md`, `CONTEXT.md`, and separate simplification spec are
  absent; no missing policy text was fabricated. CF-110 closes 40-to-80 Bible
  Search paging in ID/EN/ZH and packaged WebView2 readiness/search measurements.
  Performance budgets, full offline/filter parity, signed-installer, and OS
  media evidence remain open.

## Frontier

### Resolved: CF-063 — reader surface centering

The Kidung text viewer now gives the active verse sheet the full reader width
and centers each compact all-verses sheet. The Bible split grid reserves half
of the divider on each side, matching the same geometry in the reader-shaped
loading state. No PDF, content, or persistence path changed.

Validation: Kidung usability 39/39, responsive layout 9/9, navigation 23/23,
reading-family 8/8, visual reading 26/26, and the focused loading guard 1/1
passed with retries disabled. The red guards reproduced the former 192px
Kidung max-width offset and 12px Bible pane imbalance before the CSS changes;
the final CUA preview showed centered Kidung all-verses content and no document
overflow. The PDF font warnings are environment-only; no console errors were
captured. The worktree remains intentionally dirty; no reset, merge, push,
deployment, or unrelated formatting cleanup was performed.

### Resolved: CF-059 — Preview/Beta UI audit closure

The current rendered UI audit is complete for the Preview/Beta scope: the
responsive visual matrix, isolated runtime baseline, intentional nested shelf
scrolling, and Bible loading-to-ready geometry have measured evidence. No new
production visual slice is justified until a new regression appears. The
working tree remains intentionally dirty, and the global formatter failure is
tracked as pre-existing rather than repaired opportunistically.

Next frontier: satisfy only the existing GA/native/provider prerequisites —
protected signed artifact/runtime evidence, the canonical-vs-rewrite MIDI
performance gate, durable release reports, and authorized live provider
checks. This is not a GA claim.

### Resolved: CF-060/061 — measured Kidung density continuation

CF-060 compacts the desktop Kidung media dock into two intentional content
bands without changing playback state, queue semantics, advanced controls, or
phone breakpoints. CF-061 composes only the catalog navigation and search/
filter header into one wide-screen row; playlist/settings remain outside the
wrapper and <=1199px keeps the stacked layout. Jev reviewed the rendered
evidence and returned NO_MATCH for further Faith/Bible compression: the Faith
row is content-driven and the Bible header has no failing density or overflow
guard.

Validation: Kidung usability 37/37, media dock 5/5, responsive Kidung/reader
4/4, Kidung accessibility 2/2, web typecheck/build, scoped Prettier checks,
and git diff --check pass. The worktree remains intentionally dirty; no reset,
merge, commit, push, deployment, or speculative refactor was performed.
Next frontier: only reopen a new density slice after a new rendered regression
or failing geometry/accessibility guard.

### Resolved: CF-062 — Kidung text-reader density

The Kidung text reader no longer spends a full extra row on the secondary
scope/autoscroll controls at desktop widths. `apps/web/src/kidung-ux.css`
keeps the existing title/mode row, places the reader controls in the same
compact band, and leaves the mobile stacked layout intact. No JSX, playback,
PDF, catalog-data, or loading contract changed.

Validation: the new guard was red at 119px before the edit and passes at
1440/1241/768px with <=88px toolbar height, no overlap or horizontal overflow,
and >=44px controls. Kidung usability passed 38/38; reading-family 6/6;
navigation exited green with 22 first-attempt passes and one retry-pass, then
the flaky Kidung case passed 1/1 with retries disabled; accessibility 15/15;
web typecheck/build and scoped formatting checks passed. The worktree remains
intentionally dirty; no reset, merge, push, deployment, or speculative route
patch was performed.

### Resolved: CF-001 — shell composition locality

Evidence: `apps/web/src/App.tsx` owns route composition, loading, online
status, settings, and feature wiring, while the 100-line route-independent
navigation responsibility now lives in `apps/web/src/app-navigation.tsx`.
`apps/web/src/app-shell-surfaces.tsx` owns the shared Header and MediaSurface;
`apps/web/src/bible-prefetch.ts` is the single prefetch entry point for both
intent and shell warm-up.

Validation: the existing canonical destination test, web unit tests (57 files,
251 tests), shell/media smoke flows (4), visual flows (19), and workspace
typecheck/build all pass. No route, accessibility name, or media behavior was
changed.

Test-speed validation for CF-007: parallel package units completed in 7.6s
versus 10.6s sequentially; the final full browser suite passed 99/99 in 1.6m
with four workers. The selective resolver has three Node tests covering
docs/unit skips, Bible runtime mapping, and direct E2E-spec mapping.

Validation for CF-008: the dependency audit has no remaining source or
documentation references, the frozen offline install remains lockfile-clean,
and the workspace typecheck, unit, build, bundle, and lint gates pass.

Validation for CF-009: the new cross-port Sauh regression and BFF preflight
test pass; a local Worker returned `204` preflight and `200` JSON with
`Access-Control-Allow-Origin: http://127.0.0.1:5174`; the browser preview then
rendered the live `sbj260903` reflection through the BFF.

Validation for CF-010: `bible-storage.test.ts` first failed on the missing
transforms and then passed 3/3 after the move; the full web unit suite passed
57 files/251 tests and the Bible browser gate passed 24/24, including notes,
highlights, speech, accessibility, responsive, and visual flows.

Validation for CF-011: `kidung-resources.test.ts` first failed because the
resolver did not exist and then passed 3/3; Kidung nav passed 8/8, resource
media passed 3/3, and Kidung/PDF visual flows passed 4/4. The full web unit
suite passed 57 files/251 tests.

Validation for CF-012: the shared MIDI resource test first failed because the
helper was absent and then passed 4/4; Kidung nav passed 8/8, resource media
passed 3/3, and Kidung/PDF visual flows passed 4/4. The full web unit suite
passed 57 files/251 tests, the workspace build passed, and the bundle remained
under its existing budget.

Validation for CF-013: exact-token CSS audit removed 247 dead rule nodes (about
1,485 rule lines) and 79 dead grouped selector members; `styles.css` is now
11,026 lines. One malformed mechanical separator was caught by the visual gate
and corrected without refreshing snapshots. Final visual flows passed 19/19,
accessibility/navigation passed 19/19, `test:fast` passed 67/67, and the full
browser gate passed 99/99. The shell run reported median 310.0 ms and p95
452.2 ms; CSS gzip fell to 32.65 KiB while initial JS stayed 158.6 KiB.

Validation for CF-014: the Kidung web unit suite passed 57 files/251 tests;
the existing MIDI queue persistence flow passed 1/1, and a live `5174`
preview showed the first catalog control change from “Tambah” to “sudah di
antrean” immediately after the playlist store update. The test item was then
removed through the playlist UI so the preview state was restored.

Validation for CF-015: the BFF regression was red before implementation when
the chunked body was three bytes against a four-byte manifest, then passed
46/46 after the shared stream guard gained an exact-size flush check. The
normal package and hymnal-index streaming cases also pass, and no checksum,
URL allowlist, CORS, or e-GYS v2 boundary was changed.

Validation for CF-016: `bible-text.test.ts` passed 1/1 for entity decoding,
footnote removal, semantic styling, and line preservation; the web suite passed
58 files/252 tests, and the Bible-targeted browser gate passed 24/24, including
visual baselines at 390, 768, and 1440 pixels. The reader storage, route, and
speech contracts were unchanged.

Validation for CF-017: the build-stamp unit test passed 3/3; a missing-stamp
local build completed in 4.2s and the unchanged-input reuse check completed in
74ms. A Chromium smoke flow passed 1/1 through the cached preview path in
6.7s. The three 1.1s quick-nav sleeps now await `data-step` state with a 2s
bound; the six waits that validate dwell, negative behavior, or layout
settling remain. The full release command still uses the unconditional root
build path.

Validation for CF-018: the new metadata regression was red before the cache
fix (`getHymnPdfMeta()` stayed `undefined` after `warmHymnPdfMeta()` resolved)
and passed after the settled-value map was added. The web suite passed 59
files/253 tests; the Kidung browser gate passed 25/25 after the mobile geometry
assertion was made aware of Chromium's fractional `dvh` rounding, and the same
flow passed 20 repeated times with four workers.

Validation for CF-019: the new chunked Edge speech regression was red before
the stream cap because an 11 MB body without `content-length` was returned in
full; it now rejects at the 10 MB boundary. The BFF suite passed 47/47, while
the existing content-type, HTTPS, schema, voice-catalog, and exact-size asset
checks remained green.

Validation for CF-020: the tracked native inventory contains 52 icon files
(425,565 bytes) and four duplicate hash groups, all under iOS target names.
`tauri.conf.json` targets all platforms and the native asset verifier plus
Cargo checks remain green, so no native packaging file met the deletion proof.

Validation for CF-021: `HomePage` moved to `apps/web/src/home.tsx`, reducing
`App.tsx` from 2,592 to 2,116 lines without changing route paths or the data
adapters. Web unit tests passed 59 files/253 tests; Home/Sauh/Suara/Literature
browser coverage passed 20/20. The selective resolver regression was red before
the mapping and passed 4/4 afterward, so future Home changes cannot silently
skip browser proof.

Decision CF-022: move the shared `Header`, `MediaSurface`, and duration
formatter into `apps/web/src/app-shell-surfaces.tsx`. Keep `App.tsx` focused on
settings, error recovery, route composition, and `Shell` orchestration after
the targeted shell and accessibility proof.

Validation for CF-022: the extraction reduced `App.tsx` from 2,116 to 421 lines;
the new import boundary typechecked. Shell/media smoke passed 4/4 and the
accessibility flow passed 6/6. An initial 404 was traced to a stale task-owned
docs server occupying port 4173; the exact process was stopped and the same
flows passed without a code change for that failure.

Validation for CF-023: the new BFF regression was red at the Tauri preflight
(`403`) before the allowlist change and passed after the exact origin was added
to the app fallback and Wrangler binding; the test also proves the bearer token
reaches live e-GYS profile forwarding. No wildcard origin or e-GYS v2 route was
introduced.

Validation for CF-024: the new compact-payload contract test was red before the
schema existed and passed after v2 normalization was added. The generated pack
contains 31,172 four-field verse tuples, is 5,949,914 bytes raw versus
7,939,120 before, and its generated provenance/hash gate passes. The bundle gate
keeps `global-bible-search` out of the initial graph; the Bible browser gate
passed 24/24, the performance smoke passed 1/1, and the full browser gate passed
99/99. No Kidung parity files were changed by this slice.

Validation for CF-025: the catalog UI shows both `hymn-051A` and `hymn-051B`
after searching Batu Zaman, while generated provenance still verifies 533
hymns. Focused Kidung/PDF/MIDI tests passed 7 files/36 tests; `pnpm test:fast`
passed all package units and 80 selective browser tests; the responsive proof
passed 7/7 at 320x720, 390x844, 768x1024, 1024x768, 1280x720, and 1440x900,
including the 800% PDF canvas overflow and debounced wheel preview. A live
`hymn-001` run exposed `76BPM` only after PDF metadata warm-up, with no tempo
default before detection. Final delivery gates passed: `pnpm test`,
`pnpm typecheck`, `pnpm build`, `pnpm format:check`, `pnpm lint`,
`pnpm verify:generated`, `pnpm verify:docs`, `pnpm verify:native-assets`,
`pnpm verify:bundle`, and `git diff --check`; fresh `pnpm test:e2e` passed
106/106. No canonical music lock or e-GYS v2 evidence was changed.

Validation for CF-026: the BFF exchange regression was red at the missing route
(`404`) and passed after the live-v1 adapter was added; the focused BFF index
boundary passed 39/39, the full BFF package passed 49/49, the web e-GYS unit
boundary passed 3/3, and the targeted browser suite passed 4/4 with a mocked
GIS callback and BFF. The browser test proves the
profile badge appears automatically, the dialog closes, and no auth token is
written to localStorage. Live Google sign-in still requires the configured
Google JavaScript origin and the protected `EGYS_API_BASE_URL` deployment
binding. No e-GYS v2 route or discovery evidence was changed.

Validation for CF-027: the native profile validator test passed after rejecting
the missing display-name case and stripping an injected token field; the web
IPC parser test passed for the minimal profile shape; native Cargo tests passed
7/7, web unit tests passed 60 files/267 tests, and the focused e-GYS browser
suite passed 5/5. `pnpm test:fast` passed all unit tests but its 106-flow
parallel browser run was 105/106 on two separate non-auth visual/read-aloud
flakes; each failed flow passed when rerun alone with one worker. No browser
cookie, e-GYS v2 route, or provider contract was changed.

Validation for CF-028: the verifier regression was red before cadence checks
were implemented and passes with the current review date and frontier anchor;
the documentation-only path is covered by the existing selective-test rule.

Validation for CF-029: Apple and WhatsApp BFF regressions were red at their
missing routes (`404`) and pass after the live v1 adapters were added; the BFF
suite passes 53/53 and the web suite passes 268/268. The targeted provider
browser flows pass 7/7 with mocked Apple authorization and WebSocket OTP
messages, while `pnpm test:fast` passes the 112-flow selective browser gate.
Live deployment preflight accepts the localhost origin for both new routes;
no live WhatsApp challenge or Apple credential was generated during testing.
No e-GYS v2 discovery route was promoted to runtime.

Validation for CF-030: the web and BFF image-recovery regressions were red
before the parser fallback and pass at 22/22 and 53/53 focused package tests;
the full package unit gate passes 268 web tests, 53 BFF tests, 33 domain tests,
18 contract tests, and 2 testkit tests. A local BFF returned today's
`sbj260904` with the official S3 `200x200` image, and its image proxy returned
`200 image/jpeg` (11,556 bytes). The production shell build reserves the
2263x288 logo at `240x30.53px` before JavaScript/CSS module loading; the full
fresh Chromium gate passed 115/115. No canonical asset or e-GYS v2 evidence
was changed.

Validation for CF-031: the WhatsApp boundary regression was red before the BFF
received the upstream `connect.sid`, then passed after the cookie mapping and
socket relay were added; the focused BFF WhatsApp tests pass 2/2 and the
targeted provider browser suite passes 7/7. A live start response now returns
only the path-scoped BFF cookie name, and a live BFF WebSocket handshake opens
without exposing the upstream origin to the browser; Chrome opened the actual
WhatsApp host rather than `about:blank`. Protected prerequisites are a real
WhatsApp OTP for final end-to-end confirmation and the deferred Apple
administrator configuration; e-GYS v2 discovery evidence remains untouched.
Next frontier: perform one authorized real WhatsApp OTP smoke test, then review
the BFF route split only if route-level coupling warrants it.

Validation for CF-032: the high-resolution parser and cached-image regressions
were red before the `srcset` and cache guards, then the focused web tests pass
24/24 and the focused BFF tests pass 54/54. Chrome verified the local
`5174` -> `8787` flow: Home and Sauh detail both load the official image at
`2560x1708` with opacity 1, the detail skeleton is removed, and returning Home
leaves nonblank content; the browser console had no warnings or errors. The
broader `pnpm test:fast` gate remains blocked by unrelated dirty Kidung i18n
keys, and web typecheck remains blocked by the existing Kidung ref mismatch.
Production use still requires deploying the matching BFF image-selection code;
e-GYS v2 discovery evidence remains untouched.

Next frontier: deploy and smoke-test the matching BFF image proxy only when
production rollout is authorized; otherwise leave the verified local preview
as the acceptance target.

Validation for CF-033: the new WhatsApp close-after-OTP regression was red
before the guard and passes with the focused web test at 2/2; the provider
browser suite remains 7/7 and the native bridge unit suite passes 7/7. The
live Chrome preview keeps the real WhatsApp host open and shows the OTP field
after the BFF handshake. Protected prerequisites are one user-authorized real
OTP/profile smoke test and the deferred Apple administrator configuration;
e-GYS v2 discovery evidence remains untouched.

Next frontier: complete the real WhatsApp OTP smoke test when the user sends
the prepared message; do not enable Apple until its administrator contract is
approved.

Validation for CF-034: the RED Playwright regression first observed three
rendered `.lyrics-sheet` elements and no verse indicator; after the narrow
render/footer change, the focused Kidung navigation tests pass 5/5, the
focused i18n and chord tests pass 16/16, and `pnpm test:fast` passes 112/112
browser flows with 275 web unit tests. Fresh target/reference Playwright
captures at 390x844 and 1440x900 show one selected verse, no scope controls,
and healthy browser/page-error logs; reader snapshots were regenerated for
the selected-verse state. Typecheck, build, format, bundle, policy, and
`git diff --check` pass.

Protected prerequisites are canonical gyschordweb data/manifests and
integrity evidence, the e-GYS v2 discovery-only WIP, and the existing
SoundFont/PDF tempo gate; none were changed. Next frontier: complete the
already-recorded authorized WhatsApp OTP/profile smoke test; keep MIDI/PDF
resource behavior unchanged unless a separate parity decision is approved.

Validation for CF-035: the new browser unit regression was red while the
WebSocket approval code was still exposed as an `otp` event, then passes at
2/2 after the client auto-confirms it internally. The targeted WhatsApp
Playwright flow passes 1/1 and asserts that the dialog has no textbox or
confirmation button. The focused BFF WhatsApp suite passes 2/2, including the
`ismobile=1` response marker, and the full e-GYS provider flow passes 7/7 with
mocked protocol messages. The focused web typecheck and formatter pass, and no
provider secret, browser cookie, or e-GYS v2 route was changed.

Protected prerequisites are one user-authorized real WhatsApp message with
the generated No. Ref followed by bot/administrator approval, plus the
deferred Apple administrator configuration. Next frontier: run that live
approval/profile smoke test when the user explicitly starts the challenge;
keep the internal confirmation code out of UI and logs.

Validation for CF-036: the WhatsApp adapter now normalizes the live socket's
four-digit approval value whether the JSON payload encodes it as a string or a
number; the focused regression was red before the change and passes at 2/2
afterwards. Chrome reopened a fresh BFF-backed challenge and received the
initial WhatsApp handshake without console warnings; no OTP was shown or
logged. Protected prerequisites remain the user's fresh No. Ref message and
bot/administrator approval, plus the deferred Apple configuration. Next
frontier: verify the real approval reaches the profile auto-detection path.

Validation for CF-037: the fullscreen lyrics regression was red before the
drawer existed and passes with the one-row transport, mobile hamburger drawer,
Escape/backdrop/close behavior, and zero horizontal overflow at 390px and
320px. The chord verification toast regression passes, the foreground PDF
smoke opens its reader in 1.17s on the local preview with a 54px single-row
chrome and no horizontal overflow, and unit coverage proves verified MIDI
bytes are reused from the in-memory fast path. The web typecheck, production
build, focused navigation/media Playwright flows (5/5), and resource/cache
unit tests (8/8) pass.

Protected prerequisites are canonical gyschordweb data/manifests and
integrity locks, the e-GYS v2 discovery-only WIP, and the PDF tempo gate; none
were weakened. Browser-plugin capture was unavailable, so validation used the
repository's Playwright runner and the local preview. Next frontier: repeat
the canonical-versus-rewrite cold/warm media benchmark on the authorized
device matrix before making a GA performance claim.

Validation for CF-038: the focused BFF suite passes 45/45, BFF typecheck,
Prettier, and `git diff --check` pass, and the final Worker deployment is
`68c651de-20a2-4517-b04b-617d434e9993`. Live tail evidence for refs
`7712468398` and `1140009277` shows the BFF connected upstream and received a
four-digit approval frame without logging its value; Chrome still reported a
disconnect before profile completion, so this receipt does not claim the live
smoke is green. Protected prerequisites are one fresh user-authorized message
for ref `5437151770` followed by the profile check, the deferred Apple
administrator configuration, and the untouched e-GYS v2 discovery evidence.
Next frontier: complete that one live approval/profile smoke and inspect the
`/confirm` response before considering a Durable Object or other server-side
completion store; a ref-only poll remains unsupported by the live v1 contract.

Validation for CF-039: the focused web e-GYS boundary passes 7/7, including
the overlapping-GIS initialization regression and a binary WhatsApp approval
frame; web typecheck, Prettier, and `git diff --check` pass. The targeted
provider Playwright suite passes 7/7 with Google and WhatsApp protocol mocks.
Worker version `af01f210-7192-4fba-a04d-09c4a6076588` is deployed, and its
live CORS preflight for `localhost:5174` returns 204 while the unauthenticated
profile probe correctly returns 401. Chrome now opens the Google account
chooser for GYS App without `origin_mismatch`; account selection and the live
e-GYS profile remain unverified. Protected prerequisites are one completed
Google selection, one fresh authorized WhatsApp approval/profile smoke, and
the untouched e-GYS v2 discovery evidence.
`pnpm test:fast` reaches BFF 56/56 and web 277/278 before stopping on the
pre-existing unused Kidung i18n keys; no Kidung file was changed for this auth
slice.

Next frontier: complete the Google account selection in the open Chrome popup,
capture the live `/auth/google` and `/account/profile` result, then repeat one
authorized WhatsApp challenge before considering a server-side completion store.

Validation for CF-040 (2026-09-04): Kidung text mode now renders its title,
mode switch, chord/MIDI, and secondary menus in one compact header row; the
upper song-chevron row, auto-scroll, duplicate PDF action, and fullscreen text
entrypoint are gone while the footer keeps verse/song navigation. Ctrl/Cmd
wheel is prevented from changing browser zoom and text mode applies it to the
reader font; PDF mode keeps cursor-anchored preview, 180ms easing, a clear
chord-to-note gap, and an unclipped title line. Proof: RED Playwright
regressions were observed at the old header/chord/title/wheel behavior, then
the focused navigation suite passed 23/23, Kidung placement/media passed
14/14, web typecheck and production build passed, and the control-zoom sample
showed canvas widths 529.5 → 614.6 → 661.4 px across the 180ms transition.
The refreshed reader visual baselines were regenerated for 390, 768, and
1440px. Protected prerequisites are canonical gyschordweb data/manifests,
integrity locks, the e-GYS v2 discovery-only WIP, and the PDF tempo/key gate;
none were weakened. Browser-plugin capture remained unavailable, so rendered
evidence uses the repository Playwright runner and local preview. Next
frontier: repeat the canonical-versus-rewrite cold/warm media benchmark on the
authorized device matrix before any GA performance claim.

Validation for CF-041 (2026-09-04): the newest browser log still shows Google
GIS returning 403 `origin not allowed` for `http://localhost:5174`; it contains
no `/api/v1/auth/egys/google` request, so that attempt stops before the BFF.
The same client opens the Google account chooser from `http://127.0.0.1:5174`,
and Chrome now keeps the detected e-GYS profile on the localhost page after a
refresh; current app logs contain only two browser-extension message-channel
errors. The local preview serves `same-origin-allow-popups`, so the remaining
prerequisite is the exact Google Cloud JavaScript-origin entry for the same
client (or consistently using the already-authorized loopback hostname), not a
new browser-side session detector. TTS 503, favicon 404, extension messages,
and COOP diagnostics remain outside the login boundary. Protected prerequisites
are the untouched e-GYS v2 discovery evidence and canonical release data. Next
frontier: have the administrator verify `http://localhost:5174` on client
`748303683851-46ea0qkq8ti4r6lh8ss5aivf60ct71u7.apps.googleusercontent.com`, then
repeat one fresh Google login after clearing the old console.

Validation for CF-042 (2026-09-04): direct Google Cloud Console inspection of
project `gysapp-tauri` confirms the exact web client used by the app has the
saved JavaScript origins `http://localhost:5174`, `http://127.0.0.1:5174`, and
`https://gyspnk.github.io`; the client has no redirect URI, as expected for the
GIS popup flow. A fresh localhost button attempt sends
`origin=http://localhost:5174` to the Google chooser, but the captured app log
still records the GIS 403/origin warning before account selection. The console
warns that origin changes can take minutes to hours to apply, so no browser or
BFF bypass was added and no Save action was repeated. Protected prerequisites
remain the untouched e-GYS v2 discovery evidence and canonical release data.
Next frontier: after propagation, retry from a newly loaded GIS button; if the
403 remains, have the administrator compare this exact client in the legacy
Credentials view and Google Auth Platform view before changing application
code.

Validation for CF-043 (2026-09-04): the authorized Chrome smoke now completes
Google login on `http://localhost:5174`; the popup closes and the account card
shows a refreshed e-GYS login timestamp after the profile check. The captured
console still contains the GIS button 403/origin diagnostic and two COOP
`window.closed`/`postMessage` warnings, but no application auth error remains;
the profile card is the runtime proof that credential callback, BFF session,
and profile detection completed. The separate Edge voices request still returns
503 and remains outside authentication. WhatsApp was intentionally not tested
in this slice. Protected prerequisites remain the untouched e-GYS v2
discovery evidence and canonical release data. Next frontier: investigate the
non-blocking GIS/COOP console noise only if it persists in a clean fresh-page
capture; handle Edge voices as a separate availability slice.

Validation for CF-044 (2026-09-04): the Google Cloud OAuth web client
`748303683851-46ea0qkq8ti4r6lh8ss5aivf60ct71u7.apps.googleusercontent.com` in
project `gysapp-tauri` now has the four authorized JavaScript origins
`http://localhost`, `http://localhost:5174`, `http://127.0.0.1:5174`, and
`https://gyspnk.github.io`; the console confirmed `OAuth client saved`, and a
fresh read of the client form retained the new bare `http://localhost` row.
No application or BFF change was needed because the existing popup callback
already completed Google login and the local response already serves the
required COOP policy. Protected prerequisites remain the untouched e-GYS v2
discovery evidence and canonical release data. Next frontier: after Google's
propagation window, capture one clean fresh-page GIS attempt; keep the TTS 503,
COOP diagnostics, and WhatsApp flow as separate slices.

Validation for CF-045 (2026-09-04): the browser WhatsApp listener now drains
pending text or binary frames before reporting a transport close/error; the
new regression was red with `[error, success]` before the patch and passes with
the focused web boundary at 3/3. Web typecheck passes, and the targeted e-GYS
Playwright provider suite passes 7/7, including automatic No. Ref approval and
profile detection. Chrome on `http://localhost:5174` reaches the live BFF
`start` response, a `101` WebSocket handshake, and the upstream `info` frame;
the current controlled challenge is waiting for the user's bot approval, so no
live profile completion is claimed yet. The generic asynchronous-listener
console error is not emitted by the app and remains unrelated extension
diagnostic noise. Protected prerequisites remain the untouched e-GYS v2
discovery evidence and canonical release data. Next frontier: complete one
fresh authorized WhatsApp approval/profile smoke and inspect its final BFF
confirmation response without deploying or changing the upstream contract.

Validation for CF-046: 2026-09-04 — the new BFF regression was red with a 401
before the route change and passes with `200 { profile: null }`; the full
focused BFF boundary passes 46/46. The browser provider mocks now model the
same empty-state contract, while the expired-session test retains a 401 gate.
Worker version `c2debcf8-a9ec-49ec-965a-014825d70f7f` is now deployed; its live
no-cookie probe from `http://localhost:5174` returns 200 with
`{ "profile": null }`, `cache-control: no-store`, and the exact allowlisted
CORS origin, while the preflight returns 204 with credentials enabled. The
provider tests and full selective browser gate remain green. Protected
prerequisites remain the untouched e-GYS v2 discovery evidence and canonical
release data. Next frontier: reload the localhost page in a clean tab and
capture one fresh successful Google profile probe.

Validation for CF-047: 2026-09-05 — a live browser challenge for ref
`0830757981` connected through the deployed Worker and received an upstream
`approval` frame with a string OTP after the WhatsApp bot accepted the
request. The smallest red regressions reproduced the exact-four-digit guard in
the BFF normalizer, confirm schema, and browser listener; the focused BFF
boundary now passes 57/57 and the browser WhatsApp boundary passes 3/3 with a
six-digit approval. The fix accepts 4–32 numeric digits, matching the official
portal's minimum-length validation while retaining a bounded trust boundary.
The live profile completion still requires a fresh post-deploy challenge;
protected prerequisites remain the untouched e-GYS v2 discovery evidence and
canonical release data. Next frontier: deploy this fix and capture the
resulting `/whatsapp/confirm` plus profile response in Chrome.

Validation for CF-048: 2026-09-05 — the fresh live ref `2453562088` reached
the Worker WebSocket approval frame and the browser issued `/whatsapp/confirm`,
but e-GYS returned 401. The focused red regression showed the adapter omitted
the official login request metadata; the BFF now sends the e-GYS origin,
login referer, and `X-Requested-With: XMLHttpRequest` on confirmation while
retaining the challenge session cookie. The focused BFF boundary passes 57/57
after the patch. Protected prerequisites remain the untouched e-GYS v2
discovery evidence and canonical release data. Next frontier: deploy this
adapter patch and verify a fresh WhatsApp approval returns an e-GYS session
cookie and profile in Chrome.

Validation for CF-049: 2026-09-05 — the existing Apple adapter is now wired
into the browser login dialog: the enabled Apple row loads Sign in with Apple
on demand, sends only its authorization `code` and `id_token` to the existing
BFF callback boundary, and reuses the normal HttpOnly-session/profile
completion path. The smallest red E2E regression observed the old disabled
button; after the wiring and assertion update, the Apple flow passes with the
local SDK stub and profile fixture, and the complete e-GYS provider E2E file
passes 7/7. Web typecheck passes. Live Apple verification remains dependent
on an Apple ID registered in e-GYS and administrator allowlisting of client
`id.or.gys.e.client` with redirect URI `https://e.gys.or.id/login`; protected
prerequisites remain the untouched e-GYS v2 discovery evidence and canonical
release data. Next frontier: run one authorized live Apple popup smoke test
when that account is available.

Validation for CF-050: 2026-09-05 — Chrome reproduced the Apple authorization
page's provider-side failure before any `/api/v1/auth/egys/apple` request, while
the browser stayed at `Memeriksa akun e-GYS…` because the adapter waited only
for an unresolved SDK Promise. The smallest red regression reproduced an
`AppleIDSignInOnSuccess` event with that Promise left pending; the adapter now
accepts the SDK Promise or its success/failure document event, cleans up both
listeners, and times out a missing response. Apple success and failure browser
regressions pass 2/2, web typecheck passes, and the live provider still requires
the Apple Services ID/client and redirect configuration to accept the app's
authorized origin. Protected prerequisites remain the untouched e-GYS v2
discovery evidence and canonical release data. Next frontier: retry one live
Apple authorization after the provider-side configuration is confirmed.

### Ready after CF-001

- CF-004 — Bible reader state locality (`bible.tsx`, 2,600 lines), with local
  persistence and annotation transforms now isolated and verified.
- CF-005 — Kidung presentation/resource locality (`kidung.tsx`, 3,858 lines),
  with catalog, verified PDF identity, and shared MIDI resource seams isolated;
  viewer/session state is the remaining measured frontier.

## Not yet specified

- remaining `Shell` online/search/wake-lock extraction boundary after runtime tracing;
- stylesheet split order after selector ownership and visual coverage;
- BFF route split after route-level error/security coupling is measured;
- whether duplicate localhost tooling should consolidate into the root wrapper;

## Out of scope

- removing e-GYS v2 WIP, its pinned checkout, generated contract evidence, or
  discovery documentation;
- changing canonical gyschordweb data or weakening integrity/provenance gates;
- adding cloud credentials, deploying protected services, or claiming GA;
- broad dependency replacement without a measured bundle/runtime win.

## Evidence pointers

- Architecture candidates: external report
  `architecture-review-gysapp-20260903.html` in the OS temp directory.
- Acceptance scope: `docs/maintenance/codebase-simplification-spec.md`.
- Agent procedure: `.codex/skills/gysapp-maintenance/SKILL.md`.
- Baseline commands: `CONTEXT.md` and ADR `docs/adr/0008-testing-and-delivery.md`.

Validation for CF-051: 2026-09-05 — focused 320px regressions first failed
on title truncation and action-group menu width. The responsive viewer suite
now passes 8/8, including seven viewports and PDF zoom. Exact command outcomes
are recorded in the Kidung parity spec. No new viewer mode, canonical asset,
or MIDI contract is introduced. Protected prerequisites remain canonical music
provenance and e-GYS v2 evidence. Next frontier: user review on phone and tablet.

Validation for CF-052: 2026-09-07 — the new `kidung-design-tokens` regression
was red before the edit (blue mode glow) and passes after the Teks/PDF
active state became paper/gold. Proof: design tokens 3/3, full web unit 63
files/283 tests, web typecheck green, and `git diff --check` clean. The
committed change is deliberately viewer-scoped: the pujian-list catalog
restyle lives in the uncommitted redesign and travels with its own slice, so
the shipped snapshot cannot drift committed baselines. Protected
prerequisites remain canonical music provenance, integrity locks, the e-GYS v2
discovery-only WIP, and the PDF tempo/MIDI gate; none were changed. Next
frontier: user review of the gold viewer treatment on phone and tablet.

Validation for CF-053: 2026-09-07 — the token regression was red before the
fix (viewer accent ignored the theme preset); `--kidung-accent` on
`.hymn-detail-page` is now `var(--accent, #8d6e3f)` with the reference
80%-mix for dark/amoled, and the mode toggle reads the shared token, so
picking e.g. Zamrud recolors the viewer accent instantly via CSS inheritance
with no JS subscription (the same source chord/PDF surfaces subscribe to). A
web typecheck failure on the new test's `node:fs` import was fixed by reading
the stylesheet with a file-local `@ts-nocheck` (the package is DOM-typed; no
new dependency or tsconfig change). Proof: design tokens 3/3, full web unit
63 files/283 tests, web typecheck green, `git diff --check` clean. Protected
prerequisites remain canonical music provenance, integrity locks, the e-GYS v2
discovery-only WIP, and the PDF tempo/MIDI gate; none were changed. Next
frontier: user review of the gold default and a custom-accent pass on phone
and tablet.

Validation for CF-054: 2026-09-07 — the maintenance-skill review was due
after 11 new frontier decisions, and the commit/push gates were blocked by
the verifier comparing a millisecond day-difference against `30`. The review
compared the skill, `AGENTS.md`, `CONTEXT.md`,
`scripts/verify-documentation.mjs`, the Kidung parity spec/plan, and this
map: agent guardrails, the verification ladder, and the spec pointers show
no drift, so no rule text changed. The one real defect was the verifier
threshold, now `>= 30 * 86400000`, proven by new 29-day (pass) and 30-day
(fail) boundary regressions that were red before the fix. The CF-052/053
receipt dates were corrected to the actual run date. `CONTEXT.md` baseline
counts predate dirty-tree test additions and are left for a release slice
rather than refreshed mid-tree. Proof: `verify-documentation.test.mjs`
4/4, `pnpm verify:docs` green, Prettier check on the touched map and
scripts green. Protected prerequisites remain canonical music provenance,
integrity locks, and the e-GYS v2 discovery-only WIP; none were changed.
Delivery follow-up in the same slice: the first commit accidentally carried
the full uncommitted stylesheet snapshot, and a clean-tree measurement
(origin DOM + that snapshot) failed all three `reader` visuals with 8-10k
differing pixels, so the commit was rebuilt slim (origin stylesheet plus only
the viewer token/toggle hunks) and the catalog restyle stayed in the working
tree for its own slice. Next frontier: resume the Kidung phone/tablet user
review from CF-053.

Validation for CF-055: 2026-09-16 — the current UI audit isolates active
Literatur and Iman ownership in `reading-surfaces.css`, removes the old
elevated row/shelf treatment, keeps metadata readable, adds the visible Iman
heading, and moves the Iman PDF action below the text at <=360px so narrow
phones do not force unreadable line breaks. Preferences keeps a single
landmark heading, all controls remain reachable at 320px and 200% text, and
the visual matrix covers 320/390/600/768/959/960/1024/1440/1920 classes plus
light/dark/sepia/AMOLED samples. Proof: focused reading usability 6/6,
visual reading 25/25, Kidung targeted 6/6, combined UI suite 61 passed with
one Kidung visual poll flaky then passing on retry, and the web layer contract
unit gate green. Protected prerequisites remain canonical gyschordweb data,
generated manifests and integrity locks, release evidence, and the e-GYS v2
discovery-only WIP; no PR was merged, pushed, or exposed. Next frontier:
resolve the open/conflicting PR #5 integration separately after user review.

Validation for CF-056: 2026-09-22 — the test-only runtime baseline ran 21
isolated route/device cases plus one local PDF render, with zero duplicate
assets, zero page/console errors, contained scroll width, no visible loading
panels, maximum 103 ms long task, and maximum observed CLS 0.2172 below the
0.35 audit threshold. The selected UI gate ran 54 cases; one direct-PDF focus
assertion needed the configured retry, then the complete direct-PDF file
passed 8/8 and its focusable selector was aligned to the production visible,
non-hidden contract. Visual consistency, responsive layout/touch, accessibility,
media persistence/load, thumbnail loading, Sauh failure, direct PDF, and PDF
retry gates all passed; `pnpm typecheck`, `pnpm build`, and `git diff --check`
were clean. The working tree remains intentionally dirty from concurrent
work; no reset, merge, commit, push, or unrelated cleanup was performed.

Validation for CF-057: 2026-09-22 — the Home shelf guard passed 1/1 at
320/390/768/1024/1440px, the combined responsive/visual/touch/accessibility
matrix passed 28/28, and Home visual baselines passed 3/3. Section and grid
scroll widths remained contained while first and last cards stayed reachable;
the CUA localhost preview had no document overflow or console warning/error.
Only the two negative inline shelf margins were removed; card data, fetches,
route order, and global overflow behavior were not changed.

Validation for CF-058: 2026-09-22 — the new delayed offline-pack guard was red
before the markup existed and passed 1/1 after the reader-shaped loading state
was added. It covered 320/390/768/1024/1440px, reduced motion, pane geometry,
ready-state top stability, and page errors. Bible smoke/accessibility/visual
checks passed 12/12; typecheck, build, and `git diff --check` passed. CUA
captured both the initial skeleton and settled split reader at localhost with
empty console warning/error logs and no document overflow.

Validation for CF-059: 2026-09-22 — release-readiness and this map now record
CF-057/058 receipts, the responsive/runtime/nested-overflow/Bible evidence, and
the Preview/Beta UI-audit closure. `pnpm verify:docs` and `git diff --check`
are the required gates for this documentation-only slice. The full
`pnpm format:check` failure remains a pre-existing dirty-tree condition across
37 unrelated/concurrent files; no unrelated formatting or production cleanup
was performed. The next frontier contains only existing GA/native/provider
prerequisites and does not invent new visual work.

Validation for CF-062: 2026-09-22 — the Kidung text-reader toolbar regression
was red at 119px and passes at <=88px across the wide/tablet guard widths. The
responsive reading, navigation, and accessibility gates plus web typecheck and
build were rerun after the CSS change. One navigation case was transiently
flaky on its first attempt; the isolated no-retry rerun passed, so it remains a
test-stability note rather than a production finding.

Validation for CF-063: 2026-09-22 — the new Kidung centering guard was red at
192px before the width rule and passed after the animation settled at
1440/1241/768px in both verse and all-verses modes. The Bible split guard was
red at a 12px pane-width difference before the symmetric divider calculation;
the ready and delayed-loading guards now pass at 320/390/768/1024/1440px.
Kidung 39/39, responsive layout 9/9, navigation 23/23, direct reading 8/8,
and visual reading 26/26 passed with retries disabled. `pnpm typecheck`,
`pnpm verify:docs`, `git diff --check`, and the webserver build gate passed.

Validation for CF-064: 2026-09-22 — the canonical hymn PDF parser now keeps
numbered variants 1/2/3 under each note row, producing 12 chord rows for
`hymn-001` instead of 4. The focused unit suite passed 14/14, the new
all-verses Playwright guard passed at 390x844, and the existing centering guard
passed at 1440/1241/768px. CUA measured all three sheet centers at 640px with
four chord layers each and no horizontal overflow in the localhost preview.

Validation for CF-065: 2026-09-24 — the exact pinned-source audit confirms
1,225 locked music assets, 533 catalog entries, and 3,655 mapped chord
positions with zero orphan or invalid rows; every catalog MIDI/PDF reference
resolves, including the six A/B variants and `416.MID`. The full web unit gate
passed 301/301, typecheck/lint/build/format/docs/generated/bundle gates passed,
and the full Playwright run passed 271 with one optional KJV network-download
case skipped. Strict chord audit, native asset verification, Rust fmt/check/
clippy, and all six Rust tests passed. The live keyless Edge protocol smoke
returned 17,568 bytes in 666 ms; the real Tauri development window also played
chapter and verse speech with pause, stop, and voice change. Generated
provenance still reports 89/299 literature items without official covers.
The production dependency audit found no known vulnerabilities.
Protected source provenance, asset locks, and e-GYS v2 discovery evidence were
left intact. Next frontier: packaged Tauri byte/abort proof and the remaining
partial rows in the feature-parity matrix.

Validation for CF-066: 2026-09-24 — More now has seven localized disclosure
categories, keeps details collapsed until requested, and routes audio to the
existing Bible speech controls. The offline deep link now aligns its category
row below the top bar; the 390×844 screenshot confirms the row and local pack
heading are both visible. The refreshed More and offline screenshots were
reviewed at 390×844, 768×1024, and 1440×900. Focused regression checks passed
7/7; the full web Playwright suite passed 273 with one optional KJV download
case skipped. Current CSS source totals 368,605 bytes across nine files versus
372,998 at `db53050`. `pnpm verify:docs` and `git diff --check` remain the final
documentation gates. Next frontier: route-level Bible search/notes and
references review, while packaged Tauri speech and live asset/account services
remain open parity evidence.

Validation for CF-067: 2026-09-24 — inspection of the exact pinned upstream
commit found no Bible reader UI or Bible data pack; its only Alkitab matches
are assets for one hymn. The parity matrix now tracks Bible as a rewrite-only
extension, with its product UX acceptance reviewed separately. No Bible code
changed in this documentation slice. Next frontier: implement the saved Bible
annotation behavior after the user approves its short design, then continue the
remaining Kidung reader and packaged-runtime parity checks.

Validation for CF-068: 2026-09-24 — the shared `.chord-rich-line` default now
uses 1.65em top padding, which increases marker-to-lyric space from 5.2px to
10.6px without changing stored reader typography. The focused Playwright guard
passed after failing on the original spacing; screenshots at 390×844 and
1440×900 were reviewed. Next frontier: complete the pending Bible annotation
design approval, then continue the remaining Kidung reader and packaged-runtime
parity checks.

Validation for CF-069: 2026-09-24 — Bible search opens from reader actions and
focuses its field; Notes opens from More; filters are collapsed initially; the
audio settings deep link opens the existing speech controls. The four focused
Playwright flows passed, including testament/book filtering and verse
annotations. Search and Notes visual baselines remain separate from the reader
baseline. Annotation storage semantics and the complete split/version/text-
scale matrix remain open.

Validation for CF-070: 2026-09-24 — the phone reader shows Play and chord
controls beside More; the menu contains fullscreen, favorite, queue, verse
scope, auto-scroll, and reader settings. Without SoundFont, Play opens the
offline asset section; with the test SoundFont installed, MIDI playback and
instrument settings remain available. Eight targeted reader/navigation checks
and six reviewed visual baselines passed; `i18n.test.ts` passed 4/4 after
removing the stale `bible.openNotes` translation. The nine CSS sources total
368,931 bytes, 4,067 bytes below the `db53050` baseline. The full E2E run and
Offline packaged screen were later verified under CF-073; full settings route
coverage, PDF/MIDI session matrices, and signed package proof remain open.

Validation for CF-073: 2026-09-24 — `node --test
scripts/verify-service-worker.test.mjs` passed 4/4. Shell cache v20 plus the
Tauri startup URL `?v=20` made the rebuilt standard package show the shortened
Offline copy on its first launch in the existing profile; no app data was
cleared. Native inspection confirmed metadata stays hidden until `Diagnostik`
is opened. Full E2E passed 282 cases with one optional KJV skip and one
retry-passing touch-target flake; five serial repeats of that check passed.
Remaining offline upgrade/recovery and provider download matrices stay open.

Validation for CF-074: 2026-09-24 — upstream playlist JSON imports into saved
playlists and exports with `nomor`, `judul`, and `fileHref`; create, rename,
delete, active selection, queue load, song removal, reordering, and reload were
exercised at 390×844. Opening row menus above the queue is covered by a hit-test
assertion. The two parity E2E flows passed 2/2, the localized tools disclosure
passed in ID/EN/ZH, and the lower-case variant ID unit test passed 1/1. The full
localStorage-eviction/IndexedDB restore and packaged multi-song autoplay were
then open.

Validation for CF-075: 2026-09-24 — the PDF fullscreen target contains both
toolbar and page stage, and exit restores normal reader layout. The cross-origin
download action emits `Pujilah Allah Yang Maha Esa.pdf`; the downloaded bytes
start with `%PDF`. Browser coverage also verifies idle toolbar restore, saved
page resume, phone layout/zoom, and in-shell retry. The focused PDF-density and
media-load specs passed 11/11; packaged cache recovery and overlay-version
pairing remain open.

Validation for CF-076: 2026-09-24 — after creating a populated saved playlist,
the browser confirmed its IndexedDB mirror, cleared both playlist and active
localStorage keys, and reloaded the phone playlist route. The saved songs and
active marker restored from IndexedDB; the focused recovery E2E passed 1/1.
The native multi-song autoplay and long-session checks remain open.

Validation for CF-077: 2026-09-24 — the Bible annotation flow migrates a
legacy note, keeps multiple notes scoped to the selected verse, removes one
note without deleting its sibling, clears preset highlights, and restores a
custom highlight after reload. The 390×844 E2E also measures every selected-
verse toolbar button and color control against the 44px minimum. The focused
E2E passed 2/2, the portable-backup unit passed 3/3, the encrypted-backup E2E
passed 1/1, web typecheck passed, and docs/format checks passed. Packaged
annotation restore and the full ID/EN/ZH, theme, and 200% text matrix remain
open. Full unit/policy tests passed 303/303; the 291-case release suite had
289 passing, one optional KJV network skip, and one retry-passing navigation
timeout that passed its isolated no-retry rerun. Lint, workspace typecheck,
build, generated provenance, formatting, documentation, exact-source strict
chord audit, and all native cargo gates passed.

Validation for CF-078: 2026-09-25 — the packaged Tauri WebView2 smoke confirmed
stop-during-synthesis abort, a switch to `id-ID-GadisNeural`, non-zero receive
and playback diagnostics (33,984 bytes), pause/resume/stop, and a same-voice
repeat request. Manual Computer Use confirmed Bible playback pauses and Stop
returns the player to idle. The web typecheck, targeted Prettier check, and
`pnpm verify:docs` passed. The daily native workflow is configured but has not
run from the default branch. Signed installer installation/upgrade and the
browser system/local voice matrix remain open.

Validation for CF-079: 2026-09-25 — a fresh-profile packaged run reproduced a
`tauri.localhost` navigation failure while the initial Service Worker
controller was still null. Root cause was the production `controllerchange`
handler reloading the page for its first controller; WebView2 failed that
reload before the navigation click. `main.tsx` now skips only this first-control
reload and still reloads an already controlled page for later updates. After a
release rebuild, the isolated-profile native smoke passed navigation, abort,
voice change, non-zero receive/playback, pause/resume/stop, and repeat request.
`pnpm --filter @gys/web typecheck` and the packaged Tauri build passed. The full
Service Worker update/offline lifecycle remains open.

Validation for CF-080: 2026-09-25 — the focused reader interaction test first
failed because the closed search form had no `aria-hidden` or `inert` state.
The form now enters both states while closed, becomes available before the
toolbar focuses its input, and returns focus to the toolbar on close. The
focused Playwright flow passed; typecheck and targeted format checks passed.
The release Tauri executable rebuilt and its native Edge smoke passed after
the change. Computer Use displayed the rebuilt app Home; navigation input
failed twice with `foreground window did not report a process id`, so no
post-change Bible screenshot was captured through Computer Use.

Validation for CF-081: 2026-09-25 — the queue shortcut was visible in the
persistent MIDI surface despite the secondary-control hierarchy. Moving the
existing action into the advanced disclosure passed the focused Kidung dock
checks at 320, 390, 768, and 1440px; phone and desktop screenshots were
reviewed, with no horizontal overflow and the desktop dock within two bands
and 128px. A two-song browser playback fixture also confirmed auto-advance
after the first MIDI ends. Native multi-song autoplay and long-session playback
remain open.

Validation for CF-082: 2026-09-25 — a 10-second browser MIDI fixture played
through the dock and verified keyboard seek, volume adjustment, mute toggle,
transpose, instrument selection, tempo adjustment, and stop. The fixture's
intentionally incomplete SoundFont selected the oscillator compatibility
backend, so packaged FluidSynth controls and long-session behavior remain open.

Validation for CF-083: 2026-09-25 — new unit regressions first failed on both
natural completion and crossfade because the old buffer/gain nodes were never
disconnected. The player now disconnects the active pair at completion,
disconnects the outgoing pair when crossfade ends, and always releases an
orphaned gain during stop. MIDI player unit tests passed 9/9; five focused
dock/autoplay/control/session E2E flows passed. Packaged long-session memory
growth is not measured yet.

Validation for CF-084: 2026-09-25 — four BFF manifest cases cover mismatched
top-level commit, mismatched entry commit, a missing locked chord, and a chord
attributed to the wrong song; the latter two first failed, then all cases passed
after runtime lock matching was added. The generated audit and music lock agree
on all 157 chord/PDF SHA pairs. Computer Use displayed hymn-001's Fork master
page 5 with the chord layer enabled; all-song alternate-source compatibility
and packaged cache recovery remain unverified.

Validation for CF-085: 2026-09-25 — the new cache-recovery test failed before
the fix when a corrupt cached distribution package suppressed the valid
network fallback. Cached bytes now pass the release size/checksum before use;
mismatched cache entries are deleted, and a downloaded package is validated
before caching. The regression passed, as did the focused Fork PDF tests,
workspace web typecheck, targeted Prettier check, and `pnpm verify:docs`.
Offline-only recovery and the packaged cache lifecycle remain open.

Validation for CF-086: 2026-09-25 — on initial Bible pack load, the shared
header fallback was clickable while the search form remained `inert`; its
focus attempt was discarded before the reader published active header state.
The fallback is now disabled only on the Bible route until that state exists,
leaving other route search actions enabled. Computer Use saw the loading action
disabled; browser interaction confirmed the open form is not inert and the
query receives focus. Focused Bible search visual baselines at 390×844 and
1440×900, including filters, were reviewed and refreshed; search/reader E2E
passed 6/6. The full release suite then surfaced a separate Kidung menu target
measurement during its open animation; CF-087 records that fix.

Validation for CF-087: 2026-09-25 — the full E2E run measured the nested
settings summary at 43.45px while the more-specific open-state rule applied the
shared scale animation. The open Kidung disclosures now override that rule with
the existing translate-only animation, keeping the 44px target stable. The
phone reader regression passed 5/5 repetitions; full release Playwright passed
292 tests with one optional KJV network-download skip and no failures.

Validation for CF-088: 2026-09-25 — `cargo fmt --check`, `cargo check`,
`cargo test` (6/6 native unit tests), and
`cargo clippy --all-targets -- -D warnings` all passed. Signed installer installation/upgrade and file-picker
behavior still require their release/runtime environment.

Validation for CF-089: 2026-09-25 — the new offline cache regression first
failed because the loader never consulted its stored release manifest after
the Fork source failed. The loader now validates the hymnals track, KR package
schema, trusted download URL, package size/SHA, and final PDF integrity while
using a cached manifest if the network fetch fails. Fork PDF tests pass 5/5,
web typecheck and targeted Prettier pass; browser/native packaged offline
profile recovery remains open. Computer Use still renders hymn-001's Fork
master page 5 with the chord layer visible in the local preview.

Validation for CF-090: 2026-09-25 — dedicated Kidung PDF canvas baselines pass
2/2 at phone and desktop sizes and were visually reviewed. The screenshot
helper blocks remote GitHub requests, so these baselines cover the deterministic
PDF canvas without an overlay; existing media-load E2E and Computer Use cover
the hymn-001 chord overlay. Broader state and cross-source coverage remain open.

Validation for CF-091: 2026-09-25 — the PDF direct-manipulation regression
passes 8/8 repetitions with a 0.001px assertion tolerance; the 44px CSS target
is unchanged. The latest full Playwright suite reports 293 passed, 1 flaky, and
1 optional KJV network-download skip. The flaky backup-import case first hit
`ERR_NO_BUFFER_SPACE` while navigating to the local test server, then passed on
retry; an isolated repeat passed 3/3.

Validation for CF-092: 2026-09-25 — a deterministic browser voice matrix first
exposed that Auto selected a nonlocal Indonesian voice while the dock labeled
it local from the provider-wide offline flag. The dock now labels the active
voice. All 7 `media-dock.spec.ts` tests pass; the two new cases verify Auto
selects the system voice and Local selects only the installed local voice.
Actual OS voice inventory and signed-installer coverage remain open.

Validation for CF-093: 2026-09-25 — the pinned GYSChordWeb chord JSON/PDF pairs
and GYSAPP-Fork master PDF were fetched by immutable source revision and
validated against the local size/SHA locks. Across 157 chord files, 177 pages,
and 3,655 chord entries (2 sentinels), there were no missing song mappings,
out-of-range pages or note indices, note-token/row mismatches, or row-boundary
mismatches. This proves the current KR chord-backed Fork pairing; packaged
offline recovery and distributed-PDF lifecycle remain separate open gates.

Validation for CF-094: 2026-09-25 — regressions failed before the fix because
same-length corrupted distributed payload and catalog bytes were returned as
valid. New cache records persist a payload SHA-256; reads verify it and the
existing catalog SHA before use, and the asset-status check now verifies full
bytes before retaining an installed record. Existing records without a payload
hash remain readable. The complete web unit suite passed 313/313, web
typecheck passed, and targeted Prettier passed. Package download checksum
verification and atomic registry replacement remain intact. The current
browser/PWA/Tauri clean-profile, offline, update, remove, and reinstall matrix
is still open.

Validation for CF-095: 2026-09-25 — the regression removes the payload hash
from a previously installed record, proves its cached bytes remain usable,
checks that the first read stores the SHA-256, then mutates the same-size cache
entry and confirms the next read rejects it. The regression failed before the
backfill. All 314 web unit tests, web typecheck, and the distributed-assets
Chromium E2E flow (3/3: catalog, install, reload, remove) pass; that E2E uses a
test-routed same-origin download endpoint, not the live BFF or Tauri. Legacy
bytes retain their historical package-verification trust on first migration;
pre-migration same-size corruption cannot be distinguished. Clean-profile
native offline/update/reinstall verification remains open.

Validation for CF-096: 2026-09-25 — the regression first showed that
`hymn-051A` (Batu Zaman), which has no chord reference in the pinned catalog or
manifest, was incorrectly shown a connectivity hint and retry button. The
reader now reports only that chord data is unavailable; transient load errors
retain their retry action. The targeted media-load regression and all nine
media-load E2E cases pass, as do all 314 web unit tests, web typecheck,
targeted Prettier, and `git diff --check`. Computer Use confirmed the absence
state visually in a fresh local preview; the release Tauri WebView2 smoke also
passed the packaged missing-chord assertion alongside abort, voice change,
non-zero Edge audio, pause/resume/stop, and repeated playback. This does not
close packaged chord-cache recovery or distributed PDF lifecycle verification.

Validation for CF-097: 2026-09-25 — the new mobile regression failed first:
at the 320px viewport the filter toolbar began at y=637px, below the featured
shelf at y=271px. After moving the toolbar above the shelves and hiding recent
items during filtering, the full `reading-family-usability.spec.ts` passes
7/7; its catalog check covers 320, 390, 600, 768, 1024, 1440 and 1920px. Web
typecheck, 314 unit tests, targeted Prettier and `git diff --check` pass.
Computer Use confirmed search and filters before discovery shelves at 390px and
1440px, and a live `Warta` search showed matching results without unrelated
shelves. Complete literature source/offline and locale checks remain open.

Validation for CF-098: 2026-09-25 — the focused distributed-asset manager suite
passes 11/11, including a stream that fails after delivering bytes, confirms no
asset is registered, then retries successfully. The 390×844 browser preview
shows the expanded local-pack actions within the viewport and reports no
horizontal overflow. Web typecheck, documentation verification, targeted
Prettier and `git diff --check` pass. Clean-profile install/offline/update and
reinstall lifecycle coverage remains open.

Validation for CF-099: 2026-09-25 — the two Chromium distributed-asset specs
pass 4/4 with Service Worker control enabled: they cover package install,
reload, offline shell restart, cached Bible readback, remove, and reinstall.
The manager suite passes 12/12, including partial-response retry, a version
update, and reinstall after removal. The browser test uses the bundled TB
SQLite bytes as a deterministic payload fixture under the KJV catalog entry;
it verifies storage lifecycle, not KJV translation fidelity. Native Tauri
offline asset lifecycle and other distributed asset types remain open.

Validation for CF-100: 2026-09-25 — the eight Literature catalog screenshots
were reviewed at 320, 390, 600, 768, 1024, 1440, and 1920 pixels plus dark
390px before their expected images were updated. The full browser suite passes
297 tests, skips two optional cases, and records one e-GYS account-summary
timeout that passed on retry; an isolated three-run check passes 3/3. The
distributed offline restart test passes 1/1 with the local BFF and now skips
when the default suite has no BFF. Web unit tests pass 316/316, typecheck,
lint, build, generated-artifact and documentation checks pass. Native Rust
format/check/test/clippy pass, with six native tests. Computer Use on the
refreshed 1280×720 preview confirms Bible verses and cross-reference actions,
plus Kidung lyrics and its chord, SoundFont, and verse navigation controls.
Native clean-profile
offline lifecycle, installer, account-provider, locale/theme/text-size matrix,
and other remaining parity areas stay open.

Validation for CF-101: 2026-09-25 — one Playwright case covers 30 rendered
states (three locales × five themes × Bible and Kidung) at 390×844 with the
document root scaled to 200%. All route headings remain visible and every state
keeps document scroll width within the viewport. The targeted E2E passes 1/1;
web typecheck passes. Other routes and native preference persistence remain
open.

Validation for CF-102: 2026-09-25 — More Appearance now keeps Theme and Language
in compact select rows and reveals the accent palette only when its disclosure
opens; obsolete theme-pill CSS was removed. The focused More E2E passes 5/5,
and Appearance visual cases pass 3/3 at 320×720, 390×844, and 1440×900. Each
case captures collapsed and expanded accent disclosures; all six screenshots
were reviewed with no horizontal overflow. Other routes and native preference
persistence remain open.

Validation for CF-103: 2026-09-25 — upstream `main` still resolves to the
matrix SHA `fced26004f7bd9eb5ad8b67cc3b1568f90e79468`. Its Kidung filter
AND-matches substrings within song number, title, and normalized lyrics; local
search now does likewise while retaining quoted phrases and accent folding.
Both title-fragment and zero-padded-number regressions failed before the fix and
pass now. `kidung-density.spec.ts` passes 9/9, web unit tests 318/318,
typecheck and build pass. Full query-corpus and locale parity remain open.

Validation for CF-104: 2026-09-25 — corrected the responsive Bible navigation
E2E to open the Appearance accent disclosure before checking its palette. The
default Playwright release suite passes 304 cases with two BFF-gated download
cases skipped; the two distributed-asset spec files pass 4/4 with a localhost
BFF base and mocked manifests/package bytes, covering offline restart and
remove/reinstall. The SQLite fixture verifies storage behavior, not KJV
translation fidelity. Restored the default no-BFF web build; native clean
install and all-asset lifecycle remain open.

Validation for CF-105: 2026-09-25 — pinned upstream `filterPujianList()` searches
number, title, and normalized lyrics, not catalog IDs or collection labels.
Local search excludes those metadata fields while preserving lettered source
numbers such as `051A/B`. The metadata-only false-positive regression failed
before the fix; hymn-search unit tests pass 7/7 and focused catalog/search E2E
passes 7/7. Full query-corpus and locale parity remain open.

Validation for CF-106: 2026-09-25 — the phone PDF title now measures against its
full toolbar slot instead of shrinking its intrinsic grid width, and the
readability floor is 11px with ellipsis. This deliberately raises the pinned
upstream 9px minimum. The old 390×844 size/geometry regression failed before
the fix; 390×844 and 1440×900 PDF screenshots pass 6/6 over three repetitions.
Offline/packaged PDF recovery and all-source chord/PDF pairing remain open.

Validation for CF-107: 2026-09-25 — post-change unit tests pass 319/319, with
lint, typecheck, format, and documentation verification green. The full browser
suite passes 303 cases, skips two BFF-gated cases, and records one Literature
600×900 document-width flake that passed on retry; the isolated case passes
3/3. No Literature screenshot was regenerated.

Validation for CF-108: 2026-09-25 — upstream `main`, search source, and the
533-entry Kidung catalog all resolve to `fced26004f7bd9eb5ad8b67cc3b1568f90e79468`.
The full-catalog differential passes number, title, first-verse, AND-term, and
all-six-collection queries. Punctuation normalization was reproduced RED and
fixed; the full test command passes (web 321/321), as do typecheck, lint, format,
and docs verification. ID/EN/ZH search E2E passes 1/1. Computer Use verified the
`001` result on the 390×844 catalog while changing the visible app language.

Validation for CF-109: 2026-09-25 — Computer Use confirmed the Bible search
action is disabled while the pack loads, then opens and focuses the search after
Kejadian 1 appears. The targeted 390×844 Playwright case renders exactly 40
`Allah` results without horizontal overflow and checks localized labels in
ID/EN/ZH (1/1); packaged startup and large-pack latency remain open.

Validation for CF-110: 2026-09-25 — the focused 390×844 Playwright case checks
40 initial results, the localized More action, 80 expanded results, and no
horizontal overflow in ID/EN/ZH (1/1). Computer Use clicked the 40-result page
in the live Vite UI and observed 40 more. The fresh no-bundle WebView2 build and
native smoke pass: home 151ms, Bible ready 1,169ms, search 390ms, 40-to-80
results, no `EDGE_TTS_URL`, and 33,984 audio bytes received and played. The
current frontier leaves latency targets, full offline/filter coverage,
installer, and OS media open.

Validation for CF-111: 2026-09-25 — the initial Bible-filtered run reused a stale preview on port 4173 and rendered blank routes. A fresh web build and isolated preview resolved the environment issue. The 40-case filtered Playwright run then passed 38 cases; two distributed offline/install cases skipped because a BFF download service was not configured. The run created seven previously missing Chromium screenshots for Bible reader, search, search filters, and notes; those baselines were reviewed at 390×844, 768×1024, and 1440×900, and the rerun passed. Computer Use on a clean-origin preview confirmed the localized More action appears after 40 results and expands the list to 80. The broader app matrix, packaged latency budget, BFF-backed download flows, installer, and OS media remain open.

Validation for CF-112: 2026-09-25 — an ID Playwright case blocks all off-origin requests after the offline Bible pack loads, confirms reversed AND-term matches, excludes the same terms in exact-phrase mode, then verifies the substring-only book query Yohan disappears with whole-word filtering (1/1). The packaged WebView2 smoke now enforces a 1,500ms budget from broad-search submit to 40 visible results after reader readiness; four clean-profile runs measured 379–399ms (max 399ms; Bible ready 1,092–1,191ms). The 41-case Bible-filtered suite passes 39 with two BFF-gated skips. Book/reference filters, offline installation and recovery, deep links, signed installer, and OS media remain open.

Validation for CF-113: 2026-09-25 — with a temporary local BFF build setting and Playwright-mocked manifests/package bytes, the optional Bible download, reload, removal, reinstall, and offline reopen lifecycle passes together with asset listing and Kidung optional-collection checks (4/4). The payload uses the checked-in TB SQLite fixture to verify storage lifecycle, not KJV content or a live provider. After restoring the no-BFF build, Computer Use on a clean origin confirmed the download-service notice, disabled optional download buttons, and bundled TB/core hymns remain available offline. Live BFF/package delivery, broader search filters, deep links, installer, and OS media remain open.

Validation for CF-114: 2026-09-25 — the Bible search filter E2E now verifies both testament scopes and an exact Yohanes book scope; every returned result stays in the selected book (1/1). This exercises the existing book option through the UI without adding a separate search implementation. Reference-query and deep-link edge coverage, live BFF/package delivery, installer, and OS media remain open.

Validation for CF-115: 2026-09-26 — a Browser E2E against the real TB pack verifies verse 999 clamps to Yohanes 3:36, chapter 99 clamps to Yohanes 21:1, and an unknown-book link keeps a seeded Yohanes 3 reading position (1/1). No production code change was needed; typed-reference search and other deep-link cases remain open.

Validation for CF-116: 2026-09-26 — a fresh Bible-filtered Playwright run with a temporary local BFF build and mocked downloads passed 42/42 with zero skips, including responsive, accessibility, offline recovery, asset install/remove/reinstall, filters, deep links, and visual baselines. The web app was rebuilt afterward with BFF configuration unset. The live provider and signed installer remain unverified.

Validation for CF-117: 2026-09-26 — system media actions now follow the active speech or MIDI source; speech play resumes when paused, previous/next follows the speech queue, and unsupported seek actions are removed instead of stopping TTS. The Media Session bridge publishes speech playback state and clears stale MIDI position state. A Playwright MediaSession stub verifies speech previous/next, pause/resume and seek removal (1/1). Computer Use verified real local TTS playback and the dock surviving Bible-to-Kidung navigation. Native OS transport controls remain unverified because no native app window was exposed to Computer Use.

Validation for CF-118: 2026-09-26 — Bible search now resolves optional book plus chapter:verse to exact repository fields, preventing number-substring collisions while retaining book and testament filters. Domain tests pass 7/7. The UI E2E returns only Yohanes 3:16, opens Yohanes 3, and selects verse 16. Deep-link parsing rejects decimal fractions, exponent, hex, zero, and negative chapter/verse inputs; its focused tests pass 14/14, and the browser flow confirms an exponent-form chapter falls back to the saved Yohanes 3 position. The workspace production build and focused Bible browser cases pass (2/2); cross-version/history links, live BFF delivery, signed installer, and native OS media remain open.

Validation for CF-119: 2026-09-26 — the split-reader E2E now checks that the sync-scroll option is hidden before split activation and after returning to single-pane mode. The responsive browser case passes at 320×720, 390×844, 768×1024, 1024×768 and 1440×900, checking vertical/mobile versus horizontal/desktop ordering, equal pane width/style, and no document overflow (2/2). Computer Use visually confirmed the 1280×720 desktop split. Removed two stale split-control style groups that have no markup references. The full workspace build, focused E2E (2/2), and docs gate pass; secondary-version alignment, loading/error states, and packaged interaction remain open.

Validation for CF-120: 2026-09-26 — a fresh browser context with no installed KJV reproduces the secondary-pane load error. The UI now reports a localized concise failure using the KJV short name and exposes a retry action; the implementation retries only the secondary load, while the primary pane remains visible. Focused split E2E passes 3/3, i18n tests 4/4, web typecheck and Prettier checks pass. Cross-translation verse alignment and transient/offline retry recovery in a packaged runtime remain open.

Validation for CF-121: 2026-09-26 — the browser exports a real encrypted backup containing a Bible note, bookmark, custom highlight, and palette, clears those keys, then imports the same file through the settings UI. The Bible route reload confirms the bookmark state, custom color, and saved note are visible. A malformed import reports an error and preserves existing preferences and a private token. Focused Chromium E2E passes 2/2. Packaged file-picker and legacy backup coverage remain open.

Validation for CF-122: 2026-09-26 — rebuilt `gysapp-native.exe` from this worktree with `tauri build --no-bundle`, then passed the packaged WebView2 Edge smoke without an API key or gateway configuration. Abort, `id-ID-GadisNeural` selection, 33,984 received/played bytes, pause/resume/stop, repeat synthesis, and missing-chord behavior pass. Packaged Bible search returns 40/80 results in 400ms against a 1,500ms budget; Home and Bible readiness are 34ms and 1,099ms. `cargo fmt --check`, `cargo check`, six Rust tests, and Clippy with warnings denied pass. Signed-installer installation and upgrade remain open.

Validation for CF-123: 2026-09-26 — live `gyschordweb/main`, the clean local source checkout, and generated music lock all resolve to `fced26004f7bd9eb5ad8b67cc3b1568f90e79468`. Generated-provenance, strict chord-layout, and native-asset verification pass: 1,225 music assets, 533 hymns, 3,655 mapped chord positions with zero orphan/invalid entries, and 17 verified native assets. Literature source reports 89/299 items without official covers.

Validation for CF-124: 2026-09-26 — the full Chromium release suite completed 315 cases: 312 passed, two BFF-gated downloads skipped, and one first-attempt cold `hymn-001` heading wait failed before passing on the configured retry. The isolated same case passes 3/3 with two workers and retries disabled. The failure was limited to initial route readiness; subsequent route-race/PDF assertions passed. Keep the isolated repeat receipt with the suite result; do not classify the full run as flake-free.

Validation for CF-125: 2026-09-26 — seed the activity record and Bible book/chapter as Yohanes 3, open Home, then click its Bible Continue card. The browser returns to the saved Yohanes 3 reader (1/1). Cross-version search links and packaged history restore remain open.

Validation for CF-126: 2026-09-26 — global Bible search URLs now carry their source version; the installed-version browser flow switches from saved `b_kjv` to `b_tb`, then selects Yohanes 3:16 (1/1). Computer Use confirmed the route and selected verse at 1280×720. Bible deep-link unit tests pass 15/15; `pnpm test` passes 323/323 after raising the full-corpus Kidung parity test timeout from 5 to 15 seconds. Typecheck, lint, and focused Prettier checks pass; `pnpm test:e2e` completes 315 cases with 313 passing, two BFF-gated downloads skipped, and no failures. KJV text fidelity, live BFF delivery, and packaged history restore remain open.

Validation for CF-127: 2026-09-26 — the packaged Edge smoke records Yohanes 3 from the Bible reader, returns Home, closes the app through Windows `CloseMainWindow`, and relaunches against the same temporary WebView2 profile. The Home Bible Continue card still reads Yohanes 3. Fresh `tauri build --no-bundle` and the complete packaged smoke pass with `EDGE_TTS_URL` unset: Edge abort, Gadis voice, 33,984 received/played bytes, pause/resume/stop, repeat request, missing-chord state, and 40/80 Bible search results in 376ms against a 1,500ms budget. Home and Bible readiness measure 170ms and 1,178ms. Signed installer/upgrade, live BFF delivery, KJV text fidelity, native OS media/voice inventory, and broader platform matrix remain open.

Validation for CF-128: 2026-09-26 — packaged WebView2 smoke starts and stops the pinned hymn-001 MIDI through FluidSynth using the size/SHA-verified SoundFont. The native queue then auto-advances between two short deterministic MIDI fixtures through FluidSynth; the wait observes the second track title after the playlist index changes. Keyless Edge TTS, 40/80-result Bible search (397ms against 1,500ms), and Bible Continue restore after a graceful close/relaunch also pass. Full-length packaged multi-song autoplay, long-session memory soak, signed installer/upgrade, live BFF delivery, translation fidelity, and native OS media/voice inventory remain open.

Validation for CF-129: 2026-09-26 — in packaged Tauri, smoke blocks all cross-origin HTTP(S) while hymn-001 PDF opens; the remote Fork request is aborted and the canonical bundle fallback renders a 419×644 PDF.js canvas. The local asset-manifest entry is `source: local`; the 13,540-byte file matches its pinned music-lock SHA-256. Keyless Edge, real hymn-001 FluidSynth playback, fixture-based packaged queue auto-advance, 40/80 Bible search (377ms against 1,500ms), and Bible Continue after graceful restart also pass. Other PDF sources, packaged cache corruption/recovery, full-length native queue autoplay, long-session memory soak, signed installer/upgrade, live BFF delivery, translation fidelity, and native OS media/voice inventory remain open.

Validation for CF-130: 2026-09-26 — after verifying both pinned MIDI files and the SoundFont, the packaged smoke blocks their exact source URLs. Hymn-001 still starts/stops with FluidSynth, and the two-fixture native queue auto-advances without a blocked request. This confirms the checksum-verified Cache Storage path for one actual track, its next track bytes, and the SoundFont. Full-length native multi-song playback, long-session memory soak, the remaining offline pack assets, signed installer/upgrade, live BFF delivery, translation fidelity, and native OS media/voice inventory remain open.

Validation for CF-131: 2026-09-26 — a fresh packaged WebView2 profile reaches Home and completes Bible search while every cross-origin HTTP(S) request after navigation is aborted (13 attempts). Home and Bible readiness measure 66ms and 1,131ms; Bible search returns 40/80 results in 390ms against a 1,500ms budget. After unblocking the network, keyless Edge, pinned FluidSynth playback, offline PDF/MIDI cache checks, and Bible Continue after graceful restart still pass. Remaining route, PWA, all-asset, and stale-content recovery matrices stay open.

Validation for CF-132: 2026-09-26 — the installed core catalog contains 533 Rohani hymns; optional collection names in catalog metadata do not represent installed entries. Collection slugs now render as readable names. The Chromium catalog case passes (1/1), and the rebuilt packaged WebView2 smoke selects the installed `Rohani` filter successfully with the Edge gateway unset. Computer Use confirmed the menu and selected value visually. Labels for optional distributed hymnals remain to be checked when those assets are installed.

Validation for CF-133: 2026-09-26 — a fresh packaged WebView2 profile saves a note, bookmark and blue highlight on Kejadian 1:1, returns Home, closes through Windows `CloseMainWindow`, and relaunches with the same profile. The restored verse retains its highlight and bookmark state, and the saved note reopens in the reader. Full native smoke passes with `EDGE_TTS_URL` unset, including keyless Edge TTS, offline PDF/MIDI, 40/80-result Bible search, and prior Yohanes 3 Continue restore. Custom-palette and native backup continuity through app upgrade remain open.

Validation for CF-134: 2026-09-26 — packaged hymn-001 typography changes from 18px/1.65 to 19px/1.75 through the reader settings, survives a graceful Tauri close/relaunch, and restores in the rendered reader (19px text and computed line-height ratio 1.75). The full keyless WebView2 smoke also passes. The complete touch/wheel matrix across packaged devices remains open.

Validation for CF-135: 2026-09-26 — in a fresh packaged Tauri profile, Home and Bible search work under the existing 13-request off-origin block. Faith renders 10 topics, Literature 299 entries, Sauh returns a current reading, and Suara renders 164 entries while 36 more cross-origin requests are blocked. The wider pass also retains Kidung/PDF/MIDI, annotation and typography restart checks. Optional asset install/remove/reinstall, update, stale-content and media-download lifecycle remain open.

Validation for CF-136: 2026-09-26 — with `EDGE_TTS_URL` unset, packaged WebView2 saves EN/dark through the shell controls, closes gracefully, and restores both preferences after restart; the smoke then resets the profile to ID/light before remaining checks. Computer Use visually confirmed EN/dark after reload at 1280×720 and restored ID/light; the 390×844 viewport measured no horizontal overflow. The smoke also opens Sauh after removing its request block and confirms a current article (`Enggan Masuk Kanaan`). The off-origin block explicitly allows same-origin calls, and the bundled Sauh snapshot only reaches 2026-09-16, so this recovery is not standalone offline proof. Same-origin API isolation and current-day offline availability, broader route-specific preferences, native backup and asset lifecycle remain open.

Validation for CF-137: 2026-09-26 — packaged WebView2 sets `#ca7231` through the Bible custom-color input event on Kejadian 1:2 while retaining the note, bookmark and blue highlight on 1:1. After a graceful close/relaunch with the same profile, the second verse keeps the custom highlight class and computed color, and the palette still contains `#ca7231`. The complete keyless Edge/PDF/MIDI/Sauh smoke passes. Native file-picker, legacy backup import and cross-version upgrade continuity remain open.

Validation for CF-138: 2026-09-26 — refreshed canonical music data to live `gyschordweb/main@e8e7efe1189b5746a2bb542348e221844091c8d1`. The source diff since the prior pinned revision contains four new chord records (153, 156, 164, 333) and their manifest entries. Regeneration yields 1,229 locked assets (533 PDFs, 533 MIDI, 161 chords, 2 SoundFonts), 533 hymns, and 161 hymn chord references. The strict PDF.js audit verifies all 161 chord files against upstream PDFs: 3,738 mapped positions, zero missing/orphan/invalid entries; the upstream list, source directory, and lock match exactly. `pnpm verify:generated` and `pnpm audit:chords:check` pass. Fork-master cross-source pairing for the four new records remains open.

Validation for CF-139: 2026-09-26 — More now saves and opens backups through platform file dialogs, treats a cancelled native save as cancellation, and imports legacy settings through the portable-key allowlist while preserving the legacy payload for migration. Browser data-integrity E2E passes 7/7, including encrypted export/import, legacy import without a password, and malformed-input preservation; native adapter tests pass 8/8; web typecheck, cargo fmt --check, cargo check, and git diff --check pass. The existing v2 AES-GCM format and portable-key allowlist remain the export/restore boundary. Computer Use exposed only browser surfaces (apps: []), so native picker UI is still unverified; next frontier is packaged Tauri open/save dialogs and cross-version restore with a Windows app window available.

Validation for CF-140: 2026-09-26 — rebuilt the packaged Tauri application and ran the WebView2 smoke. FluidSynth auto-advanced through 24 short-fixture track transitions in a 51.7-second session; after stopping playback and forcing garbage collection, retained renderer heap was 426,234 bytes against a 16 MiB ceiling. The same run passed keyless Edge synthesis (33,984 bytes received/played), offline PDF fallback, Bible search in 445ms against 1,500ms, and restart persistence checks. The soak is limited to two short fixtures and does not establish full-length multi-song behavior or all native transport controls; next frontier is longer real-song playback and tempo/transpose/volume/instrument/cancellation verification.

Validation for CF-141: 2026-09-26 — the optional HYMNE browser fixture writes a 33-byte PDF payload and 91-byte catalog metadata with matching SHA-256 values; the distributed store reads and normalizes the entry. The initial E2E expectation was wrong: default Kidung browsing omits optional asset rows until their collection is selected. The Chromium case now selects `English`, confirms the readable collection options, and displays `hymne-001` (1/1). Computer Use confirms the desktop catalog and collection control with the 533 core entries; native app inventory remains unavailable (`apps: []`).

Validation for CF-142: 2026-09-26 — packaged Tauri WebView2 completed the pinned 164.210s hymn-001 at tempo 220: runtime duration was 57.856s and playback ended after 57.851s from position zero. FluidSynth used the checksum-verified MIDI and SoundFont cache entries with source URLs blocked. The actual track passed progress, pause/resume, stop, volume, mute, tempo, transpose, and instrument controls. Two short cached fixtures still auto-advance through 24 transitions; retained renderer heap after stop and GC is 524,417 bytes (<16 MiB). The same keyless run passes Edge TTS (33,984 bytes received/played), offline PDF fallback, and Bible search in 444ms against 1,500ms. Full-length multi-song autoplay, MIDI render cancellation, longer-session memory soak, and CUA native file-picker proof remain open.

Validation for CF-143: 2026-09-26 — the chord audit now has an opt-in --fork mode. The pnpm audit:chords:fork:check command verifies the pinned GYSAPP-Fork master PDF size and SHA-256 before pairing it with the current upstream chord/PDF lock. All 161 songs and 181 pages pass; 3,736 non-sentinel chord entries have zero note-token, row-boundary, lyric, relative-position (0.02 tolerance), or mapping mismatches, with two sentinel entries preserved. The generated docs/discovery/chord-fork-position-audit.json records the result. Next frontier: packaged cache corruption/recovery across distributed PDF sources.

Validation for CF-144: 2026-09-26 — the full unit run exposed stale fced260... source constants in the Kidung differential and chord BFF-lock tests; both now pin current gyschordweb/main@e8e7efe1189b5746a2bb542348e221844091c8d1. Focused regressions pass 5/5, pnpm test passes 323/323, and workspace typecheck/lint pass. Full Playwright ran 318 cases: 316 passed and two BFF-gated asset-download cases skipped, with no failures. Computer Use at 390×844 confirms compact Kidung search/catalog, Bible text-first reading, and seven collapsed More categories with settings revealed on demand. Next frontier: native picker UI and packaged PDF/cache recovery remain unverified by these browser gates.

Validation for CF-145: 2026-09-26 — packaged Tauri/WebView2 detects a same-size corrupted hymn-001 MIDI cache entry, rejects it by SHA-256, evicts it, fetches one verified replacement, then reloads and plays with the MIDI and SoundFont URLs blocked. Stopping during FluidSynth WASM rendering terminates the worker with three requests in flight; playback recreates it and completes hymn-001. At 220 BPM, real hymn-001 and hymn-002 complete at ≥90% of displayed duration (queue timings 57.881s and 38.425s). A 120-transition deterministic-fixture soak runs for 207.340s and retains 1,171,632 renderer heap bytes after stop and GC (<16 MiB). MIDI unit tests pass 11/11, media-dock and playlist E2E pass 11/11, full unit tests pass 325/325, and the native smoke continues to pass keyless Edge TTS, offline PDF, and Bible search.

Validation for CF-146: 2026-09-27 — packaged Tauri/WebView2 renders the locked hymn-001 PDF with the Fork PDF blocked (419×644 canvas; blob-backed download). For remote-only hymn-051A, the smoke seeds the verified asset, corrupts one byte without changing size, observes exactly one repair fetch, verifies restored size/SHA-256, reloads with the upstream origin blocked, and renders from cache without a request. The same native smoke passes keyless Edge audio (33,984 bytes received/played), real MIDI controls/render cancellation, two full pinned tracks at 220 BPM, a 120-transition soak (207.213s; 654,466 retained renderer heap bytes after GC), Bible search (40/80 in 384ms), and restart restoration. Full web verification passes 325 unit tests, typecheck, lint, build, formatting, documentation/generated checks, and both chord audits; Playwright passes 316/318 with two BFF-gated distributed-Bible cases skipped. Generated provenance validates 1,229 music assets, 533 hymns, 10 offline assets, and 210/299 literature covers. Optional distributed PDF asset lifecycle remains open.

Validation for CF-147: 2026-09-27 — consolidated five exact duplicate rule copies in `styles.css`, preserving the final header reset in `calm-liturgical.css` and Kidung row/layout ownership in `kidung-ux.css`. PostCSS reports zero identical rule bodies within the same selector and at-rule scope. Nine source stylesheets total 370,709 bytes, 101 media rules, 70 `!important` declarations, 398 repeated selector groups, and 656 occurrences beyond first. Focused Playwright passes all 59 Kidung density/usability/PDF cases, including snapshots from 320px phone through 1920px wide desktop; targeted Prettier and `git diff --check` pass.

Validation for CF-148: 2026-09-27 — the responsive appearance spec now covers 120 states across Home, Bible, Kidung, Faith, Literature, Sauh, Suara and More: Indonesian/English/Chinese × five themes, 390×844, and 200% root text. All surfaces render with matching language/theme attributes and no horizontal overflow. The 15-test appearance spec passes. Native route-specific reader/audio persistence remains open.

Validation for CF-149: 2026-09-27 — corrected the five distributed Hymnal metadata hashes and byte sizes to match raw LF responses pinned to Fork commit `4f0d39b`; the generator now verifies every metadata URL's raw size and SHA-256 before publishing. The HYMNE BFF regression reproduces 502 with the prior CRLF-derived size and passes after correction. BFF tests pass 50/50, asset manager/store tests pass 22/22, and the configured offline Playwright spec passes 2/2 using actual pinned HYMNE index bytes with a fixture PDF package, covering install, offline reload, remove/reinstall, and offline Kidung read. `pnpm verify:generated` passes for 1,229 music assets, 533 hymns, 10 offline assets, and 210/299 Literature covers. Preserve the exact Fork commit pin and fail generation on any byte-level metadata drift. Next: verify optional asset install/remove/reinstall against the published package in packaged Tauri and continue the all-pack offline recovery matrix.

Validation for CF-150: 2026-09-27 — packaged Tauri/WebView2 verifies actual HYMNE PDF install, retry after 503, offline render across graceful restart, and remove/reinstall; KJV rejects a truncated package without storing it, retries, and reads Genesis 1:1 offline before and after restart; actual GeneralUser-GS installs with verified bytes and FluidSynth plays hymn-001 offline after restart. The production CSP permits wasm-unsafe-eval but does not enable JavaScript unsafe-eval. A test-only BFF base and localhost connect origin were removed by rebuilding the default app. Smoke counts: HYMNE 3 package and 2 metadata requests, KJV 2, SoundFont 1. Next frontier: verify the other optional Bible/hymnal packages, then package update and interrupted-transfer recovery across those asset types.

Validation for CF-151: 2026-09-27 — expanded `apps/web/scripts/distributed-assets-native-smoke.mjs` from three actual packages to all eight optional release packages. Packaged Tauri/WebView2 now verifies HYMNE 503 retry, offline PDF before/after graceful restart, remove/reinstall; KJV truncated-body rejection, retry and offline Genesis 1:1 before/after restart; CUV offline Chinese verse before/after restart; offline PDF rendering for Mandarin and ASM-I/M/P before/after restart; and checksum-verified GeneralUser-GS playback offline after restart. The run passes with HYMNE 3 package/2 metadata requests, KJV 2, CUV/MDR/ASM-I/ASM-M/ASM-P/SoundFont 1 each, and one metadata request per optional hymnal. The local BFF origin and connect-src addition exist only in the test build; the default production binary was rebuilt and checked without either. Protected prerequisite: retain production `wasm-unsafe-eval` for SQL.js while keeping JavaScript `unsafe-eval` and localhost BFF origins out of production. Next frontier: packaged package-version updates and interrupted-transfer recovery across all asset kinds, then provider and route-specific reader/audio parity.

Validation for CF-152: 2026-09-27 — packaged Tauri/WebView2 seeded the installed version stale, then used each visible update action to update KJV, CUV, MDR, ASM-I, ASM-M, ASM-P and GeneralUser-GS. Every update changed its version and cache name. KJV and CUV verses, all four optional hymnal PDFs, and checksum-verified FluidSynth playback remained readable offline after a graceful same-profile restart. Actual BFF request counts: HYMNE 3 package/2 metadata; KJV 3; CUV/MDR/ASM-I/ASM-M/ASM-P/GeneralUser-GS 2 each; MDR and ASM-I/M/P metadata 2 each. The test-only BFF origin/CSP overlay was removed, port 8788 stopped, and default Tauri was rebuilt with no local endpoint in `dist` or EXE; CSP retains `wasm-unsafe-eval` without JavaScript `unsafe-eval`. Protected prerequisite: keep SQL.js WebAssembly enabled while excluding test endpoints from production. Next frontier: prove interrupted-transfer recovery across Bible, hymnal, and SoundFont packages, then resume provider and route-specific reader/audio parity.

Validation for CF-153: 2026-09-27 — packaged Tauri/WebView2 aborts the initial CUV, MDR and GeneralUser-GS package requests; each failed package leaves no install record, and retry downloads its actual BFF release bytes. An aborted KJV update retains the previous version, cache name and payload checksum, then retry replaces it successfully. KJV's incomplete response still rejects before persistence and recovers. The full smoke also passes all seven package updates, offline Bible/hymnal reads and SoundFont playback after graceful restart. Request counts: HYMNE 3 package/2 metadata, KJV 4, CUV/MDR/GeneralUser-GS 3 each, ASM-I/M/P 2 each; all optional hymnal metadata indexes 2 each. The temporary BFF/CSP overlay was removed, the BFF stopped, and default production Tauri rebuilt with no local endpoint; CSP retains only the WebAssembly eval exception. Protected prerequisite: preserve valid cache/checksum state until a replacement passes package verification. Next frontier: packaged remove/reinstall coverage for the remaining optional releases, then provider and route-specific reader/audio parity.

Validation for CF-154: 2026-09-27 — after update and interrupted-transfer recovery, the packaged Tauri Data Offline UI removes and reinstalls KJV, CUV, MDR, ASM-I, ASM-M, ASM-P and GeneralUser-GS; the same run removes and reinstalls HYMNE. Every release returns to its installed state with verified package bytes, and HYMNE renders offline after reinstall. Final counts are HYMNE 3 package/2 metadata, KJV 5, CUV/MDR/GeneralUser-GS 4 each, ASM-I/M/P 3 each, with each optional hymnal metadata index fetched 3 times. The local BFF/CSP overlay was removed, the BFF stopped, and default production Tauri was rebuilt and scanned without local endpoints. Protected prerequisite: package removal clears old records so reinstalls cannot serve stale payloads. Next frontier: complete provider and route-specific reader/audio parity checks, using live account/provider actions only when the required external identity is available.

Validation for CF-155: 2026-09-27 — verified live `gyschordweb/main` against `git ls-remote` at `e8e7efe1189b5746a2bb542348e221844091c8d1` and inspected its per-PDF tempo cache plus per-SoundFont instrument preference. The packaged Tauri/WebView2 smoke changes MIDI volume, tempo, transpose and instrument in the visible Kidung controls and sets Edge voice/engine in Bible settings; after graceful same-profile restart the storage matches and the Kidung route renders those MIDI values, while per-song typography still restores at 19px/1.75. Full native smoke passes keyless Edge with 33,984 bytes received/played, FluidSynth on two full tracks, and 120 queue transitions (1,025,457 retained bytes after GC). Protected prerequisite: preserve selected user settings in the same native profile without conflating Edge neural speech with offline/local speech. Next frontier: resolve the observed per-song metadata cache defect and retain manual BPM persistence while applying PDF defaults.

Validation for CF-156: 2026-09-27 — a regression first failed because `getHymnPdfMeta` always returned `undefined` while attaching a `.then()` callback; it now reads a separate settled-value cache, and failed PDF retrieval falls back to 76 BPM. Per-song PDF defaults are used unless the persisted manual global BPM override is active; late metadata updates are generation-guarded. The metadata/MIDI unit tests pass 15/15, full workspace `pnpm test` passes 329/329, Web typecheck and no-bundle production Tauri build pass. Fresh packaged Edge/WebView2 smoke passes Edge TTS (33,984 bytes received and played), MIDI control and cache recovery, two full 220 BPM tracks, 120 transitions (1,114,537 retained bytes after GC), plus TTS/MIDI preference restoration after graceful restart. A final scan finds no local test endpoint in `dist` or EXE, production CSP retains `wasm-unsafe-eval` without JavaScript `unsafe-eval`. Protected prerequisite: never let an old song generation apply a late BPM to the new track, and preserve a user-selected global BPM across routes/restart. Next frontier: verify the native backup file picker, Windows media transport panel, and signed installer; provider actions remain gated on an external identity.

Validation for CF-157: 2026-09-27 — refreshed the official Literature snapshot to 300 entries with 299 covers. A cached 299-item browser profile stayed stale because revalidation stopped after a successful BFF response and the union helper did not flag incoming-only IDs. The regression failed before the fix; revalidation now continues through the local snapshot and detects those entries. The focused Literature tests pass 4/4 and the full Web unit suite passes 330/330. Literature visual-reading passes 13/13. The first all-Literature Playwright run failed only at the PDF focus-wrap check (29/30); isolated repeats pass 3/3 and the full rerun passes 30/30 with no focus-code change, so retain the initial failure in the reliability record. Computer Use verified an existing 299-item page advances to 300 after refresh. A fresh packaged Tauri/WebView2 smoke also renders 300 while blocking 13 shell and 39 content cross-origin requests. Keyless Edge receives and plays 33,984 bytes; Bible search returns 40/80 results in 436ms; two MIDI tracks finish and auto-advance at 220 BPM, and 120 transitions complete in 207.312s with 1,204,983 retained renderer bytes after GC. Sauh withholds stale offline content and recovers after network returns. Next frontier: verify the native backup file picker, Windows media transport panel, and signed installer; provider actions remain gated on an external identity.

Validation for CF-158: 2026-09-27 — refreshed the bundled feed from TJC’s official category API using the existing production parser. The six newest entries now include [sbj260927, “Hidup yang Selalu Diperbaharui”](https://tjc.org/id/gerakan-baca-alkitab/sbj260927/) with its official image; the parser selects today by canonical slug even though WordPress’s modified timestamp is September 25. The 21,601-byte snapshot and pack/asset manifests pass pnpm verify:generated; Sauh unit tests pass 21/21, including an offline-mode test that verifies only the bundled feed is requested. The responsive preview shows the current article/image without console errors. A fresh packaged Tauri/WebView2 smoke passes with 16 shell and 39 content off-origin requests blocked: Sauh renders the bundled reading and returns to the same title after external requests are unblocked; Literature 300, Faith 10, Suara 164. The full smoke also passes keyless Edge playback (33,984 bytes), Bible search (40/80 in 427ms), the offline PDF fallback (419×644), two 220 BPM MIDI tracks, 120 queue transitions in 207.324s (1,168,656 retained bytes after GC), and restart persistence. Later-day freshness still requires regenerating this snapshot; native file picker, Windows media transport panel, signed installer, and provider identity checks remain open.

Validation for CF-159: 2026-09-27 — inspected pinned upstream docs/js/app-core.js and confirmed navigateTo(page) switches its in-page view without an addressable route. GYSApp intentionally adds BrowserRouter direct URLs and browser history. A focused Playwright case now verifies Kidung detail → More offline-data deep link, then Back/Forward restores the song and the linked asset section. Existing tests cover direct Kidung ?section=playlist, direct More ?section=data, and localized unknown routes. The focused browser case passes 1/1; no upstream navigation capability is missing.

Validation for CF-160: 2026-09-27 — the MIDI Media Session browser fixture now captures the Web Media Session contract. Playwright confirms hymn metadata, transport actions, playlist next-track routing, and playing/paused state; the focused test passes 1/1. The native Windows OS transport panel remains unverified because Computer Use exposes no native app controls in this host.

Validation for CF-161: 2026-09-27 — fullscreen Lyrics E2E now verifies wheel navigation, touch swipe navigation, and pinch font scaling at 320, 390, 768, 1024, and 1440px. The focused test passes 1/1 with no horizontal overflow. Browser input simulation is covered; physical touch delivery in packaged Tauri remains open.

Validation for CF-162: 2026-09-27 — audited pinned gyschordweb@e8e7efe and confirmed it has no Suara Sejati route/feed; its media-session.js handles MIDI. GYSApp Suara is an official TJC article catalog/detail feed with an offline snapshot, so the parity matrix now records this as an intentional extension and keeps transport requirements in Media Session/TTS. Four focused Playwright cases pass.

Validation for CF-163: 2026-09-27 — Faith coverage passes 16/16 visual/direct-flow E2E cases: the catalog spans 320–1920px, PDF overlay spans 390/768/1024/1440px, and source links, resume, focus, dark/unavailable states, and 404 retry behave correctly. The note smoke passes 1/1; packaged offline startup renders 10 topics. Remaining frontier is Faith note and PDF progress through packaged restart.

Validation for CF-164: 2026-09-27 — packaged Tauri/WebView2 now saves a Faith topic note through its UI and restores the textarea after graceful restart. The full native smoke passes: fresh profile blocks 14 shell and 39 content off-origin requests; Faith 10, Literature 300, Sauh current-day, Suara 164; Edge receives/plays 33,984 bytes; Bible returns 40/80 results in 453ms; offline PDF renders 419×644; two full 220 BPM tracks and 120 transitions pass (207.185s; 1,077,296 retained bytes). Packaged Faith PDF page-progress restore remains the next Faith frontier.

Validation for CF-165: 2026-09-27 — service-worker VM regression now invokes the actual activation handler with v18/v19 shells, remote-media, gys-bible, and unrelated caches. It removes only stale shell versions and claims open clients; `node --test scripts/verify-service-worker.test.mjs` passes 5/5. Browser update, PDF cache-growth and stale-content recovery remain open.

Validation for CF-166: 2026-09-27 — appearance E2E passes 2/2: all eight routes stay contained at 390×844 with 200% text across ID/EN/ZH and five themes (120 combinations). The visual route matrix also covers phone, tablet, and desktop sizes; packaged graceful restart restores Bible Continue at Yohanes 3. Browser fresh-profile coverage verifies empty activity and Sauh/Suara/Literature errors plus retry requests at 390×844; packaged error and activity transitions remain the next Home frontier.

Validation for CF-167: 2026-09-27 — packaged Tauri/WebView2 selects an installed local Indonesian (id-ID) voice and observes the real utterance start event, then stops cleanly and restores the Edge engine; the full native smoke passes, including keyless Edge receiving and playing 33,984 bytes. The browser-visible local voice inventory is proven on this Windows WebView2 runtime; keep native speech system-supplied and keep Edge free of an embedded API key. Next frontier: check local voices on other supported runtimes and finish signed-installer/upgrade verification.

Validation for CF-168: 2026-09-27 — refreshed Faith PDF links to the official S3 mirror after the old TJC WordPress paths returned 404. Packaged WebView2 confirms the S3 object is reachable but blocks it because the publisher omits `Access-Control-Allow-Origin`; CSP was not the cause. The repository BFF route already allowlists S3 and preserves HTTP ranges (focused contract test passes), but the configured live Worker still returns 403 for the S3 host and 503 for the legacy path. No deploy was performed. The native PDF-progress smoke now runs only when `VITE_BFF_BASE_URL` is supplied; without it, the known CORS-blocked case is reported as skipped so the remaining packaged gates can run. Protected prerequisite: keep PDF retrieval on the allowlisted range-preserving BFF route. Next frontier: update and deploy the Worker allowlist, then build Tauri with its configured BFF base and verify Faith page-2 persistence after restart.

Validation for CF-169: 2026-09-27 — a fresh Playwright profile at 390×844 forces empty packaged snapshots and blocks the official publisher requests. Home keeps the empty “recent reading” state, renders readable Sauh/Suara/Literature error panels and retry controls, verifies each retry issues new requests, and has no horizontal overflow (1/1). Protected prerequisite: do not present stale Sauh as today’s reading when the source is unavailable. Next frontier: exercise these failures and retry transitions in packaged Tauri and verify saved activity on Home after restart.

Validation for CF-170: 2026-09-27 — fetching the official Literature pages with the current checkout BFF parser returns 300 entries: 129 testimonies, 106 Warta, 45 Pelita Kecil, 10 guide PDFs, and 10 books. The live public Worker returns 287 and omits nine guide PDFs plus four books; its single guide item is the accordion heading. Local parser output and the bundled snapshot agree. No deploy was performed; live source parity depends on refreshing the deployed Worker.

Validation for CF-171: 2026-09-27 — packaged Tauri/WebView2 opens Home with empty activity and empty Sauh/Suara/Literature snapshots while external fetches are rejected. All three error panels and retry actions appear, each retry issues a new feed request, and Home has no horizontal overflow. The full smoke passes: keyless Edge receives/plays 33,984 bytes, local Indonesian speech starts, Bible search returns 40/80 in 377ms, the offline PDF renders at 419×644, two full 220 BPM MIDI tracks auto-advance, and 120 transitions finish in 207.216s with 599,451 retained bytes after GC. Bible activity and settings survive graceful restart. Faith PDF page-progress remains skipped because this build has no BFF base. Next: verify Home retries recover after connectivity returns.

Validation for CF-172: 2026-09-27 — the 390×844 Playwright Home resilience case starts with empty snapshots and blocked publisher traffic, verifies all three feed errors and retries, then restores valid local snapshot responses. Sauh content, Suara cards, and Literature cards render again and error panels clear. The focused Playwright case passes 1/1 in 9.1s. Packaged runtime still needs a successful Home retry with restored feed data.

Validation for CF-173: 2026-09-27 — the local BFF route returns `206 Partial Content` for bytes 0–1023 of the official S3 Faith PDF, with a 1,024-byte response and `Access-Control-Allow-Origin: http://tauri.localhost`. The focused browser resume case opens the PDF at page 4/10 and restores 40% progress (1/1). Packaged page-progress remains open because the live Worker rejects S3 and the test-only localhost CSP build was blocked by shell policy before execution; no configuration or binary was changed. Next frontier: use an approved BFF endpoint in the packaged build and verify page-progress persistence after restart.

Validation for CF-174: 2026-09-27 — packaged Tauri/WebView2 Home starts with empty feed fixtures and rejected off-origin traffic; all three retry actions issue new requests. Re-enabling packaged snapshots lets each retry restore its shelf and clear the corresponding error panel; counts are Sauh 2, Suara 4, Literature 4, with no horizontal overflow. The full native smoke passes, including keyless Edge audio (33,984 bytes), installed Indonesian voice playback, Bible search 40/80 in 382ms, offline PDF canvas (419×644), restart persistence, two full 220 BPM MIDI tracks, and 120 transitions (207.318s; 582,075 retained bytes). Faith PDF page-progress remains skipped because this build has no BFF base.

Validation for CF-175: 2026-09-27 — fetched both remotes with a clean upstream worktree while preserving the active GYSApp worktree. `origin/main` remains `db53050e71857129669f620114a61d9af2eedcb4`; `gyschordweb/origin/main` remains `e8e7efe1189b5746a2bb542348e221844091c8d1` and matches the generated music lock. `node scripts/edge-tts-live-smoke.mjs` passes keyless synthesis with 17,568 bytes in 630ms. The daily workflows are defined on this branch but cannot run on GitHub Actions until the changes reach the default branch; no deployment or push was made.

Validation for CF-176: 2026-09-28 — chord cache format 2 verifies pinned raw bytes by size and SHA; legacy normalized records remain readable offline and upgrade without losing pins. Web tests pass 333/333, domain tests 33/33, and packaged WebView2 confirms same-size corruption repair, offline reuse, and legacy migration. Protected prerequisite: never discard a valid pinned chord or break legacy offline reads. Next frontier: carry the verified cache through an in-place native profile upgrade.

Validation for CF-177: 2026-09-28 — shell v21 migrates editorial snapshots into stable content storage before deleting the old shell and excludes PDF responses from shell caching; incidental PDFs are capped at 16 MiB without evicting MIDI or chords. Service-worker tests pass 7/7, music-asset tests 5/5, and the real Chromium worker migration case passes 1/1. Protected prerequisite: preserve old offline snapshots and canonical music assets during activation. Next frontier: verify this upgrade path in packaged WebView2 and refresh the manifest.

Validation for CF-178: 2026-09-28 — shell v22 resolves install resources against the worker origin and routes failed navigations to cached index.html or /. The service-worker verifier passes 9/9; a fresh packaged Tauri profile confirms root/index caching, offline routes, retry states, and zero off-origin content requests. Protected prerequisite: retain the current offline shell when install or navigation requests fail. Next frontier: verify persistent-profile upgrades and signed installer behavior.

Validation for CF-179: 2026-09-28 — Sauh now packages the six newest official entries through sbj260928 in a 22,208-byte snapshot (SHA-256 100365498892621d909c83ac762939d93912633d27457b6ac8bb58d4be97e0f0); raw-source citation parsing keeps Matius 21:43 paired with the featured quote. BFF tests pass 9/9, Web tests 21/21, the service-worker verifier 10/10, generated provenance passes, and packaged WebView2 renders the matching title/reference offline. Protected prerequisite: derive quote and citation from the same raw publisher article. Next frontier: refresh on later publication and test the snapshot across an in-place profile upgrade.

Validation for CF-180: 2026-09-28 — both upstream main refs were fetched and remain aligned with their pinned commits: GYSApp db53050e71857129669f620114a61d9af2eedcb4 and gyschordweb e8e7efe1189b5746a2bb542348e221844091c8d1. Protected prerequisite: preserve the active dirty worktree and do not commit, push, or deploy. Next frontier: recheck exact upstream refs before any later data refresh.

Validation for CF-181: 2026-09-28 — chord color/fill palettes and opacity/font/padding sliders are collapsed behind the Kidung appearance heading and open through native details/summary; keyboard, locale, and persisted controls remain available. Focused browser accessibility and responsive checks pass, Axe reports zero violations, and reviewed screenshots cover 390×844 and 1440×900. Protected prerequisite: do not remove settings or reset user preferences. Next frontier: continue the route/theme/locale and full text-scale audit.

Validation for CF-182: 2026-09-28 — corrected the MIDI control E2E to assert a one-BPM increase from the current song-specific PDF tempo; hymn-002 starts at 76 BPM, so its updated value is 77 rather than a hardcoded 121. The focused case passes, the full Playwright suite passes 321 tests with three BFF-gated cases also passing against local mocked assets, all workspace tests pass, and format/lint/typecheck/build/generated/docs/chord plus native fmt/check/test/clippy gates pass. Protected prerequisite: preserve per-song PDF tempo unless the user explicitly sets the global tempo override. Next frontier: verify packaged persistent-profile upgrades, native backup picker, Windows media controls, and external publisher/provider freshness.

Validation for CF-183: 2026-09-28 — Bible split scroll now maps the first visible verse between panes with the existing count-aware anchor helper, preserving progress within the verse and retaining proportional fallback when no anchor exists. A Chromium test failed first at visible verses 98/100, then passes in both directions with uneven row heights; all three split smoke cases, the five-width layout case, 7 split unit tests, and 334 Web tests pass. The full Chromium run passes 322 with three BFF-gated downloads skipped in-suite (all three previously passed against local mocked assets); the 21-case runtime baseline passes with no overflow, duplicate assets, remaining loading panels, or errors and a maximum CLS of 0.1663 below the 0.35 gate. That maximum is the intentional desktop Home reflow into the full-width offline shelves. Lint and typecheck pass. An optional browser integration used the official KJV GYSPKG from the [Bible manifest](https://raw.githubusercontent.com/ThenGB/GYSApp-Data/main/latest/bibles-manifest.json): its 1,935,399-byte payload matches SHA-256 `9c2e7e76794c764ae5871aa2b0e196cb72453fb64797b2fab703d9da97f74838`; decoded SQLite has 66 books and 31,103 verses. The 1/1 E2E installs the actual package, reads Genesis 1:1, verifies TB/KJV scroll anchors both ways, reloads, removes/reinstalls, reads KJV after request mocks are removed, then confirms the KJV/TB split remains readable after network loss. Protected prerequisite: preserve sync-scroll preference, divider ratio, pane layout, and the primary reader when an alternate pack fails. Next frontier: verify offline retry and packaged WebView2 split persistence.

Validation for CF-184: 2026-09-28 — fresh keyless Edge protocol smoke generated 17,568 bytes of Indonesian MP3 in 746ms. GitHub run history has no scheduled run for the new workflow; activating its daily schedule requires the workflow to reach the default branch. Protected prerequisite: no API key or secret was introduced. Next frontier: retain scheduled live CI evidence and retry after Edge protocol drift.

Validation for CF-185: 2026-09-28 — the packaged Tauri/WebView2 smoke now enables Bible split, changes the divider to 52%, then closes and restarts the app with the same temporary profile and network disabled. It verifies the actual downloaded KJV and bundled TB remain readable in both panes and that split mode, sync scrolling, and divider ratio persist. The complete smoke passes all eight distributed packages, interrupted and transient retry, update/remove/reinstall, offline Bible/PDF/SoundFont, and MIDI checks; KJV package SHA-256 matches the official manifest. The temporary localhost BFF/CSP build was used only for this run and the original production executable was restored by checksum; no deploy occurred. Next frontier: verify secondary-pack retry after installation while split remains open.

Validation for CF-186: 2026-09-28 — offline retry for a mounted secondary Bible pane now survives an unavailable lazy SQLite chunk. The shared Vite preload handler prevents cache clearing and page reload while offline, and explicit Bible package installation warms the SQL.js/WASM runtime before downloading. With the official KJV package installed from a second page, Chromium loses network access and Retry reads Genesis 1:1 in the still-mounted pane (1/1, Service Worker enabled, no SQLite JS/WASM request failures); the standard distributed-assets file passes 4/4. Protected prerequisite: preserve online stale-chunk recovery and keep the primary Bible reader and split layout mounted when an alternate package fails. Next frontier: verify first KJV read after packaged offline restart before any online read.

Validation for CF-187: 2026-09-28 — the packaged Tauri smoke now installs and updates the official KJV, warms its SQLite JS/WASM runtime, and deliberately performs no KJV read before graceful app exit. After restarting with the same WebView2 profile and network disabled, it opens Bible in persisted split mode and reads KJV Genesis 1:1 beside bundled TB; the runtime JS/WASM entries were confirmed in the Service Worker shell cache before exit. The complete eight-asset retry/update/offline/reinstall and MIDI smoke passes. Protected prerequisite: leave the production executable restored by checksum and keep SQL.js available under the existing CSP without JavaScript `unsafe-eval`. Next frontier: rerun first-offline-read coverage after SQL.js, Service Worker, or WebView2 runtime changes.

Validation for CF-188: 2026-09-28 — packaged Tauri/WebView2 Edge smoke passes with `EDGE_TTS_URL` unset: Web Speech selects local Microsoft Andika, while Edge Neural `id-ID-GadisNeural` returns and plays 33,984 audio bytes; pause/resume/stop and repeat requests pass. After graceful same-profile restart, the official Faith PDF restores page 2 of 26 through the localhost BFF test route; two full upstream MIDI tracks auto-advance at 220 BPM, then 120 short MIDI transitions retain 747,792 renderer-heap bytes after GC. The harness now closes the restored Faith notes dialog before opening its PDF. The run used a temporary localhost BFF/CSP build; the production executable was restored and SHA-256 verified as `EE87CFCC269702F73518A33E9A1ED7D29915B84BB6C0D2BA090EB3C400C8F560`. Protected prerequisite: retain production CSP and executable without the local test origin; the live Worker still needs its S3 allowlist updated before this exact PDF flow is proven through the deployed route. Next frontier: signed installer/upgrade, native picker, OS media controls, and provider-side PDF CORS remain open.

Validation for CF-189: 2026-09-28 — focused `settings-data-integrity.spec.ts --grep backup --workers=1` passes 5/5: encrypted backup export/round-trip, portable-only restore, password-free legacy import, and malformed-input preservation. Packaged Tauri visibly exposes Backup & import with Export and Choose File controls. Native picker inspection remains unverified: after invoking “Pilih file”, Computer Use returned “foreground window did not report a process id”; its window refresh then found stale ID 3016640 while current GYSApp ID was 198338. No file was selected or imported. Protected prerequisite: keep invalid imports from changing existing data and do not count browser filechooser coverage as native-picker proof. Next frontier: retry the packaged picker and cross-version restore with a stable native window bridge.
Validation for CF-190: 2026-09-28 — baseline Tauri at db53050 and the current worktree executable shared an isolated WebView2 user-data folder and http://tauri.localhost origin. Baseline saved locale=en/theme=dark and density=compact/font=sans, then closed gracefully. Current Tauri restored identical raw values and rendered dark theme plus compact density. The current executable checksum remains EE87CFCC269702F73518A33E9A1ED7D29915B84BB6C0D2BA090EB3C400C8F560. Protected prerequisite: keep this proof scoped to the temporary profile; it does not prove signed installer/updater migration or native file-picker behavior. Next frontier: signed installation/upgrade and native picker.
Validation for CF-191: 2026-09-28 — current packaged Tauri launched with a newly created empty WebView2 user-data directory and rendered Home at http://tauri.localhost with default locale=id, theme=light and density=standard; no continuity marker was present. The preceding baseline-to-current same-profile step also passed. Protected prerequisite: keep the cold-start profile isolated; this proves packaged first paint, not offline remote-feed freshness. Next frontier: signed installer, native picker and OS media controls.
Validation for CF-192: 2026-09-28 — checked upstream `gyschordweb/docs/js/viewer-core.js` at `e8e7efe1189b5746a2bb542348e221844091c8d1`; new songs reset to `_getSongTargetTranspose(song)` and the PDF tempo, while manual transpose is scoped to the active track. Direct Kidung and queue loads now use the resolved PDF/natural-chord defaults, and late extraction respects manual changes; persisted manual BPM intentionally remains global. Web unit tests pass 338/338, Web typecheck and production build pass. Computer Use inspected the local Kidung reader at 1280×720; no MIDI playback claim because SoundFont was not installed in that browser profile. Next frontier: native signed upgrade, picker, and Windows media transport.

Validation for CF-193: 2026-09-28 — browser E2E downloads a valid bundled Literature PDF fixture, warms the PDF reader, disables network and reloads; “Buka offline” reads the verified cached bytes and the PDF request count stays at one. Asset-store regression seeds invalid cached HTML, rejects a repeated invalid response without storing it, then accepts and stores a valid PDF retry. Computer Use at 1280×720 confirms the local catalog shows 300 titles and the live Kitab Markus PDF renders page 1/324; this is online-reader evidence only. Live Worker count/source freshness remains open (287 returned vs 300 bundled).

Validation for CF-194: 2026-09-28 — the 533-song source-pinned differential compares result IDs for empty query, canonical/padded numbers, full titles, each full verse, title-plus-lyric AND queries, and every collection against `filterPujianList()` semantics at `gyschordweb@e8e7efe1189b5746a2bb542348e221844091c8d1`. The focused Vitest passes 1/1 in 4.04s; the localized browser flow passes 1/1 and finds the same hymn with `setianya berubah` in Indonesian, English and Chinese. Search extension behavior (quoted phrase and accent folding) remains intentional.

Validation for CF-195: 2026-09-28 — the regression test confirmed that reapplying the active PDF-derived tempo or transpose had been terminating an in-flight FluidSynth worker; unchanged settings now return before cancelling the render. The rebuilt isolated Tauri/WebView2 smoke passes with `EDGE_TTS_URL` unset: Edge Neural receives and plays 33,984 bytes with `id-ID-GadisNeural`, local Microsoft Andika works, 17 shell and 39 content requests are blocked during offline checks, and Bible broad search returns 40→80 results in 441ms (1,500ms budget). Verified PDF/MIDI/SoundFont cache playback and repair pass; two full upstream MIDI tracks auto-advance at 220 BPM, 120 transitions retain a net -3,650,981 renderer-heap bytes after GC, and speech/MIDI route preferences restore after graceful restart. Reopening hymn-001 correctly reapplies canonical transpose 0 after the manual -2 value was restored from storage. Faith PDF page progress is skipped without a BFF base. Protected prerequisite: keep packaged smoke profiles isolated and do not replace the running primary app. Next frontier: signed installer/upgrade, native picker, Windows media panel, and provider-side PDF CORS.

Validation for CF-196: 2026-09-28 — the Bible search 390×844 visual test now waits for `document.fonts.ready` and three animation frames after focusing search instead of relying on a fixed 250 ms delay; the focused Playwright case passes 5/5 after this test-only stabilization. The preceding full Playwright run exited 0 with 322 passed, three BFF-gated skips, and one Bible screenshot that passed on retry. No visual snapshot was changed. Protected prerequisite: preserve reviewed visual baselines and the existing dirty worktree. Next frontier: close the documented external installer, native picker, Windows media-panel, and provider CORS boundaries when their required environments are available.
Validation for CF-197: 2026-09-28 — focused Bible search visual tests pass 15/15 across five repetitions per case. The final full Playwright run passes 323 tests and skips three cases gated on the local BFF configuration, with no failures (8.5 minutes). Reviewed and refreshed the two Bible search snapshots and the desktop filter snapshot: browser locator scrolling accounts for a 7 px desktop origin change before focus, while the 390×844 page has a stable 7 px top offset missing from the prior baseline. Test screenshot capture waits for fonts and render frames and starts from scrollY 0. Protected prerequisite: preserve the reviewed snapshots and unrelated dirty worktree changes. Next frontier: verify the signed installer/updater, OS picker/media controls, live Literature Worker freshness, and provider PDF CORS when those environments are available.

- `2026-09-30 / CF-198`: share bundled TB loading across reader, split
  reader and global search; construct the main-thread search fallback on demand;
  lazy-load Home, Bible header controls and the active media dock;
  select shell audio state;
  extract device reset from More;
  count transitive static bundle imports; preserve downloaded asset caches on
  stale-chunk recovery; provide offline local verification, watch/UI/debug
  commands and a cached packaged-native build. Continue the approved UI,
  loading and parity roadmap in
  `docs/plans/2026-09-30-loading-debug-efficiency.md`.

Validation for CF-198: initial GitHub connector implementation at `d9faa61` passes CI build/typecheck, 350 web unit tests, script/policy checks, formatting/docs/provenance, bundle/native-asset checks, Rust tests/clippy and 323 browser tests (three BFF-gated skips). The packaged Windows/WebView2 smoke also passes at that SHA: fresh-profile offline shell, verified offline PDF/MIDI/SoundFont, native cache corruption repair, 120 media transitions and preference restart. See PR #9 and its CI runs. Physical-device, signed-upgrade and live-provider parity gates remain open.

- `2026-09-30 / CF-199`: restore local verification after the executor becomes
  available; add explicit Vite/HMR browser iteration with production/CI guards;
  bound the development image proxy's fallback chain to three seconds; keep
  Bible typography persistence outside React's replayable state updaters;
  measure greeting readiness in the browser separately from host test polling;
  preserve literal regex/space arguments in test runners on Windows/Unix;
  align README and architecture with the implemented local/PR/release gates.

Validation for CF-199: local production build/typecheck, 352 web unit tests and workspace/script suites pass. Focused dev browser tests pass 3/3, including two font clicks adding exactly two steps with persistence after reload; the original dev run exposed a three-step StrictMode regression and stalled lazy navigation behind remote image requests. A 30-navigation production-preview sample records greeting-ready median 402.2ms and p95 496.5ms using a browser animation-frame marker; this includes a first navigation in the same browser profile and does not establish cold-process/native/device startup. Visual inspection of Home/Bible at 390px and Kidung at 1440px confirms one page heading and no horizontal overflow. Final PR CI is required for the additional changes; external parity gates remain open.

- `2026-09-30 / CF-200`: stabilize the Faith PDF keyboard contract by waiting
  for the fixture's explicit error/retry state before checking its first/last
  focus boundaries. Loading asynchronously adds a new focusable Retry button.
  Keep initial close focus, exact Tab/Shift+Tab wrap, Escape, opener restoration,
  official links, touch targets and locale/viewport geometry assertions.

Validation for CF-200: final-head CI at `0af3576` passes build/typecheck, 352 web unit tests, script/policy suites, bundle/provenance/native-asset verification, Rust tests/clippy and packaged-native smoke; browser shard 1 passes, while shard 2 exposes the asynchronous focus-list race in the Faith PDF fixture. The original focused case passes 3/3 locally; the readiness correction passes 10/10 repeats across three browser workers with retries disabled before the next complete CI run. No visual baseline or focus timeout was relaxed.
