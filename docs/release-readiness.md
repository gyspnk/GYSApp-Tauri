# Release readiness ledger

Reviewed **2026-10-08**. This ledger records measured outcomes, not a blanket
GA declaration. The current implementation is documented in the
[documentation index](README.md); older receipts below describe their dated
revisions and retain their original timings, failures and follow-up decisions.

## Current evidence

### 2026-10-08 — stationary PDF chrome, isolated scroll and article reader

- Reproduced the zoom HUD leaving the viewport during PDF gesture zoom, window
  scroll leaking across history navigation, and reading progress falling from
  100% to 20% when revisiting earlier content. Regression contracts now pass.
- PDF feedback mounts outside the scrollport. The shell owns scroll reset for
  pathname changes and manual history restoration. Literature articles open at
  `/literatur/:itemId/read`; article readers share a sticky progress strip and
  last/furthest/start choices. Resource-compatible progress and completion are
  monotonic, while the last bookmark continues to move in either direction.
- **50 focused production browser cases pass without retries**, including
  mobile/desktop gesture zoom, high-density detail, dark article contrast,
  history scroll, overlays and reader motion. The expanded resume regression
  then passes with leaving/reentering, furthest resume and return to start;
  **six final regression/legacy smoke cases pass without retries**. Three Home
  screenshots are refreshed after adding internal hover padding. Type checks,
  complete deterministic tests and the initial bundle budget pass.
- Android ARM64 debug-signed APK and Windows x64 installer packaging are
  explicitly requested for this delivery. Both manual workflows can attach
  hashes and exact checked-out commit provenance to a draft preview release.
  Hosted CI, package builds and publication remain pending at this receipt;
  signing/store/device acceptance is not claimed by preview builds.

### 2026-10-08 — hosted pass and native search timing

