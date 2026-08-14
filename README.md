# GYSApp-Tauri

Clean-room, offline-first companion for GYS hymn, Bible, chord, MIDI, and
faith content. The project is a public MIT pnpm monorepo with a React web/PWA,
Hono BFF, and Tauri native shell.

## Status

The rewrite starts from an empty history. Functional discovery is sourced from
`ThenGB/GYSAPP-Fork@4f0d39b`; canonical music and assets are sourced from
`gyspnk/gyschordweb@cbc7d386`. Both upstreams are read-only. Discovery evidence,
provenance, and architectural decisions live in [`docs/`](./docs).

The Preview implementation provides typed contracts, a testable domain
boundary, the Quiet Sanctuary web shell, a secure BFF boundary, local TB
Bible/hymn/faith readers, a lazy PDF reader, and MIDI/chord/backup state
machines. Remaining parity work is tracked by milestone and is intentionally
not represented as complete until its acceptance evidence exists.

## Development

```bash
corepack enable
pnpm install
pnpm test
pnpm typecheck
pnpm build
pnpm dev
```

Node 24 and pnpm 11 are used in CI. No runtime CDN assets or client secrets are
required for local development.

## Delivery and performance

The web app is configured for a GitHub Pages project deployment at
`/GYSApp-Tauri/`. The Pages workflow builds every workspace package, verifies
generated provenance, and enforces the initial JavaScript budget. The current
baseline is 78.8 KiB gzip for the main application chunk and 107.5 KiB gzip for
all initial JavaScript; PDF.js stays lazy-loaded. Use `pnpm verify:bundle` to
check the budget locally.

The shell uses one responsive navigation surface across desktop, rail, and
mobile breakpoints. Offline TB/hymn/faith packs remain local, while larger
Bible database and PDF assets are loaded on demand to keep first install and
first paint predictable.

## License

MIT. Upstream provenance and asset licensing notes are documented in
[`docs/discovery/asset-inventory.md`](./docs/discovery/asset-inventory.md).
