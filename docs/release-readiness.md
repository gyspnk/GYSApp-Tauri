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
- The initial web application chunk is **80.1 KiB gzip**; the complete initial
  JavaScript set is **153.2 KiB gzip**. PDF.js, its worker, and the TB search
  worker remain lazy chunks, and the bundle gate fails if the initial
  application chunk exceeds 250 KiB gzip. FluidSynth/WASM and the 6 MB TimGM soundfont are served as
  same-origin on-demand/PWA assets rather than inflating the initial chunk.
- The v8 service-worker install path precaches only the shell and compact
  offline indexes. The soundfont and MIDI/FluidSynth binaries are warmed after
  the first usable frame, independently and only when Save-Data/2G is not
  advertised; this keeps activation and first paint off the heavy-asset path.
- Playwright smoke coverage passes at desktop and 390px mobile widths, with
  exactly one navigation surface and no horizontal overflow. In-app Browser
  could not reach the local Windows preview (`ERR_CONNECTION_REFUSED`), so the
  same visual QA was captured with the repository's Chromium runner. The
  current suite has 20 passing flows, including split-reader keyboard resize,
  Bible title-drag chapter navigation, contextual selection actions, internal
  Sauh/Suara/article readers, persistent/minimizable media with source return,
  MIDI queue
  persistence, canonical chord fetch,
  GYSApp-Fork PDF viewer/download, and MIDI loading.
- Kidung detail now has an automated mutual-exclusion assertion: the Lirik,
  Chord, and PDF tabs unmount the other viewer surfaces. The native boundary
  check passes with 17 required offline/runtime assets totaling 36,844,871
  bytes in the current build; this is a packaging proof, not a signed
  installer artifact. The chord E2E additionally asserts that canonical
  note-aligned PDF layout rows are rendered (not only a flat chord list), and
  domain/web tests cover simultaneous chord fetch deduplication and the 96 MB
  MIDI render-cache contract.
- e-GYS provider exchange is tested as an ID-token-in / HttpOnly-cookie-out
  flow. The public BFF validates the upstream `SignInResponse` and normalizes
  the upstream WhatsApp READY response without returning session credentials;
  provider SDK/popup flows have explicit timeout and cancellation guards.
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
