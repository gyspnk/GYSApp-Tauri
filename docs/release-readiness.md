# Release readiness ledger

The rewrite is intentionally milestone-driven:

- **Preview:** typed contracts, domain ports, BFF boundary, Quiet Sanctuary
  shell, offline TB/lyrics/faith/TimGM pack, reader and hymn browser, and
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

## Current evidence

- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`,
  `pnpm verify:generated`, `pnpm verify:bundle`, and `pnpm audit --prod` pass.
- CI uses one concurrency group per source branch so a push plus its pull
  request do not duplicate the native and browser release gates; newer source
  commits cancel older verification runs.
- The initial web application chunk is **85.1 KiB gzip**; the complete initial
  JavaScript set is **173.4 KiB gzip** in the latest local verification after
  the Sauh/native-auth hardening slice. The
  latest five-sample shell benchmark records a sub-250 ms p95 navigation
  response in CI (the five samples are retained in the run log and vary by
  runner). PDF.js, its worker, and the TB search
  worker remain lazy chunks, and the bundle gate fails if the initial
  application chunk exceeds 250 KiB gzip. FluidSynth/WASM and the 6 MB TimGM soundfont are served as
  same-origin on-demand/PWA assets rather than inflating the initial chunk.
- The v10 service-worker install path precaches only the shell and compact
  offline indexes. The soundfont and MIDI/FluidSynth binaries are warmed after
  the first usable frame, independently and only when Save-Data/2G is not
  advertised; this keeps activation and first paint off the heavy-asset path.
  Registration is progressive enhancement: reduced webview service-worker
  objects—including an undefined registration result—are guarded and failures
  are recorded without taking down the shell.
  Cross-origin TJC cover/media responses are restricted to the verified TJC
  image origin and pruned to a 96-entry bounded cache on activation and use,
  so normal browsing cannot grow PWA storage without limit; pinned downloads
  continue through the versioned asset manager.
  The generated asset manifest now inventories bundled music seeds, so
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
  current suite has 42 passing flows, including split-reader keyboard resize,
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
  canonical PDFs: all 144 files and 3291 note-aligned entries resolve to a
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
- e-GYS provider exchange is tested as an ID-token-in / HttpOnly-cookie-out
  flow. The public BFF validates the upstream `SignInResponse` and normalizes
  the upstream WhatsApp READY response without returning session credentials;
  provider SDK/popup flows have explicit timeout and cancellation guards.
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
  HTTPS-validated; no static Edge voice list is shown when it is absent. It
  remains unavailable until a protected `EDGE_TTS_URL` gateway is supplied.
  While a verse range is playing, the reader marks and scrolls the active verse
  and the expanded global media surface exposes previous/next verse controls;
  the behavior is covered by the shared read-aloud Playwright flow.
- Cookie-authenticated BFF mutations now reject requests without an allowlisted
  `Origin` or same-site Fetch Metadata signal; the native adapter uses the
  explicit `x-gys-client: native` marker and the policy has contract coverage.
  Tauri no longer injects browser Google/Apple SDK scripts under its strict CSP;
  native provider controls expose the protected SDK/client-ID prerequisite,
  while WhatsApp uses the system-browser handoff.
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
