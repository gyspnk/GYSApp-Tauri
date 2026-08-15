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
The TB reader runs its 31,172-verse search index in a lazy worker with a
bounded startup fallback, and the global player keeps a compact minimized
context link back to the active verse or hymn.
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
  EGYS -->|HttpOnly egys_session| BFF
```

The UI never imports raw upstream source. `packages/contracts` validates every
boundary, `packages/domain` owns reusable reader/cache/media behavior, the BFF
handles origin/security/cookie concerns, and `scripts/sync-egys.mjs` produces
only reviewed derived contract metadata from an ignored local e-GYS checkout.
The e-GYS login boundary uses the provider's official browser/native SDK; after
the ID-token exchange, profile and membership data are API-driven rather than
rendered through a WebView.

## Feature map

```mermaid
flowchart TB
  SHELL["One responsive app shell"] --> HOME["Home / Sauh / Suara"]
  SHELL --> BIBLE["TB reader + split/search/TTS"]
  SHELL --> HYMNS["Kidung lyrics/chord/PDF/MIDI"]
  SHELL --> LIT["Literature shelves + resume/PDF"]
  SHELL --> MORE["Iman / account / settings / backup"]
  BIBLE --> MEDIA["One global MediaController"]
  HYMNS --> MEDIA
  MEDIA --> FLOAT["Minimized, expanded, draggable surface"]
  HYMNS --> MUSICCACHE["Immutable hash cache + preloading"]
  LIT --> PDF["Local PDF.js + lazy pages"]
  BIBLE --> WORKER["Lazy Bible search worker"]
  SHELL --> CACHE["Verified core Cache Storage / app-data"]
  CACHE --> OFFLINE["Offline core"]
```

```mermaid
flowchart LR
  RAW["Canonical upstream/API"] --> VALIDATE["Zod + size/hash + sanitizer"]
  VALIDATE --> NORMALIZE["Normalized domain model"]
  NORMALIZE --> PERSIST["Versioned persistence/cache"]
  PERSIST --> UI["Internal route/viewer"]
  UI --> PLAYER["Shared media state"]
  AUTH["System browser OAuth"] --> BFF["Hono BFF + HttpOnly session"]
  BFF --> PROFILE["Actual e-GYS profile/branch/membership"]
```

The detailed Literature, Kidung, Bible, persistent-media, e-GYS, cache, and
packaged-asset diagrams live in [`docs/architecture.md`](./docs/architecture.md).

### Kidung viewer contract

Kidung has one `Hymn` entity and two presentation modes. Chord is a shared
capability, so the same verified note-aligned v2 source can be shown in Text or
as a DOM overlay above the PDF canvas. A mode switch preserves transpose, key,
accidental, MIDI, and the global media session.

```mermaid
flowchart TB
  HYMN["Hymn domain"] --> RESOLVER["Resource resolver"]
  RESOLVER --> LYRICS["Lyrics data"]
  RESOLVER --> PDF["PDF resource"]
  RESOLVER --> CHORD["Chord JSON v2"]
  RESOLVER --> MIDI["MIDI resource"]
  LYRICS --> STATE["Viewer state"]
  PDF --> STATE
  CHORD --> STATE
  MIDI --> STATE
  STATE --> PRESENTATION["Presentation: Text or PDF"]
  STATE --> CAPABILITY["Chord: visible or hidden"]
  STATE --> MUSIC["Shared transpose · key · accidental · instrument · tempo"]
```

```mermaid
flowchart LR
  PDF0["PDF resource"] --> PAGE["PDF.js page"] --> CANVAS["Canvas"]
  PAGE --> CONTENT["PDF text content"] --> NOTES["Note extraction"]
  NOTES --> CACHE["pageNotesCache (resource hash + page)"]
  CACHE --> MARKERS["Note-aligned chord layer"] --> OVERLAY["DOM marker overlay"]
  LYRICS0["Lyrics data"] --> ASSOC["Chord/lyric association"]
  CACHE --> ASSOC
  CHORD0["Chord JSON v2"] --> ASSOC
  ASSOC --> RELATIVE["Relative chord position"] --> TEXT["Text presentation"]
```

```mermaid
flowchart LR
  REQUEST["Resource request"] --> KEY["Immutable version/hash key"] --> HIT{"Cache hit?"}
  HIT -->|yes| REUSE["Reuse normalized result"]
  HIT -->|no| LOAD["Load → parse → validate"] --> STORE["Atomic cache + pointer"]
  LOAD -->|transient failure| RETRY["Retry later; do not poison cache"]
```

```mermaid
flowchart LR
  MIDI0["MIDI resource"] --> LOOKUP["Preload lookup: URL + transpose + instrument"]
  LOOKUP --> WORKER["Worker / local synth engine"] --> AUDIO["One global audio session"]
  NEXT["Next-song preload"] -. lower priority .-> LOOKUP
  FOREGROUND["Selected song"] -->|priority| WORKER
```

```mermaid
flowchart LR
  COMMIT["git commit"] --> SYNC["Local authenticated e-GYS clone/fetch"]
  SYNC --> DIFF["Contract diff + compatibility"] --> DERIVED["Generated derived metadata"]
  DERIVED --> TEST["Targeted tests"] --> STAGE["Stage derived files only"]
  APP["App"] --> BROWSER["System browser / provider SDK"] --> OAUTH["e-GYS auth"]
  OAUTH --> CALLBACK["Callback or ID-token exchange"] --> BFF["BFF HttpOnly session"]
  BFF --> API["Native e-GYS API profile"]
```

## Development

```bash
corepack enable
pnpm install
pnpm test
pnpm typecheck
pnpm build
pnpm verify:docs
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
The current production baseline is approximately 82.8 KiB gzip for the main
application chunk and 159.1 KiB gzip for all initial JavaScript; PDF.js, its
worker, and the TB search worker stay lazy-loaded, while the FluidSynth worker
and TimGM pack are same-origin on-demand/PWA assets. Use `pnpm verify:bundle` to
check the budget locally.

The shell uses one responsive navigation surface across desktop, rail, and
mobile breakpoints. Offline TB/hymn/faith packs remain local, while larger
Bible database, PDF, MIDI, and chord assets are loaded on demand, verified by
size/hash, and cached by source version to keep first install and first paint
predictable.

The PWA service worker follows the same budget: the v8 core cache installs only
the shell and small verified offline indexes. TimGM/FluidSynth and the MIDI
worker are warmed in the background after the shell is ready (and skipped on
Save-Data/2G connections), so activation never blocks the first usable frame.

## Deployment prerequisites

Pushes to `main` and `codex/**` trigger GitHub Pages. Configure the repository's
Pages source as **GitHub Actions**. The optional Worker workflow needs
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`; set `EGYS_API_BASE_URL` and
`EGYS_UPSTREAM_COMMIT` as protected Worker variables/secrets when the e-GYS
backend is ready. The private e-GYS repository is intentionally never cloned
or fetched by GitHub Actions: authenticated maintainers run the repository-
managed local pre-commit/pre-push hooks, which refresh the ignored checkout and
stage only derived contract metadata. Without the protected deployment values, the web build still works
and shows an honest unavailable-session state instead of fabricating account
data.

## License

MIT. Upstream provenance and asset licensing notes are documented in
[`docs/discovery/asset-inventory.md`](./docs/discovery/asset-inventory.md).
