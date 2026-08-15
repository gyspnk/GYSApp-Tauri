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
- The initial web application chunk is **83.8 KiB gzip**; the complete initial
  JavaScript set is **162.2 KiB gzip** in the latest local verification. PDF.js, its worker, and the TB search
  worker remain lazy chunks, and the bundle gate fails if the initial
  application chunk exceeds 250 KiB gzip. FluidSynth/WASM and the 6 MB TimGM soundfont are served as
  same-origin on-demand/PWA assets rather than inflating the initial chunk.
- The v9 service-worker install path precaches only the shell and compact
  offline indexes. The soundfont and MIDI/FluidSynth binaries are warmed after
  the first usable frame, independently and only when Save-Data/2G is not
  advertised; this keeps activation and first paint off the heavy-asset path.
  Registration is progressive enhancement: reduced webview service-worker
  objects—including an undefined registration result—are guarded and failures
  are recorded without taking down the shell.
  The generated asset manifest now inventories bundled music seeds, so
  remote-only MIDI/PDF assets skip known-missing Pages probes before using the
  verified immutable source.
  The favicon and PWA manifest use a square official-logo mark with
  Pages-relative paths; runtime-health coverage checks the asset response and
  rejects browser metadata warnings. The shell cache version is bumped with
  the metadata change so existing PWA clients receive the corrected manifest.
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
  current suite has 36 passing flows, including split-reader keyboard resize,
  Bible title-drag chapter navigation, contextual selection actions, internal
  Sauh/Suara/article readers, persistent/minimizable media with source return,
  explicit article scroll-resume navigation, MIDI queue
  persistence, canonical chord fetch and PDF chord-overlay rendering,
  GYSApp-Fork PDF viewer/download, and MIDI loading. The PDF smoke also waits
  for a non-zero rendered canvas and a real download link; the MIDI flow checks
  minimize/restore on the shared media surface.
  Literature PDF failures now expose an in-shell `Coba lagi` action, and the
  shared PDF reader cleans up loaded documents and virtualized page resources
  when a route, song, or retry changes, preventing stale worker/page buffers
  from accumulating during rapid navigation.
- The release suite includes forced PDF and Sauh upstream failure flows that keep the
  user inside the hymn shell and exposes a `Coba lagi` recovery action. The
  Sauh flow proves that no fabricated Daily Verse is shown when the source is
  unavailable. The performance flow records five first-contentful-paint/
  navigation samples, reports median and p95 timing, and fails on duplicate
  initial application-module requests.
- Axe runs on the Home and Kidung surfaces with zero violations (including
  color contrast), and a mobile Bible keyboard smoke
  keeps a visible focus target after navigation. The light-theme muted token
  is 5.7:1 against white; the audit is kept in the release suite through the
  `@axe-core/playwright` dev dependency.
- Kidung detail now has an automated presentation assertion: Lirik and PDF are
  the only viewer modes; Chord is a shared visibility capability and never a
  third surface. The native boundary check passes with 18 required
  offline/runtime assets totaling 36,845,594
  bytes in the current build; this is a packaging proof, not a signed
  installer artifact. The chord E2E additionally asserts that canonical
  note-aligned PDF layout rows and DOM overlay markers are rendered (not only
  a flat chord list), and
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
- Tauri webviews now select the native app-data adapter through the global
  invoke bridge. Key-value records and verified chord/media blobs use
  path-safe keys and unique-temp-file atomic replacement; Rust tests cover
  traversal safety and replacement cleanup. Unsupported native capabilities
  report `false` instead of showing an unimplemented control.
- BFF environment source bindings are HTTPS-only and TJC-origin allowlisted;
  insecure e-GYS and non-TJC Sauh/Literature/Suara overrides are ignored, so
  only the packaged Sauh snapshot or canonical TJC defaults remain eligible for
  fetching. `pnpm verify:docs` enforces the living architecture/release
  documentation map in local hooks, CI, and Pages builds.
- The Windows native CI job now runs `cargo fmt --check`, `cargo check`,
  `cargo test`, and `cargo clippy --all-targets -- -D warnings`; native
  packaging remains separate from signed installer evidence.
- e-GYS provider exchange is tested as an ID-token-in / HttpOnly-cookie-out
  flow. The public BFF validates the upstream `SignInResponse` and normalizes
  the upstream WhatsApp READY response without returning session credentials;
  provider SDK/popup flows have explicit timeout and cancellation guards.
  The generated upstream contract records the verified Springdoc runtime
  document boundary (`/v3/api-docs`, Swagger UI path, and enablement property);
  concrete request/response schemas remain source-owned until that runtime
  document is available to the authenticated sync step.
- The optional `POST /api/v1/tts/edge` boundary is schema-validated, HTTPS-only,
  tested through the BFF, and selected from the reader as `auto` (Edge then
  local), `edge`, or `local`. The optional voice catalog is also schema- and
  HTTPS-validated; no static Edge voice list is shown when it is absent. It
  remains unavailable until a protected `EDGE_TTS_URL` gateway is supplied.
- GitHub Pages now builds the complete workspace, verifies generated
  provenance, enforces the bundle budget, and is live at
  https://gyspnk.github.io/GYSApp-Tauri/ from the protected preview branch.
  The Pages environment permits `main` and the named preview branch; the
  protected `main` branch remains the production promotion gate.

`pages.yml` is the GitHub Pages Preview pipeline. `worker.yml` is deliberately
manual and no-ops unless protected `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` secrets are present.
