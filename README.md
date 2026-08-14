# GYSApp-Tauri

Clean-room, offline-first companion for GYS hymn, Bible, chord, MIDI, and
faith content. The project is a public MIT pnpm monorepo with a React web/PWA,
Hono BFF, and Tauri native shell.

## Status

The rewrite starts from an empty history. Functional discovery is sourced from
`ThenGB/GYSAPP-Fork@4f0d39b`; canonical music and assets are sourced from
`gyspnk/gyschordweb@cbc7d386`. Both upstreams are read-only. Discovery evidence,
provenance, and architectural decisions live in [`docs/`](./docs).

The first implementation slice provides typed contracts, a testable domain
boundary, the Quiet Sanctuary web shell, and a secure BFF skeleton. Remaining
parity work is tracked by milestone and is intentionally not represented as
complete until its acceptance evidence exists.

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

## License

MIT. Upstream provenance and asset licensing notes are documented in
[`docs/discovery/asset-inventory.md`](./docs/discovery/asset-inventory.md).