- Delivered `83c24e3` passes Pages and all three hosted browser shards:
  **697 passes, three existing optional-package skips and no retries**, in
  **8.6 / 8.9 / 7.7 minutes**
  ([CI run 37708661624](https://github.com/gyspnk/GYSApp-Tauri/actions/runs/37708661624)).
  The reviewed Sauh Home/article layouts at 390/768/1440 px retain full-column
  quotes, 14 px Home image corners, no overflow and no runtime errors.
- Windows passes short startup/storage/media/asset suites and all **30 process
  relaunches**. Its first-search median/p95 are **365.3 / 447.8 ms**, and indexed
  searches **29.8 / 31.1 ms**. The subsequent soak stops at the broad-search guard:
  its old 1,702 ms sample includes controller click/actionability and CDP polling.
  The guard now uses the same existing submission/rendered-frame marks as the
  process benchmark, with its **1,500 ms bound unchanged**. Controller wall time
  remains separately reported as `bibleSearchAutomationMs`; 40/80-row and first
  verse assertions remain intact. No application source changes are included.
- The exact harness block is exercised in Chromium: a 1,700 ms controller delay
  fails the previous wall-clock guard at 2,031 ms; the revised guard measures
  232.9 ms with 2,040 ms controller time. Delaying the actual search worker still
  fails at 1,905.4 ms. Full hosted/native proof for this follow-up remains pending.

### 2026-10-08 — native restart pass and PDF progress feedback

- Delivered `a8a4bfe` passes Pages and the complete packaged Windows workflow
  ([native run 37614375367](https://github.com/gyspnk/GYSApp-Tauri/actions/runs/37614375367)).
  It verifies offline Home recovery, Bible search in **1,060 ms**, live Edge
  playback/stop/repeat, FluidSynth controls and cache corruption repair, two
  full upstream tracks, **120 queue transitions**, **1,210,266 retained heap
  bytes** and saved shell/reader/audio preferences after graceful restart.
  Runner local-voice playback and BFF-dependent Faith PDF progress retain their
  existing configuration-dependent skips.
- Hosted browser CI exposed a PDF progress feedback race under load: the parent
  sends updated progress back as `initialPage`, and the reader restores stale
  saved pages on each update. Restoration now runs only on a document progress
  key change. Vertical pages also stretch their grid column before decoding;
  inherited flex centering previously resized placeholders from 300/820 px to
  the full reading width and displaced the saved page after reload.
  IntersectionObserver still bounds decoded pages and releases offscreen
  bitmaps. Under load it can deliver an enter and exit in one batch; checking
  any historical entry retained offscreen canvases. The latest entry now wins.
  The regression injects the queued enter/exit case for page 2 and verifies
  both initial pages release their bitmaps, stable labels across consecutive
  frames and restored progress after reload, at fourfold CPU throttling and
  with the original five-bitmap bound. It fails against the previous observer
  and passes **3/3 in 18.6 seconds** after the fix, without retries. Bitmap/CSS
  virtualization is retained. All **59 PDF/reader cases pass in 1.9 minutes**
  without retries, including Faith, Literature, Kidung, sharp zoom, mouse/touch
  panning, reduced motion and offline recovery. Initial JS remains **175.6 KiB**
  against its 180 KiB budget.
- The unrelated navigation audit now fulfills the Google SDK request with an
  inert script. Google's live button iframe rejects the CI localhost OAuth
  origin with HTTP 403; dedicated provider contracts still cover the Google
  flow, and strict navigation console/error assertions remain intact.
  Final hosted results for this follow-up remain to be verified.

### 2026-10-07 — complete MIDI soak and native shell selectors

- Delivered `fc8405a` passes Pages and every CI job: **697 browser passes,
  three existing optional-package skips and no retries**, with the same
  700-case inventory. Shards finish in **8.7 / 8.9 / 7.7 minutes**.
- Windows now passes live Edge speech, FluidSynth cancellation and all musical
  controls, maximum-tempo playback, the two full upstream tracks, **120 further
  queue transitions** and the original **16 MiB retained-heap bound**. The
  preferences and Faith note save assertions also pass. It then stops before
  graceful restart because the harness still looks for header language/theme
  selectors as buttons. Both controls now expose the combobox role. All four
  localized selectors before/after restart are corrected; the browser follows
  EN/dark, reload and ID/light through the same controls successfully. Runtime
  source and native assertions are unchanged. Hosted restart proof remains
  required for this follow-up.

### 2026-10-07 — hosted browser pass and keyboard tempo access

- Delivered `84c8eda` passes Pages and every CI job. The complete **700-case**
  browser inventory reports **697 passes, three existing optional-package
  skips and no retries**; shards finish in **9.0 / 9.3 / 7.6 minutes**. Sauh's
  responsive highlight sizing and four rounded image corners remain verified.
- Packaged Windows passes its offline startup/storage/media/assets suites and
  **30 process relaunches**, then verifies live Edge pause/stop/repeat and real
  FluidSynth render cancellation, volume, transpose, instrument and relative
  tempo edits. The later maximum-tempo step fails because clicking Play closes
  advanced controls and the harness sends End to an inert range. This is
  reproduced in Chromium: tempo remains 77 instead of 220. The shared helper
  now reopens advanced controls, preserves an already open tempo popover and
  waits for actual focus before keyboard edits, including restart preferences.
  The same real MIDI cache/replay contract passes **3/3 in 15.1 seconds**, with
  retries disabled and no runtime changes.
  Complete hosted/native results remain to be verified for this follow-up.

### 2026-10-07 — neutral visual state and native Stop readiness

- Hosted `ec7722e` passed Pages, build, deterministic/Rust/secret gates and two
  browser shards. Those shards reported 463 clean passes, one warm-navigation
  pass on retry and three existing optional-package skips. Shard 3 passed 232
  cases and failed only the settings screenshot: 121 pixels showed the cursor's
  incidental hover after content moved beneath it. Geometry and glyphs match.
  The fixture now moves the cursor away and captures the neutral state. The
  inspected single baseline is refreshed; all **31 visual cases pass in
  59.9 seconds**, without retries or further updates.
- Windows reached the full soak after its quick suites and 30 relaunches, then
  the Stop helper mistook a not-yet-mounted speech control for MIDI's hidden
  control. It now waits for the surface, restores minimized players and opens
  advanced controls only for MIDI. Real speech/MIDI Stop, focus and cache
  contracts pass **12/12 in 22.9 seconds**, without retries. No runtime source
  changes are included in this follow-up; complete hosted/native results remain
  to be verified on the delivered revision.

### 2026-10-07 — native focus and bounded PDF preloading follow-up

- Hosted `312cc45` passed Pages and all CI jobs. Full browser CI reports **693
  clean passes, three passes on retry and three existing optional-package
  skips**. Three shards finish in **8.9 / 6.5 / 7.5 minutes**, reducing the
  longest browser stage from 13.6 minutes without removing coverage. Retries
  were a warm-navigation timing check, an in-progress button release scale and
  a six-bitmap continuous PDF window.
- Windows passed the earlier recovery/upgrade/PDF checks and cancellation of
  an active FluidSynth render, then its immediate volume focus/key assertion
  ran before the entering disclosure became focusable. Disclosure inert state
  now follows click default action without waiting for queued native toggle.
  The new delayed-toggle regression failed against the old build. Native range
  helpers wait for actual focus, and assertions wait for the committed value.
- Continuous PDF preloading now uses half the current viewer's dimensions and
  adapts on resize, instead of a fixed 720 px margin. Offscreen bitmap bounds
  and all five compact toolbar widths pass three repetitions. Size assertions
  wait for release motion to settle while retaining their original 44 px gate.
  Three real FluidSynth cache/Stop/focus repetitions also pass. The native and
  complete hosted follow-up remains required for this revision. The full menu
  motion suite passes **16/16 in 56.5 seconds**, without retries; the delayed
  toggle case passes four additional repetitions. Build/types and the initial
  JS budget (**175.6 / 180 KiB**) pass.

### 2026-10-07 — compact native transport fixture follow-up

- Delivered `24ad29e`; Pages and all CI jobs passed. The complete browser suite
  reports **695 clean passes, one pass on retry and three existing optional
  package skips**. MIDI and speech pause regressions pass without retry. The
  remaining retry was initial PDF paint taking longer than the generic
  five-second UI assertion. Only asynchronous initial PDF readiness now uses
  a 15-second budget; zoom/geometry and performance gates remain unchanged.
  Three shards distribute the same **699 cases**, retaining three workers and
  the existing 15-minute job limit, to shorten hosted wall time. Inventory
  checks confirm **233/233/233 cases**; the shared PDF contracts pass **20/20
  in 55.5 seconds**, with three workers, no retries or snapshot updates. Windows
  passed quick suites, 30 relaunches, Home recovery,
  corrupt-chord repair, verified offline reuse, one-fetch legacy offline
  revalidation/upgrade and PDF fallback/corrupt-cache repair. It then tried to
  click the MIDI Stop button inside a closed advanced disclosure.
- The native fixture now follows the visible disclosure path and restores its
  previous state afterward. For the render-cancellation contract it opens the
  menu before Play, preserving the assertion that Stop terminates active work.
  The same helper exercises real browser FluidSynth playback/cache: **3/3 in
  9.1 seconds**, with three workers and no retries. Stopping resets position,
  preserves rendered buffers and returns the menu to its closed state. The
  remaining complete Windows media soak still requires a follow-up run.

### 2026-10-07 — delayed MIDI metadata and offline refresh follow-up

- Hosted `e2ac956` passed Pages, build, deterministic verification, Rust and
  secret checks. Browser shard 2 passed 348 cases, including the repaired visual
  and PDF contracts, and failed one Suara fixture due to an unmocked literature
  preload. Shard 1 passed 345 cases with three existing optional-package skips,
  one MIDI failure and one speech pause pass on retry; its 15-minute job budget
  expired at completion. The Suara fixture now supplies that background feed.
- The MIDI trace exposed a production race: simultaneous delayed PDF tempo and
  transpose updates could cancel the first playback restart while seeing its
  temporary paused state. Play now publishes loading intent before resuming
  AudioContext. A regression failed with `paused` before the fix and passes
  afterward; all **29 player/queue units** pass. The speech test fixture now
  pauses its timer rather than advancing utterances while supposedly paused.
  Four repetitions of the affected MIDI/sidebar browser cases pass **16/16
  in 30.8 seconds**, with three workers and no retries. Build and type checks
  pass; the initial JS graph remains within budget at **175.6 / 180 KiB**.
- Windows passed build, quick suites, 30 process relaunches, Home recovery,
  one-fetch corrupt-chord repair and zero-fetch verified offline reuse. Its
  legacy-offline phase found two sequential refresh attempts instead of one.
  Failed automatic refreshes now back off for 60 seconds per immutable source;
  explicit retry and source changes remain immediate. Two regression units
  failed before the fix; all **10 repository units**, **17 browser cache units**
  and the startup cache browser contract pass afterward. Suara passes **6/6
  in 16.8 seconds**, without retries. The complete hosted/native follow-up is
  still required; these local results do not claim the failed run is green.

### 2026-10-07 — font, PDF and reload resilience follow-up

- Hosted `89a8330` passed Pages, build, unit/type/provenance, Rust and secret
  checks. Its full browser suite reported 688 clean passes, two passes on retry,
  four failures and three existing optional-package skips. LCD normalization
  removed seven of the nine earlier visual failures. The remaining reader
  controls revealed missing U+2212 in the bundled font: their minus sign used
  different system fonts and shifted neighboring labels. Regenerated pinned
  fonts include that glyph; a Chromium platform-font check proves custom-font
  rendering. The one-pixel Bible chevron difference has a narrowly scoped
  one-pixel allowance; other strict visual thresholds remain unchanged.
- The lazy-route failure fixture now exercises recovery after the single
  automatic chunk reload is exhausted and checks the current Faith list. PDF
  zoom limits each delayed-frame step, and continuous readers recheck the active
  page when a placeholder receives its rendered dimensions. Repeated wheel,
  pinch, pan, page-memory/scroll, route-retry and font/offline contracts pass.
- Windows passed build, quick suites and the 30-process benchmark, then its
  Home fixture disappeared across a document reload. The fixture now persists
  counters and recovery availability until explicit cleanup, restores fetch
  afterward and tolerates a document temporarily missing its probe. Both Home
  resilience and forced-reload contracts pass three repetitions: **6/6 in
  13.1 seconds**, without retries.
- The first real MIDI play lazily prepares WASM/PCM. Its single cold-play
  assertion now uses the existing 15-second render budget, with pinned metadata
  and loading-state checks, while retaining the 35-second whole-test limit.
  Five repetitions pass **5/5 in 21.2 seconds**, without retries. Native cache
  recovery/upgrade proof still requires the next complete Windows run.
- Build and generated font/license integrity pass. The initial JS graph remains
  **175.4 / 180 KiB**; the native boundary remains **25 files**, now
  **38,622,842 bytes**, including regenerated fonts from the current corpus.
  The corrected reader-controls baseline was inspected; the full visual suite
  passes **31/31 in 59.1 seconds**, without retries or further snapshot updates.

### 2026-10-07 — hosted CI follow-up after delivery

- Delivered `826af28` to `main`. Pages, build, deterministic verification,
  Rust and secret checks passed on GitHub; browser shard 1 passed. Shard 2
  failed nine strict screenshots with 18–340 differing pixels and reported two
  animation cases passing only on retry. Inspected actual/diff crops show LCD
  glyph rasterization differences, rather than geometry changes. Chromium now
  disables LCD text rendering; no visual threshold or baseline was relaxed.
- Chord motion checks now pause the actual spacing transition at its midpoint
  in both directions. Repetition also reproduced a real theme bug: pending
  focus scroll could finish while the deferred transition module loaded. Theme
  selection now freezes scroll immediately, with a delayed-module regression
  that failed against the previous production build.
- The packaged Windows workflow passed startup/storage/media/assets, its
  30-process benchmark and the earlier Stop assertion, then failed the chord
  corruption fixture's fetch count. Its live manifest used `6410749`, while
  fixture bytes came from pinned `e8e7efe`; the newer source bypassed the seeded
  corrupt blob. The cache test now pins that manifest, waits for loading to
  finish and restores manifest/cache state. Byte/hash, one-fetch recovery,
  zero-fetch offline reuse and legacy upgrade assertions remain intact.
- Domain sync and browser chord/cache units pass **25/25** locally. The final
  production visual/reader/theme suite passes **41/41 in 1.4 minutes**, without
  retries or snapshot updates. Five repetitions of each corrected motion case
  pass **10/10 in 28.8 seconds**, with three workers. Build, types, docs, native
  boundary and the unchanged **175.4 / 180 KiB** initial JS budget pass. Windows
  native execution and hosted browser results require the follow-up workflow;
  these diagnostics do not claim that the failed delivered run is green.

### 2026-10-07 — CI repair and production verification (local)

- The latest hosted main CI at `40e3b32` failed browser contracts and timed out
  one shard; its build, unit, Rust and secret checks passed. Pages and Worker
  deployments at the same commit passed. The latest failed native Edge run was
  older, at `e2bad98`, and waited for a network abort after synthesis could
  already have completed. These are hosted diagnoses, not new hosted results.
- `pnpm verify:prepush` passes **552 Vitest + 59 Node policy/script tests**,
  types, formatting and generated/documentation gates. The production build,
  native asset boundary (**25 files / 38,620,770 bytes**) and initial JS budget
  (**175.4 / 180 KiB**) pass.
- A broad production run exercised **642 browser cases**: 595 passed, 44 failed
  and three optional package cases were skipped. All 44 failing contracts then
  passed in corrected follow-up runs, including the three renamed contracts.
  No new skip was added, and screenshot pixel thresholds remain unchanged.
  Updated controls retain geometry, hit-testing, accessibility and behavior
  checks. Fourteen affected zoom, chord, MIDI, preload and responsive cases
  pass in **46.2 seconds**, with three workers and no retry.
- **56 existing visual PNGs** were refreshed and inspected across phone,
  tablet, desktop, reader/menu and theme states. The complete two-file visual
  suite then passed **57/57 in 59.0 seconds**, without updates or retries. These
  runs collectively cover the 697-case browser inventory; they are not a new
  single uninterrupted full-suite pass.
- The native harness now checks current-request Stop evidence, rendered chord
  markers/cache integrity and the current compact selectors. Its syntax and
  the four pure Stop regressions pass locally. Packaged Windows execution is
  unavailable in this Linux workspace; GitHub/Windows outcomes require a new
  hosted run after delivery. These checks were recorded before the delivery
  commit; hosted outcomes are recorded by Actions.

### 2026-10-07 — Sauh Home geometry confirmed before delivery

- At 390, 768 and 1440 px, the Home quotation matches its content column's left
  edge and width within 1 px. The image frame clips all four corners at 14 px,
  fills the available column, and stays between 170 and 260 px high in the
  sampled layouts. There is no horizontal overflow or browser exception.
- Six Home/article geometry checks and three thumbnail decode contracts pass.
  The decode contracts pass **3/3 in 6.1 seconds**, without retries or skips;
  loading and decoded frames retain the same position and dimensions. Combined
  screenshots use the verified official packaged reflection and image fixture.
- Manual authorization now includes committing and pushing the reviewed CI,
  account/navigation and Sauh refinements to `main`. Hosted outcomes remain
  separate from these local checks.

### 2026-10-07 — inline Google and navigation follow-up (local)

- Google's own dynamic GIS control now renders in the account row, with icon
  mode for compact widths, locale-aware loading, bounded retry and unmount-safe
  callbacks. The duplicate application dialog, portal fallback and unused
  modal styles/translations are removed. SDK box sizing is isolated from the
  app reset so its compact logo remains visible.
- Route listeners survive router callback changes. Links, global search,
  history and browsers without snapshots share one incoming fade; the legacy
  entrance is suppressed. History/programmatic changes invalidate earlier
  route preloads, and deferred snapshot callbacks cannot overwrite a newer
  destination. The cold-link/Back regression was reproduced before the fix.
- The final production browser gate passes **35/35 in 48.4 seconds**, with
  two workers, no retry and no skip. All **552 Vitest tests** (431 web) and
  **55 Node policy/script tests** pass. Build, types, formatting, documentation,
  generated provenance and native asset-boundary checks pass. Initial JS is
  **175.4 KiB / 180 KiB**, including bootstrap.
- Inspected real-SDK screenshots at 390/768/1440 px show aligned controls,
  visible Google logos, no document/control overflow and no page exception.
  The official client rejects localhost authorization with an origin error;
  real account acceptance is not claimed. Automated exchanges use provider
  fixtures. These changes remain local pending manual delivery authorization.

The following receipt describes the earlier committed reader/player slice.

### 2026-10-07 — reader, authentication, persistent MIDI and complete documentation

- Production build, workspace typecheck/lint and all deterministic unit/policy/
  script gates pass. Vitest reports **549 tests**: contracts 20, domain 36,
  testkit 2, BFF 63 and web 428 across 104 files. Node policy/script checks add
  **55 passes**, with no failure or skip.
- The final production browser gate passes **79/79** in **2.3 minutes**, with
  two workers, retries disabled and no skipped case. It covers the numeric
  Bible picker, v1 account behavior, literature loading, shared PDF zoom/pan,
  menu exit motion, route transitions and responsive UI/media persistence.
  Separate player-focused receipts include full musical controls, edge tab
  restore/drag, 36/40 px targets and reduced-motion/Axe checks. This is local
  Chromium evidence; account authorization responses are mocked.
- Generated provenance passes: **1,229 music entries**, **533 hymns**, eleven
  offline core projections and **299/300 official literature covers**. The
  remaining publisher item has no official cover and uses its designed fallback.
  Editorial font licenses/integrity also pass. The canonical source is
  `e8e7efe1189b5746a2bb542348e221844091c8d1` with 161 chord files.
- Native asset-boundary verification passes: **25 files / 38,620,770 bytes**
  of offline/core runtime assets. This checks the generated distribution;
  it is not a new native execution or signed-installer receipt.
- The initial JS gzip graph is **178.5 KiB / 180 KiB**, across 21 modules plus
  `startup.js`. Startup bytes participate in build integrity and the budget;
  PDF.js, synth/WASM and Bible search remain lazy. `pnpm audit --prod` reports
  no known vulnerabilities at the time of this check.
- The current docs cover all app modes, the numeric picker draft semantics,
  complete compact MIDI/edge behavior, PDF transport/fit/sharp zoom/pan, real
  source-key mapping, cache/preload/reset owners and capacities, provider
  endpoints, UI/motion/focus, environment bindings and delivery diagnostics.
  Dated plans/audits are explicitly historical; ADR reviews and CF-212 track
  the current implementation without rewriting older measurements.

The public literature proxy accepts official S3 publication URLs and preserves
Range headers. Actual public Pelita Kecil 46, Warta Sejati 4, Allah Menguji
Abraham and Markus PDFs rendered against the local Worker handler during the
implementation audit. Hosted operation still depends on deployment of this
Worker; the localhost result does not prove the hosted API has updated.

### Acceptance still requiring independent evidence

- Real WhatsApp message tracking, Google/Apple account acceptance and native
  provider/keyring behavior on the deployed origins with configured credentials.
- Current hosted Pages/Worker workflow results and live source availability.
  Pushing source triggers workflows; it does not establish their outcome.
- Signed installation/upgrade, physical-device input/audio, the cross-platform
  voice/media matrix and canonical-versus-rewrite MIDI performance release gate.
- The complete current browser matrix and refreshed visual baselines where
  required for a GA release. The focused 79-case gate is not described as the
  full suite or a new physical/native audit.

## Historical evidence

The following milestone description and receipts describe previous revisions.
In particular, old dirty-tree, formatter, no-push and pending-work statements
refer to their recorded dates; current local outcomes are listed above.

The rewrite is intentionally milestone-driven:

- **Preview:** typed contracts, domain ports, BFF boundary, Quiet Sanctuary
  shell, offline TB/KR/lyrics/faith pack, reader and hymn browser, and
  Windows Tauri compile check.
- **Beta:** chord cache/SWR, MIDI parity, PDF reader, Bible reader/search, TTS
  provider fallback, real audio backends, pericopes, and platform contract
  suites with attached evidence.
- **GA:** parity matrix critical rows are `PARITY`, canonical-vs-rewrite MIDI
  median/p95 gate is met, accessibility/performance/security reports are
  attached, and protected OAuth/signing/store prerequisites are available.

The current branch is a Preview/Beta delivery candidate: the responsive shell,
single navigation surface, route-level loading, local PDF worker split, BFF
cache validators, and bundle budget are implemented and verified. It does not
claim GA parity until the remaining reports and platform artifacts exist.

### Earlier milestone receipts

- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`,
  `pnpm verify:generated`, `pnpm verify:bundle`, and `pnpm audit --prod` pass.
- The current hardening pass validates versioned shell settings and legacy
  migration, honest `503` behavior for the unconfigured report sink, complete
  native/web reset coverage, serialized chord-cache loading, canonical chord
  source-key inference, Bible retry/empty states, and accessible names on the
  tablet navigation/report form. Reports remain local until a durable report
  sink is provisioned.
- **2026-09-22 UI audit receipt (dirty working tree):** the visual matrix now
  covers seven primary routes at phone/tablet/desktop widths plus ID/EN/ZH and
  light/dark/sepia/AMOLED states, with no containment, hierarchy, theme, or
  console findings. The runtime baseline covers 21 isolated route/device
  cases: every case had no duplicate image/PDF asset request, no page/console
  error, no visible loading panel, and no horizontal overflow; the slowest
  ready state was 1.737 s, maximum long task was 103 ms, and maximum observed
  CLS was 0.2172 under the 0.35 audit threshold. The deterministic local PDF
  check rendered a canvas with one document fetch. The selected browser gate
  passed 54 cases after one retryable focus assertion; the isolated direct-PDF
  file then passed 8/8 after its test selector was aligned with the runtime's
  visible, non-hidden focusable contract. Forced upstream abort/404 checks are
  classified as unavailable-source behavior, not upstream health claims. This
  receipt is local evidence only; it does not merge, push, or claim GA/native
  release readiness.
- **2026-09-22 CF-057 Home shelf receipt:** the measured nested-overflow finding
  was the negative inline gutter margin on the Suara and Literature shelves;
  removing only those escaping margins while retaining contained padding,
  scroll-padding, snap, and horizontal card scrolling kept the first and last
  cards reachable. The focused shelf guard passed 1/1, the combined responsive,
  visual, touch, and accessibility matrix passed 28/28, Home visual baselines
  passed 3/3, and the local preview showed no document overflow or console
  warning/error. No fetch, card data, route order, or global overflow rule
  changed.
- **2026-09-22 CF-058 Bible loading receipt:** the first-paint gap was the
  generic `.loading-panel` rendered while the offline TB pack was loading. The
  Bible now reserves reader-shaped single/split panes with localized status,
  accessible busy semantics, responsive phone stacking, and reduced-motion
  behavior; package fetch/version/retry behavior was untouched. The delayed
  pack guard passed 1/1 at 320/390/768/1024/1440px; Bible smoke, accessibility,
  and visual checks passed 12/12. Typecheck, build, and diff-check passed, and
  CUA captured clean initial and settled localhost frames with no console
  errors or horizontal overflow.
- **2026-09-22 CF-059 audit closure:** the UI audit is complete for the current
  Preview/Beta scope. Responsive visual coverage, the 21-case runtime baseline,
  intentional shelf scrollers, and the Bible first-paint transition are now
  recorded above; no measured UI defect remains that justifies speculative
  production work. The global `pnpm format:check` failure remains a
  pre-existing dirty-tree condition across 37 unrelated/concurrent files; this
  ledger does not claim that the full working tree is formatted. Remaining
  work is GA/native/provider readiness only: protected signed artifact/runtime
  evidence, the canonical-vs-rewrite MIDI performance gate, durable release
  reports, and any still-authorized live provider prerequisites. This closure
  does not claim GA, merge, push, or deployment.
- **2026-09-22 CF-060 Kidung media density receipt:** the desktop MIDI dock now
  keeps identity in one band and volume, seek, and the closed advanced summary
  in a second band at widths >=721px; the existing phone stacking and 44px
  controls remain unchanged. The new guard was intentionally red at 191px
  before the CSS-only change and passes at 1440/1024/768px with <=128px main
  height, <=2 content bands, and no internal overflow. Kidung usability passed
  37/37, media dock 5/5, responsive reader 4/4, accessibility 2/2, and no
  playback, queue, loop, fetch, or persistence code changed.
- **2026-09-22 CF-061 Kidung catalog density receipt:** the catalog-only
  navigation and search/filter header now share one top row at >=1200px through
  a semantic wrapper; <=1199px, playlist, settings, mobile filters, and
  touch targets retain their prior composition. The guard covers 1440/1241/
  1024/390/320px, aligned wide children, bounded wrapper height, >=44px
  controls, and no horizontal overflow. The rendered desktop snapshot shows
  the song list starting earlier without hiding labels or changing catalog
  data. No further Faith/Bible density slice was justified by Jev's rendered
  evidence review.
- **2026-09-22 CF-062 Kidung text-reader density receipt:** the measured
  desktop text-reader toolbar was 119px tall because its secondary controls
  occupied a separate full-width row. The CSS-only fix keeps the title/mode
  chrome and all reader controls in one compact desktop band at >=768px while
  preserving the mobile stacked layout. The new red-green guard passes at
  1440/1241/768px with <=88px toolbar height, no overlap or horizontal
  overflow, and >=44px interactive controls; the full Kidung usability suite
  passes 38/38. Reading-family passed 6/6, accessibility passed 15/15, and
  the web typecheck/build passed. The navigation suite exited green with 22
  first-attempt passes plus one retry-pass; its formerly flaky Kidung case was
  then rerun without retries and passed 1/1. Jev found no evidence for extra
  shell, Bible, Faith, or PDF patches, so no speculative loading or layout
  code was added.
- **2026-09-22 CF-063 reader-centering receipt:** the Kidung text reader now
  centers its active verse sheet and every all-verses sheet; the Bible split
  reader and its delayed loading skeleton now reserve the 12px divider
  symmetrically, keeping desktop panes equal without changing content or PDF
  sources. The red guards reproduced the former 192px Kidung offset and 12px
  Bible imbalance before the CSS fixes. Kidung usability passed 39/39,
  responsive layout 9/9, navigation 23/23, direct reading 8/8, visual
  reading 26/26, and the focused delayed-loading guard 1/1 with retries
  disabled. This remains local dirty-tree evidence and does not claim merge,
  push, deployment, or GA readiness.
- **2026-09-22 CF-064 chord-variant receipt:** canonical note-aligned PDF rows
  now carry their numbered lyric variants into the text reader, so `Semua`
  renders four chord layers in each of the three `hymn-001` verses. The
  focused chord-layout unit tests passed 14/14, the new 390x844 Playwright
  guard passed, and the existing centering guard passed across desktop,
  wide-tablet, and tablet widths. The source remains canonical; no fallback
  chord content or runtime PDF request was added.
- **2026-09-24 CF-065 exact-source parity and Edge TTS receipt:** the catalog
  now retains 533 hymns, six lettered variants, locked chord references, and
  every MIDI/PDF path; the Kidung list exposes only verified asset metadata
  and preserves title-only accessible names. The exact-source chord audit
  mapped 3,655 positions with no orphan or invalid rows. Direct keyless Edge
  speech played in the Windows Tauri development app, and the live protocol
  smoke returned 17,568 audio bytes in 666 ms. Unit tests passed 301/301;
  typecheck, lint, build, format, docs, generated provenance, bundle, native
  assets, Rust fmt/check/clippy, and six Rust tests passed. The complete web
  Playwright suite passed 271 with one optional KJV network-download case
  skipped; `pnpm audit --prod` found no known vulnerabilities. The
  signed/packaged Tauri runtime and remaining partial rows in the parity matrix
  remain open; this local receipt does not claim GA, commit, push, or
  deployment.
- **2026-09-24 CF-066 More settings hierarchy receipt:** More now presents seven
  localized disclosure categories and keeps technical details hidden until
  requested. The offline deep link aligns the “Data Offline” row below the
  fixed top bar; audio links to Bible speech controls, and help opens its form.
  Backup and reminder/queue flows remain usable within their categories. The
  full web Playwright suite passed 273 with the optional KJV network-download
  case skipped; three viewport baselines were reviewed and refreshed. Broader
  source/runtime parity and packaged Tauri checks remain open.
- **2026-09-24 CF-068 Kidung chord spacing receipt:** the shared text renderer
  now leaves 1.65em above lyrics under chord markers, up from 1.35em. A focused
  Playwright geometry check measures a 10.6px gap at 390px and 1440px widths;
  both rendered screenshots were reviewed. Saved reader font and line-spacing
  preferences are unaffected. Remaining Kidung reader interactions and
  packaged-runtime checks stay open.
- **2026-09-24 CF-069 Bible discoverability receipt:** the reader opens verse
  search from its header action, focuses the search field, keeps search filters
  collapsed, and opens Notes from the More drawer. The audio settings deep link
  opens the existing speech controls. The four focused Bible search, notes,
  and annotation browser checks pass; the saved annotation model and complete
  split/version/text-scale matrix remain open.
- **2026-09-24 CF-070 Kidung text-reader hierarchy receipt:** the persistent
  toolbar keeps Play and chord visibility together; More groups fullscreen,
  favorite, queue, verse scope, auto-scroll, and reader settings. If the
  optional SoundFont is absent, Play opens the SoundFont asset section without
  starting a download. Installed playback remains direct. The focused Kidung
  reader checks pass 8/8, and phone/tablet/desktop reader and More screenshots
  pass 6/6 after review. Full PDF, MIDI-session, and packaged-runtime checks
  remain open.
- **2026-09-24 CF-071 packaged media and shell receipt:** an isolated Tauri
  test profile downloaded the 30.8 MiB GeneralUser-GS package through the local
  BFF, passed the manifest integrity check, played hymn 001 to 0:19/2:45, and
  responded to pause and stop. That test used a temporary application ID and
  local BFF/CSP overlay; neither is in tracked configuration. The standard
  no-BFF release executable was rebuilt with service-worker shell v19 and
  launched successfully. `node --test scripts/verify-service-worker.test.mjs`
  passes 4/4. Multi-song/long-session MIDI, offline upgrade/recovery, signed
  installer and packaged file-picker checks remain open.
- **2026-09-24 CF-072 offline asset hierarchy receipt:** pack status keeps its
  size and user actions visible while manifest version/date moved under a
  collapsed `Diagnostik` disclosure. Explanatory copy was shortened in ID/EN/ZH.
  The focused disclosure flow passes; the 390×844, 768×1024, and 1440×900
  assets screenshots were reviewed and refreshed. Full offline install,
  upgrade/recovery, and provider download matrices remain open.
- **2026-09-24 CF-073 stale packaged shell recovery:** the rebuilt executable
  initially opened the old Offline UI from the existing Tauri profile at its
  unchanged entry URL. Shell cache v20 and a native startup URL query `?v=20`
  now show the shortened copy on the first normal launch, without clearing app
  data. The packaged screen keeps manifest version/date under collapsed
  `Diagnostik`; expanding it shows the metadata. The service-worker verifier
  passes 4/4. Full E2E passed 282 cases with one optional KJV skip and one
  retry-passing touch-target flake; five serial repeats of that check passed.
  Offline upgrade/recovery and provider download matrices remain open.
- **2026-09-24 CF-074 playlist parity:** the Playlist tools moved behind a
  compact More menu, saved playlists now reorder songs, and import/export
  accepts the upstream `{ name, songs }` schema while retaining the internal
  MIDI queue format. Phone E2E covers import, export, create, rename, delete,
  select active, load, remove, reorder, and reload; a lower-case A/B source
  number resolves to the catalog's canonical ID. The focused browser flows
  passed 2/2 at 390×844, the localized disclosure flow passed in ID/EN/ZH, and
  the canonical-ID unit check passed 1/1. At CF-074, IndexedDB restore after
  localStorage eviction and packaged multi-song autoplay/long-session evidence
  remained open; CF-076 records the recovery fix.
- **2026-09-24 CF-075 PDF controls and download:** fullscreen now targets the
  whole reader, so exit controls remain available; PDF downloads turn the
  loaded bytes into a named same-origin blob, including when the source URL is
  cross-origin. Focused browser checks cover idle toolbar restore, fullscreen
  entry/exit, named download bytes, page resume, failure retry, and responsive
  zoom/layout. Packaged cache recovery and chord-overlay source pairing remain
  open.
- **2026-09-24 CF-076 playlist recovery:** the IndexedDB playlist mirror now
  includes the active saved playlist. When localStorage is missing, restore
  fills only the missing playlist and active-selection keys, preserving newer
  local state. An E2E flow confirms the IDB snapshot, clears both keys, reloads,
  and verifies the list and active selection return. Packaged multi-song
  autoplay and long-session playback remain open.
- **2026-09-24 CF-077 Bible annotations:** legacy single-string verse notes
  migrate to per-verse note collections; users can add and delete multiple
  notes, and the selected verse's note sheet filters to that verse. Preset
  highlights toggle off, validated custom colors persist in the palette and
  portable backup, and the selected-verse toolbar now has a 44px mobile hitbox
  guard. `bible-annotations.spec.ts` passed 2/2 at 390×844;
  `backup-settings.test.ts` passed 3/3 and encrypted backup E2E passed 1/1.
  Full unit/policy tests passed 303/303; lint, typecheck, build, format, docs,
  generated provenance, strict chord audit against the detached
  `gyschordweb@fced260` source, and native fmt/check/test/clippy passed. The
  release Playwright suite passed 289 cases with one optional KJV download
  skip; one mobile navigation timeout passed on retry and on a separate
  no-retry run. Packaged annotation restore and the broader locale/text-scale
  matrix remain open.
- **2026-09-25 CF-080 Bible search accessibility receipt:** when closed, the
  Bible search form is now `aria-hidden` and `inert`, keeping its controls out
  of the accessibility and keyboard order. The toolbar opens it before moving
  focus into the query field; closing returns focus to the trigger. The focused
  Playwright flow, web typecheck, format check, release Tauri rebuild, and
  packaged Edge smoke passed. Computer Use captured the new package Home but
  could not navigate after the helper twice reported
  `foreground window did not report a process id`.
- **2026-09-25 CF-081 Kidung MIDI hierarchy receipt:** the queue shortcut now
  lives inside the closed-by-default advanced dock disclosure. Focused dock
  checks passed at 320, 390, 768, and 1440px; reviewed phone and desktop
  screenshots show no overflow and the desktop dock remains within two bands
  and 128px. A two-song browser playback fixture confirms auto-advance after
  the first MIDI ends. Native multi-song autoplay and long-session playback
  remain open.
- **2026-09-25 CF-082 MIDI controls receipt:** an active 10-second browser MIDI
  fixture exercised seek, volume, mute, transpose, instrument, tempo, and stop
  through the dock. The incomplete SoundFont intentionally selected the
  oscillator compatibility backend; packaged FluidSynth controls and
  long-session playback remain open.
- **2026-09-25 CF-083 MIDI node cleanup:** natural completion and crossfade now
  disconnect their source/gain nodes; explicit stop also releases a leftover
  gain if the source reference has already cleared. Two new unit regressions
  failed before the fix and pass afterward. Five focused MIDI dock/playback
  E2Es and web typecheck pass; packaged memory-soak evidence remains open.
- **2026-09-25 CF-079 first-control and repeat-playback receipt:** a fresh
  isolated native profile exposed a Service Worker `controllerchange` reload
  before the first Bible navigation. The handler now skips that initial
  controller acquisition while retaining reloads for later updates. After a
  release rebuild, packaged smoke passed navigation and verified abort, voice
  change, non-zero audio receive/playback, pause/resume/stop, and a repeated
  same-voice request. The full browser/native update and offline-recovery matrix
  remains open.
- **2026-09-25 CF-084 chord/PDF source receipt:** BFF chord manifests now fall
  back to the offline lock when source commit, entry commit, completeness,
  song attribution, size, or SHA differs. Regression tests cover four mismatch
  cases, and the current generated audit verifies all 157 canonical chord/PDF
  hash pairs. Computer Use showed hymn-001's chord overlay on Fork master page 5. All-song pairing for alternate PDF sources and packaged cache recovery
  remain open.
- **2026-09-25 CF-085 corrupt PDF package cache recovery:** Fork distribution
  packages are now checked against release size/checksum before cached bytes
  are used; corrupt entries are removed and only verified downloads are
  cached. The regression failed before the fix and now passes with the focused
  Fork PDF tests. Offline-only and packaged profile recovery remain open.
- **2026-09-25 CF-086 Bible search startup/focus recovery:** the search action
  is disabled while the Bible reader has no active header state, preventing a
  click against its inert form from being lost. Other route search remains
  enabled. Computer Use observed the loading state and browser interaction
  confirmed focus after activation; reviewed responsive search baselines and
  focused search/reader E2E pass. The full browser suite later exposed a
  separate touch-target timing issue; see CF-087.
- **2026-09-25 CF-087 Kidung disclosure touch target:** the text-reader More
  and settings menus now reuse the existing translate-only entrance animation,
  so the nested 44px setting target does not shrink during opening. The focused
  phone reader regression passes 5/5 repetitions; full release Playwright
  passes 292 tests with one optional KJV network-download skip.
- **2026-09-25 CF-088 native Rust gate receipt:** local `cargo fmt --check`,
  `cargo check`, `cargo test` (6/6), and warning-denying Clippy all pass.
  Signed installer installation/upgrade, file picker, and full OS media
  verification remain open.
- **2026-09-25 CF-089 offline Fork PDF cache receipt:** the hymnals release
  manifest is cached only after schema, track, KR package, and trusted URL
  validation; offline loads may reuse it, while package size/SHA and decoded
  master-PDF integrity remain enforced. The focused cache regression passes;
  packaged offline-profile recovery remains open.
- **2026-09-25 CF-090 Kidung PDF visual receipt:** stable PDF canvas baselines
  at 390×844 and 1440×900 pass and were inspected. The screenshot fixture blocks
  remote GitHub chord data; chord overlay behavior remains covered separately,
  while full source pairing remains open.
- **2026-09-25 CF-091 PDF geometry receipt:** direct-manipulation checks pass
  8/8 repetitions with a 0.001px tolerance for CDP rounding; the CSS target
  remains 44px. The latest full browser run has 293 passes, one flaky backup
  import navigation (retry passed), and one optional KJV network-download skip.
  The isolated backup-import repeat passes 3/3; the first full-suite failure
  returned `ERR_NO_BUFFER_SPACE` from the local test server.
- **2026-09-25 CF-092 browser speech receipt:** the media dock labels the active
  browser voice correctly. Seven media-dock E2E cases pass, including Auto
  selecting a nonlocal Indonesian system voice and Local selecting only the
  installed local voice. These use deterministic Web Speech mocks; the actual
  OS voice inventory and signed-installer verification remain open.
- **2026-09-25 CF-093 all-song Fork chord receipt:** exact-size/SHA source
  verification and the PDF.js audit cover all 157 chord files, 177 mapped
  pages, and 3,655 chord entries against `gyschordweb@fced26004f7bd9eb5ad8b67cc3b1568f90e79468`
  and `GYSAPP-Fork@4f0d39b`; no page, index, notation-token, or row-boundary
  mismatches were found. Packaged offline cache recovery and distributed PDF
  lifecycle verification remain open.
- **2026-09-25 CF-094 distributed cache integrity receipt:** new decoded
  payload records pin SHA-256, and payload/catalog reads reject same-length
  corruption; regression tests fail before and pass after the fix. Old records
  without a payload hash remain compatible. Browser/PWA/Tauri offline update,
  remove, and reinstall lifecycle proof remains open.
- **2026-09-25 CF-095 legacy cache hash migration:** first size-valid read
  persists SHA-256 for a compatible pre-CF-094 payload record; following reads
  reject same-size cache mutation. Web tests pass 314/314 and the Chromium
  distributed-assets E2E passes 3/3. Same-size corruption predating migration
  cannot be distinguished without its original package; clean-profile native
  offline/update/reinstall proof remains open.
- **2026-09-25 CF-096 missing chord state:** `hymn-051A` has no canonical chord
  entry, so its reader now reports unavailability without suggesting a network
  failure or offering a pointless retry. All nine media-load E2E cases and
  314 web unit tests pass; typecheck, Computer Use preview, and the packaged
  Tauri WebView2 smoke also pass. Packaged chord-cache recovery remains open.
- **2026-09-25 CF-097 Literature search hierarchy:** search, category, and sort
  controls now follow the page intro and precede the featured and recent
  shelves; active filtering hides those unfiltered shelves. All seven reading
  family E2E cases and 314 web unit tests pass, along with typecheck and
  Computer Use review at 390px and 1440px. Literature source/offline and full
  locale verification remain open.
- **2026-09-25 CF-098 distributed-asset retry:** a simulated interrupted
  package stream leaves no installed record, and retrying downloads and stores
  the complete asset. The focused manager suite passes 11/11. At 390×844, the
  expanded Data Offline panel's local-pack actions fit the viewport; clean
  profile offline, update, and reinstall behavior remains open.
- **2026-09-25 CF-099 distributed offline lifecycle:** fresh Chromium context
  installs the SQLite fixture, then reloads the Bible app with the browser
  offline and reads the cached database without another package request. The
  asset UI also passes install/reload/remove/reinstall; manager tests cover
  partial-stream retry and manifest update. Both targeted E2E specs pass 4/4;
  the manager suite passes 12/12. The local TB database is only a storage
  fixture under the KJV catalog entry, so translation parity is not claimed.
  Native Tauri offline/update/reinstall and non-Bible asset lifecycle remain
  open.
- **2026-09-25 CF-100 browser and native gate receipt:** the full Playwright
  suite completes with 297 passed and two optional skips; one e-GYS account
  summary timeout passes on retry and in a separate 3/3 repeat. Eight reviewed
  Literature catalog baselines now match the current filter-before-shelves
  hierarchy. The distributed offline restart case passes with the local BFF
  and is skipped when the default suite has no BFF. Web unit tests pass 316/316;
  typecheck, lint, build, generated verification, docs, and Rust fmt/check/test/
  clippy pass (native tests 6/6). Computer Use on the refreshed 1280×720
  preview confirms Bible verses and cross-reference actions, plus Kidung lyrics
  and chord, SoundFont, and verse navigation controls. Signed installer, native offline lifecycle,
  and the full locale/theme/text-size matrix remain open.
- **2026-09-25 CF-101 preference cross-product:** Bible and Kidung pass all 30
  combinations of three locales, five themes, and 200% root text at 390×844;
  each heading stays visible and no document overflow occurs. The targeted E2E
  passes 1/1 and web typecheck passes. Other routes and native preference
  persistence remain open.
- **2026-09-25 CF-102 Appearance disclosure:** More now presents Theme and
  Language as compact select rows and shows the accent palette only after its
  disclosure opens. Focused More E2E passes 5/5; Appearance visual cases pass
  3/3 at 320×720, 390×844, and 1440×900, capturing collapsed and expanded
  accent states. All six screenshots were reviewed with no horizontal overflow.
  Other routes and native preference persistence remain open.
- **2026-09-25 CF-103 Kidung search substrings:** checked upstream `main` against
  pinned SHA `fced26004f7bd9eb5ad8b67cc3b1568f90e79468`; its filter AND-matches
  substrings in hymn number, title, and normalized lyrics. Local search now
  matches title fragments and partial zero-padded numbers while retaining
  quoted phrases and accent folding. Both regressions failed before the fix;
  `kidung-density.spec.ts` passes 9/9, web unit tests 318/318, typecheck and build
  pass. The full golden query and locale matrix remains open.
- **2026-09-25 CF-104 release E2E and offline lifecycle:** the responsive Bible
  navigation case now opens the nested accent disclosure before asserting the
  palette. The full default Playwright suite passes 304 cases and skips two
  BFF-gated download tests. With a localhost BFF base and mocked manifests and
  package bytes, both distributed-asset specs pass 4/4, including offline
  restart and removal/reinstall. The SQLite fixture verifies storage lifecycle,
  not KJV translation fidelity. The normal web build was restored afterward;
  native clean-install and all-asset offline lifecycle remain open.
- **2026-09-25 CF-105 Kidung search fields:** comparison with the pinned
  `filterPujianList()` confirms that searchable content is number, title, and
  normalized lyrics; catalog IDs and collection labels are not searched. Local
  search now keeps lettered source numbers such as `051A/B` searchable without
  including those metadata-only fields. Regression failed before the fix;
  hymn-search unit tests pass 7/7 and focused catalog/search E2E passes 7/7.
  Full query-corpus and locale parity remain open.
- **2026-09-25 CF-106 mobile PDF title fit:** the Kidung PDF title now uses its
  full toolbar slot for autofit and stays at least 11px, with ellipsis when the
  complete title does not fit. This intentionally raises upstream's 9px floor
  for readability. The old 390×844 geometry/size regression failed before the
  fix; PDF visual baselines pass 6/6 over three repeated runs at 390×844 and
  1440×900. Full PDF cache, recovery, and source-pairing parity remain open.
- **2026-09-25 CF-107 post-change release gates:** unit tests pass 319/319;
  lint, typecheck, format, and documentation verification pass. The full
  Playwright run reports 303 passed and two BFF-gated skips, plus one flaky
  Literature 600×900 document-width check that passed on retry; that isolated
  case passes 3/3. No screenshot baseline was changed for the Literature case.
- **2026-09-25 CF-108 full-catalog Kidung search parity:** current upstream
  `main`, the pinned lyrics/search source, and the 533-entry catalog all resolve
  to `fced26004f7bd9eb5ad8b67cc3b1568f90e79468`. A differential test compares
  number, title, first-verse, and AND queries across the full catalog and all six
  collection filters. The punctuation-normalization regression failed before
  the parser fix; search tests pass. A localized 390×844 browser test passes in
  ID/EN/ZH, and Computer Use confirms the same `001` result after language
  changes. `pnpm test` passes with 321/321 web tests; typecheck, lint, format,
  and docs checks pass. Quoted phrases and accent folding remain intentional
  extensions.
- **2026-09-25 CF-109 Bible search localization and result bound:** Computer Use
  confirmed the reader search control stays disabled during pack loading, then
  opens and focuses the input when Kejadian 1 is ready. At 390×844, the broad
  `Allah` query renders 40 results without horizontal overflow and preserves
  localized search labels in ID/EN/ZH; the targeted browser case passes 1/1.
  Packaged startup and large-pack latency remain open.
- **2026-09-25 CF-110 Bible search pagination and native measurement:** at
  390×844, Playwright verifies 40 initial results and 80 after the localized
  “show more” action in ID/EN/ZH, with no horizontal overflow (1/1). A fresh
  no-bundle Tauri WebView2 smoke passes with `EDGE_TTS_URL` absent: Home 151ms,
  Bible ready 1,169ms, search 390ms, result expansion 40→80, and 33,984 Edge
  audio bytes received and played. Performance budgets and the wider offline
  and filter matrix remain open.
- **2026-09-25 CF-078 packaged Edge TTS receipt:** the release-executable smoke
  confirms stop during synthesis aborts cleanly; changing to Gadis reaches the
  provider and receives/plays 33,984 non-zero audio bytes; pause, resume, and
  stop return the reader to idle, and a repeated same-voice request receives
  and plays audio. Manual Computer Use confirmed the Bible
  player state transitions. The web typecheck and targeted format check pass.
  The daily native workflow is configured but has not run on the default
  branch. Signed installer installation/upgrade and the browser voice matrix
  remain open.
- CI uses one concurrency group per source branch so a push plus its pull
  request do not duplicate the native and browser release gates; newer source
  commits cancel older verification runs.
- The checked bundle gate caps the initial application chunk at 250 KiB gzip.
  The latest five-sample shell benchmark records a sub-250 ms p95 navigation
  response in CI (the five samples are retained in the run log and vary by
  runner). PDF.js, its worker, and the TB search
  worker remain lazy chunks, and the bundle gate fails if the initial
  application chunk exceeds 250 KiB gzip. FluidSynth remains lazy, while the
  GeneralUser-GS SoundFont is an explicit verified download and is absent from
  the initial web and native packages.
- The v15 service-worker install path precaches only the shell and compact
  offline indexes. Distributed assets are installed explicitly through Asset
  Management; this keeps activation and first paint off the heavy-asset path.
  HTML navigations use a network-first refresh so a successful Pages deploy is
  visible to existing PWA clients instead of being hidden by an old shell
  cache.
  Registration is progressive enhancement: reduced webview service-worker
  objects—including an undefined registration result—are guarded and failures
  are recorded without taking down the shell.
  Cross-origin TJC cover/media responses are restricted to the verified TJC
  image origin and pruned to a 96-entry bounded cache on activation and use,
  so normal browsing cannot grow PWA storage without limit; pinned downloads
  continue through the versioned asset manager.
  The generated music lock inventories source metadata, so
  remote-only MIDI/PDF assets skip known-missing Pages probes before using the
  verified immutable source.
  When `VITE_BFF_BASE_URL` is configured, the KR master PDF uses the
  same-origin `/api/v1/content/fork-pdf` range proxy locked to
  `ThenGB/GYSApp-Fork@4f0d39b`; raw GitHub and the signed GYSApp-Data package
  remain verified fallbacks.
  The favicon and PWA manifest use a square official-logo mark with
  Pages-relative paths; runtime-health coverage checks the asset response and
  rejects browser metadata warnings. The shell cache version is bumped with
  the metadata change so existing PWA clients receive the corrected manifest.
  The links are emitted with Vite's base URL, so direct `/kidung/:songId`
  navigation cannot fall back to route-relative `/kidung/assets` requests.
- The WhatsApp auth handoff reserves its popup during the click gesture and
  removes the opener before external navigation, avoiding false blocked-popup
  errors while preserving the secure handoff boundary.
- The offline pack manager now checks an optional `VITE_ASSET_MANIFEST_URL`,
  validates duplicate IDs/origins, diffs content identity, stages changed
  local assets through the verified Cache Storage transaction, swaps a
  persisted active-manifest pointer, and cleans removed entries after the
  swap. Pages without the override intentionally use the bundled immutable
  manifest.
- Playwright smoke coverage passes at desktop, 320–1920px, 390px mobile, and
  landscape widths, with
  exactly one navigation surface and no horizontal overflow. In-app Browser
  could not reach the local Windows preview (`ERR_CONNECTION_REFUSED`), so the
  same visual QA was captured with the repository's Chromium runner. The
  earlier release snapshot recorded 51 passing flows, including split-reader keyboard resize,
  Bible title-drag chapter navigation, contextual selection actions, internal
  Sauh/Suara/article readers, a Home surface that derives Daily Verse directly
  from the current Sauh entry and keeps exactly one Lanjutkan item,
  persistent/minimizable media with source return,
  explicit article scroll-resume navigation, MIDI queue
  persistence, canonical chord fetch and PDF chord-overlay rendering,
  GYSApp-Fork PDF viewer/download, and MIDI loading. The PDF smoke also waits
  for a non-zero rendered canvas and a real download link; the MIDI flow checks
  minimize/restore on the shared media surface.
  MIDI worker/render operations are generation-guarded, so rapid song/settings
  changes cannot let a late FluidSynth result replace the current session; the
  focused gate tests run with the same web unit suite.
  The next hymn also warms binary, parser, and PCM render work through a
  serial hash-keyed queue; queued neighbours are cancelled when foreground
  playback changes, while shared render promises prevent duplicate WASM work.
  Golden chord tests cover punctuation-normalized one-to-one Text mapping and
  conservative unmatched-line behavior; a rapid hymn/viewer Playwright flow
  proves the latest route cannot inherit a stale PDF surface.
  The immutable gyschordweb chord source has now been audited against its
  canonical PDFs: all 161 files and 3,738 note-aligned positions resolve to a
  verified PDF note/lyric row, with zero orphan or invalid entries. The report
  is committed at `docs/discovery/chord-position-audit.json` and the generated
  provenance gate rejects a changed lock until the audit is regenerated from
  the pinned checkout (`pnpm audit:chords`).
  Literature PDF failures now expose an in-shell `Coba lagi` action, and the
  shared PDF reader cleans up loaded documents and virtualized page resources
  when a route, song, or retry changes, preventing stale worker/page buffers
  from accumulating during rapid navigation.
- The release suite includes forced PDF and Sauh upstream failure flows that keep the
  user inside the hymn shell and exposes a `Coba lagi` recovery action. The
  Sauh flow proves that no fabricated Daily Verse is shown when the source is
  unavailable. Home now races the verified current-day snapshot with live
  revalidation, so a slow/CORS-blocked upstream cannot hide an otherwise valid
  daily entry. The performance flow records five first-contentful-paint/
  navigation samples, reports median and p95 timing, and fails on duplicate
  initial application-module requests.
  When direct TJC revalidation finishes after the snapshot has painted, a
  typed Sauh subscription updates Home and the dedicated reader in place.
- Axe runs on the Home and Kidung surfaces with zero violations (including
  color contrast), and a mobile Bible keyboard smoke
  keeps a visible focus target after navigation. The light-theme muted token
  is 5.7:1 against white; the audit is kept in the release suite through the
  `@axe-core/playwright` dev dependency.
- Long catalogue/list surfaces use browser `content-visibility` boundaries so
  mobile scrolling does not eagerly lay out every hymn, faith topic, or
  literature card. Loading panels use a restrained border pulse and the
  global reduced-motion rule disables it for users who request less motion.
- Kidung detail now has an automated presentation assertion: Lirik and PDF are
  the only viewer modes; Chord is a shared visibility capability and never a
  third surface. The native boundary check passes with 18 required
  offline/runtime assets totaling 36,845,850
  bytes in the current build; this is a packaging proof, not a signed
  installer artifact. The chord E2E additionally asserts that canonical
  note-aligned PDF layout rows and DOM overlay markers are rendered (not only
  a flat chord list), and PDF/chord opening shares one immutable Fork-or-
  canonical resource request so fallback cannot mix page geometry between the
  visible reader and note extraction; the
  domain/web tests cover simultaneous chord fetch deduplication and the 96 MB
  MIDI render-cache contract.
- Kidung typography controls are bounded and persisted per song; the PDF smoke
  covers the horizontal layout and the narrow-screen two-page guard. Text mode
  now measures long chord/lyric lines and applies a bounded 14 px auto-fit on
  viewport changes while retaining the saved preference. Wrapped Text-mode
  chord markers are additionally grouped from measured character rows and
  rendered as a relative overlay, matching the canonical viewer's layout
  behavior without per-character chord cells. Key selection is verified as a
  shortest-path transpose from the canonical chord source key;
  the global MIDI surface exposes the source program plus all 128 General MIDI
  programs, persists media preferences, and Kidung transpose updates the same
  external MIDI session. PDF page progress is keyed by the immutable source
  version, clamped when a document changes, and exposes a return-to-saved-page
  action after navigation.
- The Kidung catalog search index is built once per catalog revision and is
  covered by AND/quoted/prefix golden tests plus a Playwright reversed-term
  lookup. Vertical PDF mode evicts canvas render state outside its observer
  preload window; BFF Literature and Suara Sejati have concurrent-fetch tests.
  Chord negative-cache misses expire after 14 days, and the browser asset store
  deduplicates simultaneous versioned downloads.
- The private e-GYS repository is local-only by policy: no GitHub Actions
  workflow may clone, fetch, or invoke its upstream synchronization scripts.
  `pnpm verify:generated` and the policy test fail on any forbidden workflow
  access; only repository-managed local hooks perform authenticated sync.
- Tauri's packaging CSP is checked by the native asset verifier and explicitly
  allows only the TJC and immutable gyschordweb origins required by verified
  content loading.
- The reset/cache-maintenance path is now durable-store complete: browser
  IndexedDB blobs/key-values and GYS-owned service-worker caches are cleared
  together, while native reset removes only the app's versioned data
  directories. The browser release suite seeds and verifies all three stores,
  and partial failures produce an actionable notice. This prevents stale
  PDF/chord/MIDI bytes from surviving a user-requested reset without deleting
  unrelated app metadata.
- Tauri webviews now select the native app-data adapter through the global
  invoke bridge. Key-value records and verified chord/media blobs use
  path-safe keys and unique-temp-file atomic replacement; Rust tests cover
  traversal safety and replacement cleanup. Unsupported native capabilities
  report `false` instead of showing an unimplemented control.
- The shared platform contract now also covers database, transient secrets,
  notifications, file dialogs, sharing, deep links, and lifecycle events.
  Browser implementations are exercised by unit tests; Tauri wires SQLite,
  OS credential storage, native file dialogs/filesystem access, notifications,
  lifecycle events, and deep-link registration. Runtime checks on signed
  Windows/Android/iOS artifacts are still required for GA evidence.
- BFF environment source bindings are HTTPS-only and TJC-origin allowlisted;
  insecure e-GYS and non-TJC Sauh/Literature/Suara overrides are ignored, so
  only the packaged Sauh snapshot or canonical TJC defaults remain eligible for
  fetching. `pnpm verify:docs` enforces the living architecture/release
  documentation map in local hooks, CI, and Pages builds.
  The latest Pages artifact carries a source-backed `sbj260816` snapshot while
  the direct browser request remains best-effort because the WordPress endpoint
  does not currently emit `Access-Control-Allow-Origin`; a configured BFF
  restores live revalidation without changing the reader contract.
- The Windows native CI job now runs `cargo fmt --check`, `cargo check`,
  `cargo test`, and `cargo clippy --all-targets -- -D warnings`. The manual
  `Native Windows installer` workflow now runs the Tauri 2.11 CLI and uploads
  reproducible NSIS/MSI output plus commit provenance; it rejects a requested
  signed build unless protected Windows certificate secrets are present, then
  signs both packages with `signtool` and removes the temporary PFX. Native
  packaging remains separate from signed installer evidence until that workflow
  is run with the release credentials.
- e-GYS uses only the live v1 compatibility boundary: Tauri owns the
  origin-allowlisted login WebView and OS-keyring token, while web/PWA exposes
  only the official login link. Draft v2 provider SDK, exchange, and WhatsApp
  polling routes are absent from the runtime and covered by negative tests.
  The generated upstream contract is current at commit `a7a25e8` and records
  the verified Springdoc runtime document boundary (`/v3/api-docs`, Swagger UI
  path, and enablement property), plus the compatible branch/region routes;
  concrete request/response schemas remain source-owned until that runtime
  document is available to the authenticated sync step. Forced contract
  refreshes retain the previous snapshot for breaking-route detection.
  Browser key-value and binary chord caches share a versioned IndexedDB
  database; Cache Storage remains the HTTP-facing layer, while IndexedDB keeps
  verified blobs available after a reload or in a restricted webview.
- The optional `POST /api/v1/tts/edge` boundary is schema-validated, HTTPS-only,
  tested through the BFF, and selected from the reader as `auto` (Edge then
  local), `edge`, or `local`. The optional voice catalog is also schema- and
  HTTPS-validated; the browser gateway path remains unavailable until a
  protected `EDGE_TTS_URL` is supplied. Native Tauri additionally supports the
  direct keyless Edge-compatible WebSocket; the Windows release executable
  built with `tauri build --no-bundle` was exercised on 2026-09-24 with the
  optional gateway blank. Chapter progression, pause/resume/stop, Ardi voice
  selection, and matching 52,128-byte receive/play diagnostic records were
  observed. The 2026-09-25 packaged smoke adds automated abort, Gadis voice
  change, and pause/resume/stop coverage. Signed installer installation/upgrade
  proof remains open; see `docs/discovery/edge-tts-runtime-audit-2026-09.md`. While a verse range is
  playing, the reader marks and scrolls the active verse and the expanded
  global media surface exposes previous/next verse controls; the behavior is
  covered by the shared read-aloud Playwright flow.
- Cookie-authenticated BFF mutations now reject requests without an allowlisted
  `Origin` or same-site Fetch Metadata signal; the native adapter uses the
  explicit `x-gys-client: native` marker and the policy has contract coverage.
  Tauri does not inject browser Google/Apple SDK scripts under its strict CSP.
  The global media surface re-clamps after minimize/route changes and its drag
  handle supports keyboard arrow movement with a visible focus ring. The
  normalized e-GYS profile preserves branch and event capabilities exposed by
  the current upstream contract, while older deployments remain compatible.
- GitHub Pages now builds the complete workspace, verifies generated
  provenance, enforces the bundle budget, and is live at
  https://gyspnk.github.io/GYSApp-Tauri/ from the protected preview branch.
  Commit `2bfc6c5` is confirmed live with HTTP 200, a 533-item hymn catalog
  locked to `gyschordweb@cbc7d386`, the source-backed `sbj260816` Sauh snapshot,
  and the live Sauh/native-auth hardening bundle. Pages run `31936149035` and
  CI gate `31936151240` both passed, including the native cargo gate and 41-flow
  browser suite.
  The Pages environment permits `main` and the named preview branch; the
  protected `main` branch remains the production promotion gate.

`pages.yml` is the GitHub Pages Preview pipeline. `worker.yml` is deliberately
manual and no-ops unless protected `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` secrets are present.

- **2026-09-25 CF-111 Bible responsive visual baselines:** a clean build on an isolated preview produced a passing Bible-filtered Playwright suite (38 passed, 2 skipped for missing BFF download configuration). Seven missing Chromium baselines now cover the Bible reader at 390×844, 768×1024, and 1440×900; search at 390×844 and 1440×900; search filters at 1440×900; and notes at 390×844. Visual review found the rendered content and controls present. Computer Use on a clean-origin preview confirmed 40 search results expand to 80 through the localized More action; the app-wide matrix remains open.
- **2026-09-25 CF-112 Bible search filters and latency budget:** an E2E case proves exact-phrase and whole-word behavior while every off-origin request is blocked after the offline pack loads (1/1). The packaged WebView2 smoke enforces a 1.5s budget from broad-search submission to 40 visible matches; four clean-profile readings measured 379–399ms (max 399ms), with Bible readiness at 1,092–1,191ms. The Bible-filtered suite passes 39 cases with two BFF-gated skips. Offline installation/recovery, remaining book/reference filters, deep links, signed installer, and OS media remain open.
- **2026-09-25 CF-113 offline asset lifecycle:** a temporary local-BFF build plus Playwright-mocked manifests and the checked-in TB SQLite payload passed 4/4 distributed-asset tests, including optional Bible install, reload, removal, reinstall, and offline reopen. This verifies browser storage lifecycle only; live BFF/package delivery and KJV content remain unverified. Computer Use on a clean no-BFF origin confirmed the service notice, disabled optional download buttons, and bundled offline content. Search filters, deep links, signed installer, and OS media remain open.
- **2026-09-25 CF-114 Bible book filter:** the search E2E passes (1/1) for Old Testament, New Testament, and exact Yohanes-only scopes. Typed-reference and deep-link edge coverage, live BFF/package delivery, signed installer, and OS media remain open.
- **2026-09-26 CF-115 Bible deep-link bounds:** E2E against the real TB pack passes (1/1): verse 999 clamps to Yohanes 3:36, chapter 99 clamps to Yohanes 21:1, and an unknown book preserves a seeded Yohanes 3 position. Typed-reference search and other deep-link cases remain open.
- **2026-09-26 CF-116 Bible release gate:** the 42-case Bible-filtered Chromium suite passed 42/42 with zero skips using a temporary local BFF build and Playwright-mocked downloads. This includes offline install/recovery, responsive/accessibility, filter/deep-link, and visual cases. The no-BFF web build was restored afterward; live provider delivery and signed installer remain open.
- **2026-09-26 CF-117 media action routing:** a Playwright MediaSession stub passes (1/1) for speech previous/next, pause/resume, and removed unsupported seek actions; the bridge publishes speech playback state and clears stale MIDI position. Computer Use verified actual local TTS and dock persistence from Bible to Kidung. The native OS transport panel remains unverified because the current Computer Use inventory exposed no native app window.

- **2026-09-26 CF-118 Bible references and deep-link parsing:** the shared Bible repository now matches typed book/chapter/verse references exactly and retains book/testament filters. The browser returns one Yohanes 3:16 result and opens/selects it. Deep links accept decimal chapter/verse values only; malformed numeric syntax is rejected and returns to the saved reading position. `pnpm build`, Bible repository tests (7/7), deep-link parser tests (14/14), and the focused browser cases (2/2) pass. Cross-version/history links, live BFF delivery, signed installer, and native OS media remain open.

- **2026-09-26 CF-119 Bible Split review:** the split menu regression now verifies that synchronized scrolling is available only while split mode is active and disappears after exit. Responsive E2E verifies vertical stacking at 320×720 and 390×844, side-by-side equal panes at 768×1024, 1024×768, and 1440×900, with no horizontal overflow (2/2). Computer Use visually reviewed the active desktop split at 1280×720. Removed the unused `.split-controls-row` and `.split-sync-toggle` CSS selectors after confirming no source references. Secondary-version alignment, loading/error states, and packaged interaction remain open.

- **2026-09-26 CF-120 Bible Split error recovery:** an unavailable optional translation no longer exposes the storage exception. The reader shows a localized error with the human-readable KJV name and a retry button that reloads the secondary pane; the primary reader remains available. Fresh-context E2E covers the uninstalled KJV state and retry (1/1), split controls/responsive layout pass 3/3, and localization tests pass 4/4. Web typecheck and formatting checks pass. Cross-translation verse alignment, transient/offline retry recovery, and packaged lifecycle remain open.
- **2026-09-26 CF-121 Bible annotation backup integrity:** encrypted UI export, annotation removal, and UI import restore a note, bookmark, custom highlight and palette; the live Bible reader displays all three annotation types afterward. A malformed backup reports an error without changing existing settings or a private token. Focused Chromium E2E passes 2/2. Native file-picker and legacy backup cases remain open.
- **2026-09-26 CF-122 native Edge TTS re-verification:** rebuilt `gysapp-native.exe` from this worktree with `tauri build --no-bundle`; packaged WebView2 smoke passes with direct keyless Edge transport. It aborts an active request, switches to `id-ID-GadisNeural`, receives/plays 33,984 bytes, passes pause/resume/stop and a repeat request, and measures Bible search at 400ms (1,500ms budget). Home and Bible readiness measure 34ms and 1,099ms. `cargo fmt --check`, `cargo check`, `cargo test` (6/6), and Clippy with `-D warnings` pass. Signed-installer and real OS voice-inventory proof remain open.
- **2026-09-26 CF-123 source and generated-data gate:** GitHub `gyschordweb/main` still resolves to the pinned `fced26004f7bd9eb5ad8b67cc3b1568f90e79468`, matching the clean local source checkout and generated lock. `pnpm verify:generated`, `pnpm audit:chords:check`, and `pnpm verify:native-assets` pass: 1,225 music assets, 533 hymns, 157 chord files with 3,655 mapped positions and no orphan/invalid mappings, and 17 verified native assets. The generator reports 210/299 literature items with official covers; 89 items have none.
- **2026-09-26 CF-124 release browser gate:** `pnpm test:e2e` completed 315 cases: 312 passed, two BFF-gated asset downloads skipped, and one cold hymn-route readiness assertion passed on retry. The recovered case passes three more times at two workers with retries disabled. Visual, accessibility, responsive, Bible, Kidung, playlist, backup, and runtime-health cases otherwise pass. The cold-route outlier remains recorded rather than hidden.
- **2026-09-26 CF-125 Bible history continuation:** the Home Continue card is now exercised end-to-end: with saved Yohanes 3 activity and reading position, clicking the Bible card opens Yohanes 3 (Playwright 1/1). Cross-version search links and packaged history restore remain open.
- **2026-09-26 CF-126 Bible search source-version links:** global-search Bible links now include their source version, and opening a TB result switches an installed `b_kjv` selection back to TB before selecting the verse. Deep-link unit tests pass 15/15; the local mocked asset browser flow passes 1/1; Computer Use at 1280×720 confirmed Yohanes 3:16 and the `version=b_tb` route. `pnpm test` passes 323/323, with the 533-hymn parity corpus test timeout raised to 15 seconds after it exceeded 5 seconds under the full web suite. KJV text fidelity, live BFF delivery, and packaged history restore remain open. The full 315-case release suite passes 313 with two BFF-gated skips and no failures.
- **2026-09-26 CF-127 packaged Bible history restore:** after a fresh no-bundle Tauri build, the WebView2 smoke saves Yohanes 3 through the Bible reader, returns Home, requests a normal Windows window close, and relaunches with the same temporary profile. Home still offers Yohanes 3 (pass). With `EDGE_TTS_URL` unset, the full native smoke also passes keyless Edge abort, Gadis voice and 33,984-byte receive/play, pause/resume/stop/repeat, missing chord, and the 40-to-80-result Bible search in 376ms (1,500ms budget). Installer/upgrade, live BFF, translation fidelity, native OS media and voice inventory remain open.

- **2026-09-26 CF-128 packaged MIDI source and queue:** the no-gateway WebView2 smoke starts and stops pinned hymn-001 through FluidSynth with the exact pinned SoundFont, then verifies native queue auto-advance with two short deterministic MIDI fixtures through FluidSynth. The currentIndex-to-title wait accounts for asynchronous next-track loading. Keyless Edge, 40/80 Bible search (397ms; 1,500ms budget), and Bible Continue after graceful restart pass. Full-length native multi-song autoplay, long-session memory soak, signed installer, live BFF, translation fidelity, and native OS media/voice inventory remain open.

- **2026-09-26 CF-129 packaged PDF offline fallback:** WebView2 smoke blocks cross-origin HTTP(S), confirms remote Fork PDF retrieval is unavailable, then renders the pinned hymn-001 canonical PDF from its local asset-manifest entry (419×644 canvas; 13,540 bytes and SHA-256 match the music lock). The same run passes keyless Edge TTS, real hymn-001 FluidSynth start/stop, fixture-based native queue auto-advance, 40/80 Bible results in 377ms (1,500ms budget), and Bible Continue after graceful restart. Other PDF sources and packaged cache-corruption/recovery lifecycle remain open.

- **2026-09-26 CF-130 packaged music cache offline:** the WebView2 smoke verifies the pinned hymn-001/002 MIDI files and SoundFont, then blocks their exact network URLs. FluidSynth still plays the real hymn-001 and the fixture queue auto-advances without any blocked request. This proves one real track plus its queue successor and SoundFont use verified Cache Storage bytes; full-length native multi-song and long-session playback remain open.

- **2026-09-26 CF-131 packaged offline shell:** from a fresh WebView2 user-data profile, Home and Bible search remain usable while the smoke aborts all 13 cross-origin HTTP(S) requests. Home and Bible readiness are 66ms and 1,131ms; broad search returns 40/80 matches in 390ms (1,500ms budget). The same run restores Bible Continue after graceful restart and then verifies keyless Edge and cached PDF/MIDI. Other routes, full asset lifecycle, PWA update and stale-content recovery remain open.
- **2026-09-26 CF-132 installed hymnal collection labels:** the packaged core catalog contains 533 Rohani hymns; other `books` entries are metadata for optional collections with no installed items. The UI now humanizes collection slugs. Chromium E2E passes (1/1); rebuilt WebView2 smoke confirms the installed `Rohani` option can be selected with `EDGE_TTS_URL` unset; Computer Use verified the menu and selected label. Optional distributed collection labels remain open until those assets are installed.
- **2026-09-26 CF-133 packaged Bible annotations:** a fresh WebView2 profile saves a Kejadian 1:1 note, bookmark and blue highlight, closes Tauri gracefully, and verifies all three in the relaunched reader. The full keyless Edge smoke, cached PDF/MIDI checks, Bible 40/80 search budget and Yohanes 3 Continue restore also pass. Native custom-palette and backup continuity through app upgrade remain open.
- **2026-09-26 CF-134 packaged Kidung typography:** hymn-001 reader settings change text to 19px and line spacing to 1.75; both survive graceful Tauri close/relaunch and render at the restored values. The keyless Edge/PDF/MIDI/Bible smoke passes. Full touch/wheel coverage across packaged device sizes remains open.
- **2026-09-26 CF-135 packaged offline route pass:** the fresh WebView2 profile renders 10 Faith topics, 299 Literature items, a current Sauh reading and 164 Suara items while 36 cross-origin requests are blocked. The same smoke continues to pass packaged Kidung/PDF/MIDI, Bible annotations and typography restart checks. Optional asset install/remove/reinstall, stale-content update and media-download lifecycle remain open.
- **2026-09-26 CF-136 packaged preferences and Sauh recovery:** fresh-profile Tauri smoke saves EN/dark through the shell selectors and restores them after graceful restart, then resets to ID/light. Computer Use confirms EN/dark after reload at 1280×720 and no overflow at 390×844. After the off-origin request block is removed, packaged Sauh returns a current reading (`Enggan Masuk Kanaan`). The smoke still permits same-origin requests, and the bundled snapshot only reaches Sep 16, so standalone current-day offline availability remains open; route-specific preferences and broader backup/asset lifecycle remain partial.
- **2026-09-26 CF-137 packaged custom highlight palette:** fresh-profile Tauri saves a note, bookmark, blue highlight and custom `#ca7231` highlight/palette entry, closes gracefully and restores them after restart. The restored custom verse has the expected CSS color and the palette retains `#ca7231`. Native file-picker, legacy backup and cross-version upgrade continuity remain open.

Validation for CF-138: 2026-09-26 — refreshed canonical music data to live `gyschordweb/main@e8e7efe1189b5746a2bb542348e221844091c8d1`. The source diff since the prior pinned revision contains four new chord records (153, 156, 164, 333) and their manifest entries. Regeneration yields 1,229 locked assets (533 PDFs, 533 MIDI, 161 chords, 2 SoundFonts), 533 hymns, and 161 hymn chord references. The strict PDF.js audit verifies all 161 chord files against upstream PDFs: 3,738 mapped positions, zero missing/orphan/invalid entries; the upstream list, source directory, and lock match exactly. `pnpm verify:generated` and `pnpm audit:chords:check` pass. Fork-master cross-source pairing for the four new records remains open.

- **2026-09-26 CF-144 full web and current-source gate:** generated music data and live gyschordweb/main match e8e7efe1189b5746a2bb542348e221844091c8d1. The 161-song chord catalog pairs against the pinned Fork master on all 181 pages and 3,736 non-sentinel entries with zero mapping differences (pnpm audit:chords:fork:check). pnpm test passes 323/323; typecheck and lint pass. pnpm test:e2e runs 318 Chromium cases: 316 pass, two BFF-gated asset downloads skip, none fail. Computer Use at 390×844 confirms the Kidung catalog, Bible reader, and progressive More settings; the complete UI screenshot matrix also passes in Playwright.
- **2026-09-26 CF-145 packaged MIDI recovery, cancellation, and full-track queue:** WebView2 detects a same-size corrupted hymn-001 MIDI cache record, evicts it by SHA-256, refetches one verified copy, then reloads and plays with the MIDI and SoundFont URLs blocked. Stop during FluidSynth WASM render terminates three in-flight requests; the next play recreates the worker. The pinned two-song queue at 220 BPM takes 57.881s and 38.425s and advances after each displayed duration. A 120-transition fixture soak runs for 207.340s and retains 1,171,632 renderer heap bytes after stop and GC (<16 MiB). MIDI unit tests pass 11/11, media-dock and playlist E2E pass 11/11, full unit tests pass 325/325; typecheck, lint, web build, and native Rust gates pass.
- **2026-09-27 CF-146 packaged canonical PDF cache repair and offline replay:** packaged Tauri/WebView2 falls back from the blocked remote Fork PDF to locked hymn-001 bytes (419×644 canvas; blob-backed download). For remote-only canonical hymn-051A, the smoke corrupts the cached PDF without changing its size, observes exactly one repair fetch, verifies restored size/SHA-256, reloads with the PDF origin blocked, and renders from cache without a request. The same run passes keyless Edge TTS (33,984 bytes received and played), real FluidSynth hymn-001 controls and render cancellation, the complete hymn-001/002 queue at 220 BPM (57.878s/38.412s), 120 MIDI transitions in 207.213s with 654,466 retained renderer bytes after GC (<16 MiB), Bible search (40/80 results in 384ms), and restart restore. `pnpm test` passes 325/325; typecheck, lint, build, format, docs/generated verification, and both canonical/Fork chord audits pass. Full Playwright runs 318 cases: 316 pass, two BFF-gated distributed-Bible download/restart cases skip, none fail. Generated provenance verifies 1,229 music assets, 533 hymns and 10 offline assets; 210/299 literature items have official covers. Optional distributed PDF asset install/update/remove/reinstall/cache recovery remains open.

- **2026-09-27 CF-147 CSS duplicate consolidation:** removed five exact duplicate copies across five selector/declaration groups from `styles.css`, keeping the final Kidung header reset in `calm-liturgical.css` and catalog spacing/row ownership in `kidung-ux.css`. A scoped PostCSS scan finds zero identical rule bodies remaining. Nine CSS files total 370,709 bytes (372,998 at `db53050`); repeated normalized selector groups/occurrences beyond first are 398/656, with 70 `!important` declarations. Focused Playwright passes 59/59 across Kidung density, reader, playlist, MIDI dock and PDF; formatting and `git diff --check` pass.

- **2026-09-27 CF-148 responsive preference matrix across content routes:** extended `appearance-preferences.spec.ts` with Home, Faith, Literature, Sauh, Suara and More across Indonesian/English/Chinese × five themes at 390×844 and 200% text. Together with the existing Bible/Kidung matrix, 120 route/preference states now assert the rendered surface, `html[lang]`, `data-theme`, and no horizontal overflow. The full appearance spec passes 15/15. Browser containment is verified; native route-specific reader/audio persistence remains open.
- **2026-09-27 CF-149 distributed Hymnal metadata integrity:** corrected all five size/SHA pins to raw LF bytes from Fork commit `4f0d39b`; `generate-distributed-assets.mjs` now rejects metadata size or checksum drift before output. The HYMNE BFF size regression changes from 502 to 200. BFF tests pass 50/50, distributed asset manager/store tests pass 22/22, and offline Playwright passes 2/2 with the actual pinned HYMNE index and a fixture PDF package: install, offline reload, remove/reinstall, and offline Kidung read. `pnpm verify:generated` passes. Packaged Tauri download of the actual optional release package and the broader all-pack recovery matrix remain open.

- **2026-09-27 CF-150 packaged distributed-asset lifecycle and WebAssembly CSP:** A test-only packaged Tauri/WebView2 build used the local Wrangler BFF; the production CSP now permits wasm-unsafe-eval only. HYMNE actual release package recovers from an injected 503, its PDF renders offline before and after graceful same-profile restart, and remove/reinstall plus another offline render pass. The actual KJV package rejects a truncated body without persisting it, succeeds on BFF retry, and renders Genesis 1:1 offline before and after restart. The actual GeneralUser-GS SoundFont installs with verified bytes and FluidSynth plays hymn-001 offline after restart. Request counts: HYMNE 3 packages/2 metadata, KJV 2, SoundFont 1. The default app endpoint and CSP do not allow JavaScript unsafe-eval; local BFF address was test-build-only. Other Bible/hymnal packages and their update/recovery paths remain open.

- **2026-09-27 CF-151 packaged optional-asset matrix:** Expanded the native release smoke to all eight optional distributed packages using actual BFF release bytes. HYMNE 503 retry/offline PDF/remove/reinstall; KJV truncated-body rejection/retry/offline verse; CUV offline Chinese verse; Mandarin plus ASM-I/M/P offline PDF reads; and checksum-verified SoundFont/FluidSynth offline playback all survive a graceful same-profile restart. Package request counts: HYMNE 3 (metadata 2), KJV 2, CUV/MDR/ASM-I/ASM-M/ASM-P/GeneralUser-GS 1 each; each optional hymnal metadata index is fetched once except HYMNE reinstall (two). The test-only BFF endpoint/CSP overlay was removed and the default production binary rebuilt with no local endpoint. Production CSP retains WebAssembly-only evaluation. Package-version updates and interrupted-transfer recovery remain open.

- **2026-09-27 CF-152 packaged optional-asset updates:** The same packaged Tauri/WebView2 release smoke installs then updates all seven non-HYMNE optional packages through the UI, confirms each version and cache name changes, and verifies KJV/CUV verses, all four optional hymnal PDFs, and SoundFont playback remain available offline after graceful restart. Counts: HYMNE 3 package/2 metadata; KJV 3; CUV/MDR/ASM-I/ASM-M/ASM-P/GeneralUser-GS 2 each; optional hymnal metadata indexes 2 each. The test-only local BFF/CSP overlay was removed; a fresh default production build contains no localhost endpoint, with WebAssembly-only CSP evaluation. Interrupted-transfer recovery remains open.

- **2026-09-27 CF-153 packaged interrupted-transfer recovery:** Packaged Tauri aborts first CUV, MDR and GeneralUser-GS package requests, confirms the interrupted downloads leave no install record, then retries against actual BFF release bytes. An aborted KJV update keeps the prior version/cache/checksum until retry succeeds; the truncated KJV response also still rejects and recovers. The full eight-package offline/restart and seven-package update matrix passes. Final request counts: HYMNE 3, KJV 4, CUV/MDR/GeneralUser-GS 3, ASM-I/M/P 2; optional hymnal metadata indexes 2 each. The test-only BFF/CSP overlay was removed and the default production binary rebuilt with no local endpoint. Broader remove/reinstall coverage for the other optional releases remains open.

- **2026-09-27 CF-154 optional-package remove/reinstall:** Packaged Tauri removes and reinstalls each of the seven non-HYMNE release packages from the Data Offline UI after HYMNE's own removal/reinstall. All eight releases install again successfully and the restored HYMNE hymn renders offline. Final counts: HYMNE 3 package/2 metadata; KJV 5; CUV/MDR/GeneralUser-GS 4 each; ASM-I/M/P 3 each; optional hymnal metadata indexes 3 each. The test-only BFF/CSP overlay was removed; a fresh production build contains no local endpoint.

- **2026-09-27 CF-155 native route audio preferences:** The packaged Edge/WebView2 smoke now sets MIDI volume, tempo, transpose and instrument through the player controls, plus Edge voice/engine through Bible settings, then gracefully restarts Tauri. The same values remain in the profile; returning to the Kidung reader renders the saved MIDI values, and per-hymn typography still restores at 19px/1.75. The full native TTS/MIDI gate passes: Edge returns and plays 33,984 bytes; FluidSynth completes two full tracks and 120 queue transitions with 1,025,457 retained renderer bytes. The live upstream pin was checked at `gyschordweb/main@e8e7efe1189b5746a2bb542348e221844091c8d1`; its tempo defaults are cached per PDF, while GYSApp persists an explicit global user BPM override. CF-156 resolves this by applying per-song PDF defaults when no manual override exists.

- **2026-09-27 CF-156 per-song MIDI tempo and saved BPM override:** Fixed `getHymnPdfMeta` so the synchronous MIDI path reads settled PDF metadata; unavailable Fork PDFs now use upstream fallback 76 BPM. Kidung uses detected per-song tempo when ready and applies a late result only to the active song generation. An explicit global BPM choice carries a `tempoOverride` marker and remains active across song changes and same-profile restart, preserving the route-preference requirement. Targeted metadata/MIDI tests pass 15/15; the full workspace `pnpm test` passes 329/329, Web typecheck and production Tauri build pass. Fresh packaged Edge/WebView2 smoke passes keyless Edge receive/play (33,984 bytes), MIDI controls, two full FluidSynth tracks at 220 BPM, 120 transitions (1,114,537 retained bytes after GC), and TTS/MIDI preference restore after graceful restart. Default production `dist` and EXE have no localhost test endpoint; CSP permits WebAssembly evaluation only.

- **2026-09-27 CF-157 Literature snapshot cache convergence:** Refreshed the generated official catalog to 300 entries with 299 covers. Fixed background revalidation to examine both the BFF and bundled snapshot and to report new IDs from a complete incoming catalog. The regression failed before the change and now passes; all 330 Web unit tests pass. Literature visual-reading passes 13/13. The first all-Literature Playwright run failed only at the PDF focus-wrap check (29/30); isolated repeats pass 3/3 and the full rerun passes 30/30 with no focus-code change, so the initial failure remains noted. Computer Use confirmed a persisted 299-item browser profile advances to 300 after refresh. A fresh packaged Tauri/WebView2 smoke renders 300 local Literature items while blocking 13 shell and 39 content cross-origin requests. Keyless Edge receives and plays 33,984 bytes; Bible search returns 40/80 results in 436ms; two MIDI tracks finish and auto-advance at 220 BPM, and 120 transitions complete in 207.312s with 1,204,983 retained renderer bytes after GC. Sauh withholds stale offline content and recovers after network returns. Native backup picker, Windows media transport and signed installer checks remain open.

- **2026-09-27 CF-158 current-day Sauh offline snapshot:** refreshed the bundled feed from TJC’s official category API using the existing production parser. The six newest entries now include [sbj260927, “Hidup yang Selalu Diperbaharui”](https://tjc.org/id/gerakan-baca-alkitab/sbj260927/) with its official image; the parser selects today by canonical slug even though WordPress’s modified timestamp is September 25. The 21,601-byte snapshot and pack/asset manifests pass pnpm verify:generated; Sauh unit tests pass 21/21, including an offline-mode test that verifies only the bundled feed is requested. The responsive preview shows the current article/image without console errors. A fresh packaged Tauri/WebView2 smoke passes with 16 shell and 39 content off-origin requests blocked: Sauh renders the bundled reading and returns to the same title after external requests are unblocked; Literature 300, Faith 10, Suara 164. The full smoke also passes keyless Edge playback (33,984 bytes), Bible search (40/80 in 427ms), the offline PDF fallback (419×644), two 220 BPM MIDI tracks, 120 queue transitions in 207.324s (1,168,656 retained bytes after GC), and restart persistence. Later-day freshness still requires regenerating this snapshot; native file picker, Windows media transport panel, signed installer, and provider identity checks remain open.

- **2026-09-27 CF-159 browser route history differential:** inspected pinned upstream docs/js/app-core.js and confirmed navigateTo(page) switches its in-page view without an addressable route. GYSApp intentionally adds BrowserRouter direct URLs and browser history. A focused Playwright case now verifies Kidung detail → More offline-data deep link, then Back/Forward restores the song and the linked asset section. Existing tests cover direct Kidung ?section=playlist, direct More ?section=data, and localized unknown routes. The focused browser case passes 1/1; no upstream navigation capability is missing.

- **2026-09-27 CF-160 MIDI Media Session browser parity:** a Playwright Web Media Session stub verifies current hymn metadata, play/pause/stop state, and next-track playlist routing. The focused case passes 1/1. This closes browser action coverage; the native Windows OS transport panel still needs an exposed native Computer Use session.

- **2026-09-27 CF-161 fullscreen Lyrics gestures:** Playwright verifies wheel and touch-swipe verse changes plus pinch font scaling at 320, 390, 768, 1024, and 1440px; the focused case passes 1/1. Packaged physical touch input remains unverified.

- **2026-09-27 CF-162 Suara parity scope:** pinned gyschordweb@e8e7efe has no Suara Sejati route/feed; its media-session.js handles MIDI. The GYSApp route is an official TJC text catalog/detail extension, not an audio player. The parity matrix now classifies it as an intentional divergence. Catalog/detail/localized-retry/cache-refresh E2E passes 4/4.

- **2026-09-27 CF-163 Faith reader coverage:** 16/16 focused visual/direct-flow E2E cases pass across seven catalog widths and four PDF widths, including resume, official source links, focus, unavailable state, and retry. Browser note save passes 1/1. Packaged profile renders all 10 offline topics; Faith note/PDF progress across restart remains open.

- **2026-09-27 CF-164 packaged Faith note continuity:** Tauri saves a Faith topic note through the UI, exits gracefully, and restores the note in the reopened topic. Full WebView2 smoke passes: 14 shell/39 content cross-origin requests blocked, 10 offline Faith topics, 300 Literature items, current Sauh, 164 Suara items, keyless Edge playback, Bible search in 453ms, offline PDF canvas, and two full MIDI tracks plus 120 transitions. Faith PDF progress across restart remains open.

- **2026-09-27 CF-165 service-worker activation:** the verifier exercises the real `activate` handler and confirms old `gysapp-shell-v*` caches are removed while remote-media, Bible-pack, and unrelated caches are retained; client claim completes. The focused Node test passes 5/5. A real browser upgrade/stale-content recovery run remains open.

- **2026-09-27 CF-166 eight-route responsive preference matrix:** Playwright passes 120 route/locale/theme combinations at 390×844 with 200% text and no horizontal overflow; the visual route matrix checks phone/tablet/desktop widths. Packaged restart restores Bible Continue at Yohanes 3. Browser fresh-profile coverage verifies empty activity and Sauh/Suara/Literature errors plus retry requests at 390×844; packaged error and activity transitions remain open.

- **2026-09-27 CF-167 packaged local speech voice:** the native Tauri/WebView2 smoke selects an installed local Indonesian (id-ID) voice, receives its actual utterance start event, stops it, and restores the Edge preference. The full smoke passes, including keyless Edge playback (33,984 bytes); local voice playback is verified on this Windows runtime. Other runtime voice inventories and signed-installer/upgrade verification remain open.
- **2026-09-27 CF-168 Faith PDF CORS boundary:** updated all ten Faith PDF sources to the current official S3 URLs after the old WordPress paths returned 404. Packaged WebView2 reaches S3 but PDF.js is blocked because the publisher omits CORS headers. The source BFF proxy allows this S3 path and forwards byte ranges; its focused contract test passes, while the configured live Worker still rejects S3 with 403 and the old host returns 503. This remains unverified in a packaged progress/restart flow. The native smoke reports the PDF check as skipped when `VITE_BFF_BASE_URL` is unset; no deployment was performed. Update/deploy the Worker allowlist, then rerun the packaged page-2 restore check.
- **2026-09-27 CF-169 Home empty/error/retry state:** a fresh browser profile at 390×844 with empty offline snapshots and blocked publisher traffic keeps the empty recent-reading state, renders Sauh/Suara/Literature error panels and retry actions, issues new requests on each retry, and has no horizontal overflow (1/1). Packaged feed failure and saved-activity transitions remain open.

- **2026-09-27 CF-170 Literature source parity:** the official source pages and current checkout parser return 129 testimonies, 106 Warta items, 45 Pelita Kecil items, 10 guide PDFs, and 10 books (300 total). The live public Worker returns 287, omitting nine guide PDFs and four book PDFs while exposing the accordion heading as one item. This is a deployed Worker version gap; no deploy was performed. Refresh the Worker before considering live Literature parity complete.

- **2026-09-27 CF-171 packaged Home failure recovery:** a fresh Tauri/WebView2 page receives empty offline-feed fixtures while publisher fetches are rejected. Home shows no recent activity, readable Sauh/Suara/Literature errors and retry buttons; each retry issues a new request, with no horizontal overflow. The full packaged smoke still passes keyless Edge audio (33,984 bytes), local Indonesian voice start, Bible search (40/80 in 377ms), offline PDF rendering (419×644), two full 220 BPM MIDI tracks, 120 transitions (207.216s; 599,451 retained bytes), and restart persistence. Faith PDF progress remains skipped without a configured BFF base. Next: verify Home feed recovery after connectivity returns.

- **2026-09-27 CF-172 Home retry recovery:** the 390×844 Playwright case first returns empty feed snapshots and blocks TJC publisher requests, then serves the bundled snapshots and allows publisher requests. Sauh, Suara and Literature retry actions restore their shelves and clear the error panels; the spec passes 1/1 in 9.1s. This proves browser recovery with restored data; successful retry in packaged WebView2 remains open.

- **2026-09-27 CF-173 Faith PDF range and resume:** the local BFF returns `206` for a 1,024-byte range request to an official S3 PDF and includes `Access-Control-Allow-Origin: http://tauri.localhost`; the browser resume case opens Faith PDF at page 4/10 and restores 40% progress (1/1). Packaged progress remains unverified: the live Worker still rejects S3 and a test-only localhost CSP build was rejected by shell policy before execution, with no config or binary changes.

- **2026-09-27 CF-174 packaged Home retry recovery:** the packaged smoke starts with empty feed snapshots and rejected external requests, confirms Home errors and retry requests, then re-enables the packaged snapshots. Sauh, Suara and Literature shelves return, their error panels clear, and the page has no horizontal overflow; request counts after recovery are 2/4/4. The full native smoke passes keyless Edge playback (33,984 bytes), local Indonesian voice start, Bible search (40/80 in 382ms), offline PDF render (419×644), packaged persistence, two MIDI tracks and 120 transitions (207.318s; 582,075 retained bytes). Faith PDF progress remains skipped without a configured BFF base.

- **2026-09-27 CF-175 current upstream and protocol:** fetched both remotes without changing either worktree. `GYSApp-Tauri/main` remains at `db53050`; `gyschordweb/main` remains at `e8e7efe`, matching the generated lock. The keyless live Edge protocol smoke passes today with 17,568 audio bytes in 630ms. Scheduled live and packaged workflows are present in this branch but have not run from the default branch.
- **2026-09-27 CF-176 chord cache integrity and legacy migration:** browser cache format 2 stores raw upstream bytes and verifies size/SHA on reads; versionless normalized records remain readable offline, revalidate when the source returns, and upgrade without losing pins. Web tests pass 333/333 (69 files), domain tests pass 33/33 (9 files), and web typecheck passes. Packaged WebView2 smoke corrupts a valid-JSON chord without changing its size, observes one pinned-source repair fetch and verifies the restored bytes, reloads offline with zero source requests, then seeds a legacy normalized record: the chord remains readable offline after one blocked background revalidation and upgrades to pinned raw bytes after one source fetch. Cleanup restores the prior app cache entry. The full native smoke passes with 24 shell and 46 content off-origin requests blocked, Home feed retry/recovery (2/4/4 requests), keyless Edge playback (33,984 bytes), Bible search (40/80 in 425ms), offline PDF (419×644), two MIDI tracks, 120 transitions (207.306s; 1,126,824 retained bytes), and restart persistence. Faith PDF progress is skipped without a BFF base.

- **2026-09-28 CF-177 service-worker content migration and PDF cache bounds:** bumped the shell to v21 and the native startup query to `?v=21`. Editorial JSON now lives in `gysapp-content-v1`; activation migrates existing snapshots from the newest old shell before deleting it, preserving offline content across upgrades. PDF responses bypass the shell cache. `gys-music-assets-v1` now retains up to 16 MiB of incidental PDFs and evicts oldest cached PDFs while leaving MIDI/chord entries alone; the 533 locked PDFs currently total 7,569,676 bytes, so the catalog fits. The stats read actual body bytes when Content-Length is absent. Service-worker verifier passes 7/7; music-asset tests pass 5/5, including 18 × 1 MiB PDFs with exactly 16 retained plus a MIDI entry. Chromium with real service workers seeds a v20 Sauh snapshot, returns 503 for new content, activates v21, removes v20, serves the snapshot offline and confirms a PDF response is not in Cache Storage (1/1). Web typecheck and production build pass; packaged v21 upgrade and manifest refresh remain open.

- **2026-09-28 CF-178 native service-worker install and route fallback:** shell v22 resolves core paths against the worker origin, so the install handler caches the shell and stable editorial snapshots instead of silently dropping entries inside `Promise.allSettled`. Failed navigations now fall back to cached `index.html` or `/`. The Node verifier passes 9/9. A fresh-profile packaged Tauri smoke confirms the root/index shell cache, offline route loading, empty/error/retry Home behavior, and no external requests during the offline content checks; the full smoke passes with 21 shell and 37 content requests blocked, Bible search at 427 ms, keyless Edge audio at 33,984 bytes, PDF rendering, and 120 MIDI transitions with 1,165,667 retained heap bytes. Faith PDF progress remains skipped without the BFF base. Signed upgrades, manifest refresh, and live provider freshness remain open.

- **2026-09-28 CF-179 Sauh snapshot refresh and remote-media cache recovery:** refreshed the bundled feed from TJC category 229 using normalizeSauhPosts; the official feed includes sbj260928, Buah Pertobatan, and the six newest posts through sbj260923. The corrected 22,208-byte snapshot SHA-256 is 100365498892621d909c83ac762939d93912633d27457b6ac8bb58d4be97e0f0; pack/asset manifests and six cover entries match. BFF normalization now extracts the reference from the raw article source so the featured quote keeps Matius 21:43 instead of a later body citation. Service-worker verification passes 10/10, including oldest-entry eviction and refill at the 96-item remote-media cap. BFF Sauh tests pass 9/9, Web Sauh tests 21/21, BFF build and generated provenance pass. After rebuilding Web and Tauri, the fresh-profile native WebView2 smoke blocks 23 shell and 39 content off-origin requests; Home retry recovery and offline /sauh detail both display Buah Pertobatan from the packaged snapshot. The full smoke also passes keyless Edge playback (33,984 bytes), local Indonesian voice, Bible search (40 to 80 in 451 ms), offline PDF rendering (419×644), chord cache repair and legacy migration, two MIDI tracks with 120 transitions (207.832s; 1,088,968 retained heap bytes), and restart preferences. Faith PDF progress is still skipped without a BFF base; persistent-profile upgrade remains open.

- **2026-09-28 CF-180 pinned upstream refs rechecked:** fetched both source checkouts without touching their working files. GYSApp origin/main still resolves to db53050e71857129669f620114a61d9af2eedcb4; gyschordweb origin/main still resolves to e8e7efe1189b5746a2bb542348e221844091c8d1; each checkout is 0 ahead/behind its remote, and the generated music lock uses the same upstream SHA. The active GYSApp parity worktree remains at the intended baseline with its 176 existing changed/untracked files preserved.

- **2026-09-28 CF-181 Kidung chord settings disclosure:** the Kidung settings route now keeps color presets, fill, opacity, font size, and padding collapsed under the chord appearance heading until opened. The existing native details/summary behavior preserves keyboard access, localization, and all stored controls. Focused browser coverage passes accessibility and layout checks at 320×720, 390×844, 768×1024, and 1440×900; Axe reports zero violations with settings expanded. Screenshot evidence reviewed at 390×844 and 1440×900.

- **2026-09-28 CF-182 MIDI tempo interaction:** updated the transport E2E to follow the active hymn's tempo instead of assuming 120 BPM; hymn-002's PDF default is 76 BPM and ArrowRight correctly produces 77 BPM. The focused case passes, the full 324-case Chromium suite passes 321 with three BFF-gated cases passing separately against mocked local assets, and full workspace, web quality, generated-data, documentation, chord-audit, and native Rust gates pass. Remaining native/runtime frontiers: persistent-profile upgrade, backup file picker, OS media panel, and signed installer; public Worker refresh is external and was not deployed.

- **2026-09-28 CF-183 Bible split verse anchors:** wired the existing count-aware verse mapper into both split-scroll directions, preserving within-verse progress and proportional fallback. The synthetic uneven-row Chromium test first failed at visible anchors 98/100 and now passes in both directions; all three Bible split smoke cases, the five-width layout case, split unit tests 7/7, 334 Web tests, lint, and typecheck pass. A separate optional run with the official 2026.05.21 KJV GYSPKG (1,935,399 bytes; SHA-256 `9c2e7e76794c764ae5871aa2b0e196cb72453fb64797b2fab703d9da97f74838`) installs and decodes the actual package, reads Genesis 1:1, verifies TB/KJV split anchors in both directions, then removes/reinstalls and reads KJV again after request mocks are removed; it also confirms both panes remain readable after the browser loses network access (1/1). Secondary-pack retry remains open; packaged split persistence passes in CF-185.
- **2026-09-28 CF-184 keyless Edge protocol freshness:** the live Node smoke generated 17,568 Indonesian MP3 bytes in 746ms without an API key. GitHub run history has no scheduled execution for the new workflow; it remains in the unpushed worktree by instruction.
- **2026-09-28 CF-185 packaged Bible split persistence:** the fresh-profile native WebView2 smoke stores split mode, sync scrolling, and a 52% divider; after graceful exit and same-profile restart offline, it confirms both the actual downloaded KJV pane and bundled TB pane remain readable. The full eight-asset lifecycle smoke passes, including retry, package updates, removal/reinstall, offline reads, and MIDI playback. A temporary localhost BFF/CSP build was used and the original production binary was restored by checksum; no deploy occurred. Secondary-pack retry while the split reader remains mounted is still open.
- **2026-09-28 CF-186 mounted Bible offline retry:** prevents Vite's preload recovery from clearing app caches and navigating away when an optional SQLite chunk is unavailable offline. Bible package installation now warms the SQLite/WASM runtime. The official KJV package installs from a second browser page; after network loss, Retry loads Genesis 1:1 in the mounted split pane with the Service Worker enabled and no SQLite JS/WASM request failure (1/1). The standard distributed-assets E2E passes 4/4. Remaining proof: first KJV read after a packaged offline restart before any online read.
- **2026-09-28 CF-187 first packaged Bible read offline:** installed and updated the official KJV without reading it, confirmed the SQLite runtime JS/WASM were saved in the WebView2 Service Worker shell cache, then closed Tauri and restarted the same profile offline. The saved split reader opened and rendered KJV Genesis 1:1 beside bundled TB on its first ever KJV read in that profile. Full eight-asset update/retry/remove/reinstall and offline MIDI/PDF/Bible smoke passes; the production executable was restored with matching SHA-256 after the local test build.
- **2026-09-28 CF-188 packaged Faith PDF progress and keyless Edge TTS:** native WebView2 restores Faith PDF page 2/26 after graceful restart using a temporary localhost BFF/CSP test build. With `EDGE_TTS_URL` unset, Web Speech selects local Microsoft Andika while Edge Neural `id-ID-GadisNeural` returns and plays 33,984 audio bytes; pause/resume/stop and repeat requests pass. Two full upstream MIDI tracks auto-advance at 220 BPM and 120 short transitions retain 747,792 renderer-heap bytes after GC. The harness now closes the restored Faith notes modal before opening its PDF. The production executable was restored by checksum (`EE87CFCC269702F73518A33E9A1ED7D29915B84BB6C0D2BA090EB3C400C8F560`); the live Worker still needs its external S3 allowlist updated before the PDF flow is verified through its deployed route. Signed installer/upgrade, native picker, and OS media controls remain open.
- **2026-09-28 CF-189 backup integrity and picker boundary:** the focused browser backup suite passes 5/5 for encrypted export/round-trip, portable-only import, password-free legacy import, and malformed-file preservation. Packaged Tauri shows the Backup & import panel and its native Choose File control. The OS picker itself remains unverified: Computer Use lost the foreground process identity after activation (`foreground window did not report a process id`), then its recovered window ID was stale (3016640 vs current GYSApp ID 198338). No file was selected or imported. Native picker and packaged cross-version restore remain open.
- **2026-09-28 CF-190 baseline-to-current native profile continuity:** baseline Tauri at db53050 and the current worktree binary were launched sequentially with one isolated WEBVIEW2_USER_DATA_FOLDER and the same http://tauri.localhost origin. Baseline persisted locale=en/theme=dark, density=compact/font=sans and a marker, then closed gracefully. Current WebView2 restored identical storage values and rendered data-theme=dark and data-ui-density=compact. Current executable SHA-256 remains EE87CFCC269702F73518A33E9A1ED7D29915B84BB6C0D2BA090EB3C400C8F560. This proves same-profile continuity between unsigned binaries; signed installer/updater migration and native picker remain open.
- **2026-09-28 CF-191 packaged cold first launch:** the current packaged Tauri executable starts from a newly created, verified-empty WebView2 profile and renders Home at http://tauri.localhost with default locale id, light theme and standard density; no profile-continuity marker exists. The same smoke passes baseline-to-current settings continuity immediately beforehand. This proves first paint from an empty local profile, not offline freshness of remote feeds. Signed installer/upgrade, native picker, and OS media controls remain open.
- **2026-09-28 CF-192 MIDI track-switch defaults:** comparison with `gyschordweb` `viewer-core.js` at `e8e7efe1189b5746a2bb542348e221844091c8d1` confirmed each new track resets transpose to its PDF/natural-chord target. Direct reader and playlist queue now pass that target with PDF-derived tempo, and late metadata updates preserve manual transpose changes; the deliberate global BPM override remains active across tracks. Web tests pass 338/338, typecheck and production build pass, and the local 5188 Kidung reader was inspected at 1280×720. Playback through the browser was not exercised because its SoundFont package is absent; packaged upgrade, native picker, and OS media controls remain open.
- **2026-09-28 CF-193 Literature offline PDF recovery:** PDF bytes are validated before they enter the shared asset cache; an invalid cached response is evicted so Retry can fetch a valid file. Playwright passes the complete download, online render, offline reload and cached render flow with one PDF request. Computer Use confirms the local catalog shows 300 titles and the live Kitab Markus PDF renders page 1/324; this is online-reader evidence only. The unrelated live Literature Worker still returns 287 items against the 300-item bundled snapshot, so feed freshness and deployed asset routing remain open.
- **2026-09-28 CF-194 Kidung search corpus and locale parity:** the full-catalog differential now compares canonical numbers, every title and verse, cross-field AND terms, and each collection with the upstream search rule pinned at `e8e7efe1189b5746a2bb542348e221844091c8d1`. The localized Playwright flow checks both number and lyric AND searches in ID/EN/ZH (1/1); the Web unit suite passes 339/339 and the focused corpus differential 1/1 in 4.04s. Quoted phrases and accent folding remain documented GYSApp extensions.
- **2026-09-28 CF-195 packaged runtime and MIDI render continuity:** reapplying an unchanged PDF-derived tempo or transpose now returns before invalidating an active FluidSynth render; the regression test reproduces the prior worker cancellation. `pnpm test` passes 340/340 Web tests. An isolated rebuilt Tauri/WebView2 smoke passes keyless Edge TTS (33,984 bytes, pause/resume/stop/repeat), local Indonesian voice, fresh/offline shell (17 shell and 39 content requests blocked), Bible search 40→80 in 441ms, verified cached PDF/MIDI/SoundFont playback, cache repair, and preference restore after restart. Two full upstream tracks auto-advance at 220 BPM; 120 further transitions retain a net -3,650,981 renderer-heap bytes after GC. Reopening hymn-001 applies its canonical transpose target (0); the prior manual -2 value had been restored from storage before the track load. Faith PDF page progress is skipped because no BFF base is configured; signed installer, native picker, Windows media panel, and provider-side PDF CORS remain open.
- **2026-09-28 CF-196 Bible visual-test readiness:** the Bible search 390×844 screenshot now waits for document fonts and three render frames after opening search; the focused Playwright case passes 5/5 without snapshot changes. The preceding full release run exited successfully with 322 passed, three BFF-gated skips, and one Bible screenshot pass on retry. This is a test-only stabilization; the full suite was not rerun after it. Signed installer, native picker, Windows media panel, and provider-side PDF CORS remain open.
- **2026-09-28 CF-197 Bible search visual baseline and final E2E:** focused Bible search visuals pass 15/15 with five repetitions per case and no retries. The final `pnpm test:e2e` run passes 323 tests, skips three BFF-gated cases, and reports zero failures in 8.5 minutes. Refreshed only the 390×844 and 1440×900 Bible-search snapshots plus the 1440×900 filter snapshot after reviewing them: the desktop locator could shift the viewport 7 px before application focus, and the mobile render includes a stable 7 px top offset that the previous baseline omitted. Snapshot setup now normalizes the viewport and waits for fonts/render frames. This is test and baseline maintenance; no product code changed in CF-197. Signed installer/upgrade, native picker, Windows media controls, live feed freshness, and provider PDF CORS remain dependent on their external environments.
