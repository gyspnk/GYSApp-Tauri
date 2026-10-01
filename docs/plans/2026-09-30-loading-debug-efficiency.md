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

- Bible chapter rendering and verse text parsing have separate modules. Verse
  text memoization avoids reparsing during unrelated reader state changes;
  query expressions are compiled once per query and reused across styled segments.
  Next/secondary chapter filtering now follows navigation and pack changes.
- Selective checks for Bible renderer modules include annotation migration,
  visual and accessibility contracts without filtering away legacy test titles.

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
the expanded browser command records fresh-browser, fresh-context, warm and
prepared-offline conditions. Packaged process/profile evidence remains separate.

## Roadmap implementation and remaining acceptance gates

The 2026-10-01 continuation implements loading/data separation, module boundaries,
ordered CSS ownership, audio selectors, component-scoped PDF observers, safe
versioned offline updates and conservative verification selection. It adds a
90-case UI matrix, source-byte parity audit, four 30-sample browser conditions,
short native suites and 30-process native profiling while retaining the full
soak/live-provider gate. The implementation/evidence table, exact limitations,
and repeatable commands are maintained in
[the dated validation receipt](../performance/2026-10-01-roadmap-validation.md).

Remaining acceptance gates:

1. Reference hardware, cold OS/filesystem cache, first signed native installation,
   and physical audio first sample; browser profile/renderer metrics and CI
   packaged process relaunches are labeled separately.
2. Physical touch, native OS file picker and Windows media-panel behavior.
3. Signed in-place installation/upgrade with retained user profile. Interrupted
   PWA downloads, mixed builds, cache integrity and migration have automated guards.
4. Configured/deployed BFF CORS and native Faith PDF page-progress restart;
   official PDF range delivery alone cannot close this gate.
5. Protected authenticated-provider behavior and source freshness beyond the
   specific dated read-only official-source receipt.

Further module extraction, historical cross-layer CSS cleanup, per-book packs,
SQLite pooling or binary IPC should follow measured coupling/cost and prove a
win. Existing geometry, source provenance, atomic integrity and capability
limits remain acceptance requirements.

Initial device targets: warm shell p95 <=500ms, cold native shell <=1000ms,
local catalog <=500ms, local chapter <=700ms, reader revisit <=200ms,
indexed search <=150ms, local PDF first page <=1000ms and CLS <=0.10.
These are acceptance targets to calibrate on reference hardware, not results.

Recorded local production-preview result: 30 same-profile navigations,
greeting-ready median 402.2ms and p95 496.5ms. The first navigation is included;
this is not an OS/process startup measurement or remote-feed readiness claim.
The preceding debug/typography implementation passes full CI at `647e6c8`
(337 browser cases, three BFF-gated skips, no flaky retries) and packaged-native
Windows/WebView2 smoke. The Kidung section and Bible-rendering extraction passed final-head CI/native at
`0110337` (341 browser passes, three BFF skips, no flaky retries). The 2026-10-01
continuation requires its own final-head verification recorded on PR #9.

No full-roadmap completion or physical-device parity claim is made until these
gates have recorded evidence.

Additional iteration commands: `pnpm test:native:quick [startup|storage|media|assets]`,
`pnpm test:native:soak`, `pnpm test:performance:native`, and
`pnpm test:performance:browser-roadmap`. Windows suites require the packaged
executable; browser profiling requires a current production preview.
