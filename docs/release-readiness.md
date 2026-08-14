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
- The initial web application chunk is **100.9 KiB gzip**; the complete initial
  JavaScript set is **135.7 KiB gzip**. PDF.js and its worker remain lazy
  chunks, and the bundle gate fails if the initial application chunk exceeds
  250 KiB gzip.
- Playwright smoke coverage passes at desktop and 390px mobile widths, with
  exactly one navigation surface and no horizontal overflow. In-app Browser
  could not reach the local Windows preview (`ERR_CONNECTION_REFUSED`), so the
  same visual QA was captured with the repository's Chromium runner.
- GitHub Pages now builds the complete workspace, verifies generated
  provenance, enforces the bundle budget, and is live at
  https://gyspnk.github.io/GYSApp-Tauri/ from the protected preview branch.
  The Pages environment permits `main` and the named preview branch; the
  protected `main` branch remains the production promotion gate.

`pages.yml` is the GitHub Pages Preview pipeline. `worker.yml` is deliberately
manual and no-ops unless protected `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` secrets are present.
