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
native e-GYS session/profile adapter. Upstream-backed features keep a checked
in, integrity-verified snapshot so the app remains useful offline and can
revalidate without downloading unchanged assets.

## Development

```bash
corepack enable
pnpm install
pnpm test
pnpm typecheck
pnpm build
pnpm dev
```

Node 24 and pnpm 11 are used in CI. PDF.js, fonts, and application code are
bundled locally; Google/Apple sign-in SDKs are loaded only after the user
chooses a provider and are never required for browsing. e-GYS and BFF
credentials remain deployment secrets.

## Delivery and performance

The web app is configured for a GitHub Pages project deployment at
`/GYSApp-Tauri/`. The Pages workflow builds every workspace package, verifies
generated provenance, runs the bundle budget, and publishes the static PWA.
The current production baseline is approximately 97.3 KiB gzip for the main
application chunk and 123.6 KiB gzip for all initial JavaScript; PDF.js and its
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
backend is ready. Without those protected values, the web build still works
and shows an honest unavailable-session state instead of fabricating account
data.

## License

MIT. Upstream provenance and asset licensing notes are documented in
[`docs/discovery/asset-inventory.md`](./docs/discovery/asset-inventory.md).
