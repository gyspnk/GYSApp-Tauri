# Loading, debug efficiency and UI implementation

Baseline: GYSApp-Tauri `287d48c`, gyschordweb `e8e7efe`.
Primary native validation: Windows/WebView2. Android needs device verification.
Initial commits were prepared through the GitHub connector while the session
executor was unavailable. Local verification resumed when the workspace became
ready. CI timings are not device-startup guarantees.

## Implemented foundations

- Shared, retryable bundled TB request and parsed pack for reading, split and
  global search; subscriber cancellation does not abort another consumer.
- Main-thread Bible search repository constructed only when fallback is used.
- Home and its editorial repositories load as a separate route chunk. The
  media dock loads when a session opens; Bible header controls load on their
  reader route; playback arbitration remains in the
  shell, which observes status changes instead of every position update.
- Bible typography persists from the click handler rather than a replayable
  React state updater, so StrictMode applies one font step per click.
- Development image proxy requests have a shared three-second deadline across
  publisher fallbacks, freeing local-origin connections for route modules.
- Readability controls mount inside More rather than observing all body DOM
  mutations while other pages are open.
- Device reset belongs to an application service rather than the More page.
- Vite manifest traversal includes transitive static imports and excludes lazy
  routes/workers; retain existing 180 KiB graph and 250 KiB entry limits.
- Stale chunk recovery clears only app shell caches and reloads even when cache
  enumeration fails; verified assets and editorial caches remain intact.
- Pre-commit checks staged text without rewriting or syncing external sources.
- Default pre-push runs deterministic format, docs, provenance, type and unit
  checks. `pnpm verify:release` retains the full original verification plan.
- `pnpm dev:native`, `pnpm test:watch`, `pnpm test:e2e:ui` and
  `pnpm test:performance` provide explicit iteration paths.
- `pnpm test:e2e:dev --ui` serves Vite/HMR with only workspace dependencies
  built; CI and prebuilt verification reject this development mode.
- Performance smoke uses five samples and attaches JSON. A browser frame
  marker separates greeting readiness from host test polling; dedicated performance
  runs use 30 samples and one worker. Missing paint metrics are null.
- Packaged-native workflow caches Rust dependency and release target artifacts.
- Selective test execution fails on missing processes or signal termination.
- Kidung routes load catalog, reader, playlists and settings independently;
  settings skip catalog/music-lock fetches, and playlist skips music-lock fetch.
  Shared navigation/formatters and MIDI controls have explicit ownership.
- Catalog queue buttons subscribe to the queue snapshot, so pressed state and
  accessible labels update immediately without changing search or reloading.
- The shell queue coordinator loads PDF-derived song defaults only when audio
  is requested, in parallel with catalog loading. Tempo/transpose rules remain
  unchanged. The initial JavaScript graph is 177.8 KiB gzip locally.
- A generated build-asset manifest prepares hashed lazy code in the service
  worker after page load without executing modules. Prepared catalog can open
  previously unvisited settings, playlist and text reader offline. Native and
  PWA shell ownership, editorial caches and explicit music downloads stay
  separate; interrupted/signed upgrades remain separate acceptance gates.
- Selective verification includes loading, offline sections, playlist parity, visual and
  accessibility contracts for every extracted Kidung section.

## Commands

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm verify:bundle
pnpm test:e2e
pnpm dev:native
pnpm test:watch
pnpm test:e2e:ui
pnpm test:e2e:dev --ui
pnpm test:performance
pnpm verify:release
```

Use `GYS_E2E_PREBUILT=1` only after building the current source. Unit/watch
commands need built workspace packages on a clean checkout. The performance
command uses the current preview build and records same-browser navigations;
cold-process and fresh-profile benchmarks are still separate required work.

## Remaining implementation and acceptance gates

1. Record cold-process, warm-relaunch, first-install, same-profile restart and
   offline benchmarks with at least 30 samples per condition. Measure shell,
   real content, search readiness, PDF first page and audio first sample
   separately; include total app/WebView/worker memory.
2. Continue extracting the shell from App; continue extracting the Kidung reader internals
   and Bible search/notes/split. Kidung catalog, settings and playlists now
   have independent modules and lazy route boundaries. Retain
   route, focus, playback, offline and persistence contracts.
3. Separate catalog metadata from lyrics/search payload. Show the active Bible
   chapter before whole-pack indexing; profile parsing and cloning before
   deciding on per-book/chapter packs. Optional installed-pack invalidation
   must follow release hashes, updates, uninstall and retry.
4. Consolidate CSS ownership, tokens and cascade. Preserve existing reviewed
   geometry; check 320/390/768/1024/1440/1920 widths, ID/EN/ZH, five themes,
   200% text, 44px controls, keyboard focus and reduced motion.
5. Select audio state subscriptions so position ticks update the transport
   rather than the whole shell. Scope DOM observers to component lifecycles
   and clean listeners/timers on unmount and HMR.
6. Make app updates safe during reading, editing and playback. Keep versioned
   shell and core data available offline; test interrupted update, stale
   chunk, eviction and profile migration.
7. Profile native SQLite connection setup and base64 blob IPC. Change those
   boundaries only with measured wins, capability limits and atomic integrity
   tests. Split native smoke into short startup/storage/media/asset suites and
   a separate long soak/live-provider suite.
8. Expand differential parity tests against the pinned upstream. Retain all
   533 catalog songs, 161 chord mappings, MIDI defaults, transport and playlist
   import/export. Close physical touch, native picker, Windows media panel and
   signed in-place upgrade evidence.
9. Verify live Literature freshness and Faith PDF delivery separately from
   local fixtures. Keep protected authenticated provider behavior explicit.
10. Replace source-string UI assertions with behavior/computed-style tests as
    affected components are extracted. Dependency-aware test selection must
    broaden coverage for unknown shared changes.

Initial device targets: warm shell p95 <=500ms, cold native shell <=1000ms,
local catalog <=500ms, local chapter <=700ms, reader revisit <=200ms,
indexed search <=150ms, local PDF first page <=1000ms and CLS <=0.10.
These are acceptance targets to calibrate on reference hardware, not results.

Recorded local production-preview result: 30 same-profile navigations,
greeting-ready median 402.2ms and p95 496.5ms. The first navigation is included;
this is not an OS/process startup measurement or remote-feed readiness claim.
The preceding debug/typography implementation passes full CI at `647e6c8`
(337 browser cases, three BFF-gated skips, no flaky retries) and packaged-native
Windows/WebView2 smoke. The Kidung section extraction requires its own final-head
CI before completion; local loading and queue regressions provide focused proof.

No full-roadmap completion or physical-device parity claim is made until these
gates have recorded evidence.
