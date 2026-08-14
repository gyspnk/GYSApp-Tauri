# GYSApp-Tauri

Clean-room, offline-first companion for GYS hymn, Bible, chord, MIDI, and
faith content. The project is a public MIT pnpm monorepo with a React web/PWA,
Hono BFF, and Tauri native shell.

## Status

The rewrite starts from an empty history. Functional discovery is sourced from
`ThenGB/GYSAPP-Fork@4f0d39b`; canonical music and assets are sourced from
`gyspnk/gyschordweb@cbc7d386`. Both upstreams are read-only. Discovery evidence,
provenance, and architectural decisions live in [`docs/`](./docs).

The current Preview/Beta implementation provides typed contracts, a testable
domain boundary, the Quiet Sanctuary web shell, a secure BFF boundary, local
TB Bible/hymn/faith readers, a lazy PDF reader backed by the GYSApp-Fork
hymnal database, canonical GYSChordWeb chord/MIDI assets, real TJC literature
and Suara Sejati feeds, today's Sauh Bagi Jiwa, encrypted backup/import, and a
native e-GYS session/profile adapter. Literature keeps a persistent “Terakhir
dilihat” shelf with version-aware page resume, while the local PDF.js reader
uses an allowlisted BFF range proxy when deployed. Kidung prefetches only the
next/previous binary music assets and never eagerly downloads heavy PDFs.
Upstream-backed features keep checked-in, integrity-verified snapshots and a
generated asset manifest so the app remains useful offline and can revalidate
without downloading unchanged assets.

## Architecture at a glance

```mermaid
flowchart LR
  UI[React/Tauri UI] --> DOMAIN[Domain repositories]
  DOMAIN --> LOCAL[Versioned local persistence]
  DOMAIN --> BFF[Hono BFF]
  BFF --> CONTENT[TJC + canonical music assets]
  BFF --> EGYS[e-GYS API]
  EGYS -->|HttpOnly gys_session| BFF
```

The UI never imports raw upstream source. `packages/contracts` validates every
boundary, `packages/domain` owns reusable reader/cache/media behavior, the BFF
handles origin/security/cookie concerns, and `scripts/sync-egys.mjs` produces
only reviewed derived contract metadata from an ignored local e-GYS checkout.
The e-GYS login boundary uses the provider's official browser/native SDK; after
the ID-token exchange, profile and membership data are API-driven rather than
rendered through a WebView.

## Development

```bash
corepack enable
pnpm install
pnpm test
pnpm typecheck
pnpm build
pnpm dev
```

`pnpm install` enables the repository-managed `.githooks` path. Before a
commit, the hook checks the private e-GYS remote revision locally, rebuilds the
reviewable route contract when it changes, blocks breaking route removals, and
runs targeted contract/domain tests. Before a push it repeats the upstream
check and runs the full local quality gate. Use `pnpm sync:egys` to refresh the
lock deliberately; credentials are taken from the developer's existing Git
credential manager/SSH setup and are never written to the repository. See
[`docs/egys-integration.md`](./docs/egys-integration.md) for the contract and
hook flow.

## Documentation map

- [`docs/architecture.md`](./docs/architecture.md) — module boundaries,
  persistence, asset lifecycle, Mermaid diagrams, and release gates.
- [`docs/egys-integration.md`](./docs/egys-integration.md) — verified e-GYS
  auth contract, browser/native authentication boundary, API profile mapping,
  synchronization, and sequence diagrams.
- [`docs/discovery/`](./docs/discovery/) — source provenance, generated locks,
  contract snapshots, and discovery evidence.
- [`docs/release-readiness.md`](./docs/release-readiness.md) — Preview/Beta/GA
  evidence ledger and protected deployment prerequisites.
- [`PROGRESS.md`](./PROGRESS.md) — honest implementation and verification
  status.
- [`CHANGELOG.md`](./CHANGELOG.md) — user-visible changes in the current
  hardening slice.

Node 24 and pnpm 11 are used in CI. PDF.js, fonts, and application code are
bundled locally; Google/Apple sign-in SDKs are loaded only after the user
chooses a provider and are never required for browsing. e-GYS and BFF
credentials remain deployment secrets.

## Delivery and performance

The web app is configured for a GitHub Pages project deployment at
`/GYSApp-Tauri/`. The Pages workflow builds every workspace package, verifies
generated provenance, runs the bundle budget, and publishes the static PWA.
The current production baseline is approximately 99.2 KiB gzip for the main
application chunk and 127.9 KiB gzip for all initial JavaScript; PDF.js and its
worker stay lazy-loaded. Use `pnpm verify:bundle` to check the budget locally.

The shell uses one responsive navigation surface across desktop, rail, and
mobile breakpoints. Offline TB/hymn/faith packs remain local, while larger
Bible database, PDF, MIDI, and chord assets are loaded on demand, verified by
size/hash, and cached by source version to keep first install and first paint
predictable.

## Deployment prerequisites

Pushes to `main` and `codex/**` trigger GitHub Pages. Configure the repository's
Pages source as **GitHub Actions**. The optional Worker workflow needs
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`; set `EGYS_API_BASE_URL` and
`EGYS_UPSTREAM_COMMIT` as protected Worker variables/secrets when the e-GYS
backend is ready. If the e-GYS repository is private, set the optional
`EGYS_UPSTREAM_TOKEN` repository secret so the scheduled provenance check can
read its immutable `HEAD`; an unavailable upstream is retained as a warning,
not fabricated as a new version. Without the protected deployment values, the web build still works
and shows an honest unavailable-session state instead of fabricating account
data.

## License

MIT. Upstream provenance and asset licensing notes are documented in
[`docs/discovery/asset-inventory.md`](./docs/discovery/asset-inventory.md).
