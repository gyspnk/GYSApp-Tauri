# GYSApp architecture

The application is a clean-room pnpm monorepo. Runtime code depends on
contracts and domain ports rather than on an upstream repository checkout.

```mermaid
flowchart TB
  UI[React 19 web/PWA + Tauri WebView shell]
  ROUTER[React Router shell and global media surface]
  FEATURES[Home · Bible · Kidung · Literatur · Iman · More]
  DOMAIN[Domain repositories and state boundaries]
  CONTRACTS[Zod contracts and generated provenance]
  BFF[Hono Worker /api/v1]
  LOCAL[IndexedDB/Cache Storage + localStorage]
  SOURCES[TJC WordPress · gyschordweb · GYSApp-Data]
  EGYS[e-GYS API]

  UI --> ROUTER --> FEATURES --> DOMAIN
  DOMAIN --> CONTRACTS
  DOMAIN --> LOCAL
  FEATURES --> BFF
  BFF --> CONTRACTS
  BFF --> SOURCES
  BFF --> EGYS
```

Online devotional content follows the same shell and cache boundary as
offline readers. Home selects the current Sauh record once; the route-level
Sauh and Suara screens reuse that record instead of opening duplicate tabs.
When a Suara item is selected, only the allowlisted TJC article endpoint is
fetched through the BFF. The worker strips executable/embedded markup, limits
the body, validates `OnlineArticle`, and returns a reader document. The source
link remains available as an explicit secondary action. A Pages preview with
no `VITE_BFF_BASE_URL` uses the same allowlisted WordPress post feed and client
sanitizer as a compatibility fallback; it never injects upstream HTML.

```mermaid
sequenceDiagram
  participant Home as Home / Daily Verse
  participant Shell as App shell router
  participant BFF as Hono article boundary
  participant TJC as TJC article
  Home->>Shell: Link to /sauh or /suara/:postId
  Shell->>BFF: GET /api/v1/content/article?url=...
  BFF->>TJC: HTTPS allowlisted fetch
  TJC-->>BFF: HTML
  BFF->>BFF: strip scripts + decode entities + bound text
  BFF-->>Shell: OnlineArticle (validated)
  Shell-->>Home: in-app reader + explicit source link
```

## Module responsibilities

| Area                    | Responsibility                                                                                                                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src`          | Route-level UI, responsive shell, browser adapters, global search, media surface, asset lifecycle, literature resume, and feature controllers.                                    |
| `packages/contracts`    | Zod schemas and TypeScript types shared by the web, BFF, and tests.                                                                                                               |
| `packages/domain`       | Search, Bible, chord, MIDI, media, cache, and platform-independent repository behavior.                                                                                           |
| `apps/bff`              | Origin/CORS/CSRF/rate-limit boundary, upstream validation, PDF/canonical music range proxies, typed Edge speech audio proxy, cache headers, typed errors, and e-GYS cookie proxy. |
| `apps/native/src-tauri` | Tauri shell boundary and platform command registration; provider authentication belongs in a secure system-browser/native SDK.                                                    |
| `scripts`               | Deterministic upstream/asset generation, local sync, provenance, and release checks.                                                                                              |
| `docs`                  | Discovery evidence, ADRs, integration contracts, test/release evidence, and runbooks.                                                                                             |

## Data and persistence flow

```mermaid
flowchart LR
  REMOTE[Remote manifest/API] --> VALIDATE[Zod + URL/size/SHA validation]
  VALIDATE --> TEMP[Temporary download]
  TEMP --> ATOMIC[Atomic Cache Storage/blob replace]
  ATOMIC --> POINTER[Versioned local pointer]
  POINTER --> READER[Reader/player/viewer]
  POINTER --> GC[Size/TTL/LRU cleanup]
  MIGRATE[Old local schema] --> CHECK[Version detect + migration]
  CHECK --> POINTER
```

Critical user state is intentionally small and versioned: activity, favorites,
literature locations, preferences, diagnostics, and backup metadata. A migration must preserve
valid records, validate the result, and invalidate only the affected domain
when a record cannot be recovered.

## Asset lifecycle

Music and local pack assets use immutable source commits and SHA-256 records in
the generated asset manifest. Literature
cover URLs come from the TJC WordPress source where available; the generated
snapshot currently contains 279 verified cover mappings and explicit fallback
records for 18 entries whose source does not expose a cover. The service worker
caches TJC media only after an image request succeeds, and the PDF/MIDI/chord
loaders verify bytes before activating a cache entry. PDF literature is fetched
through `/api/v1/content/pdf` when a BFF is configured; the proxy allowlists
only `https://tjc.org/*.pdf` and preserves HTTP range requests for PDF.js.

Literature records keep a versioned page/scroll location. The catalog renders a
deduplicated “Terakhir dilihat” shelf and validates a saved page against the
current resource version before offering resume.

The PWA service worker keeps its install path small and deterministic. Cache
`gysapp-shell-v8` precaches the shell plus the compact offline indexes; after
the first client is ready, the client sends `gys-cache-optional` to warm the
TimGM soundfont and local MIDI/FluidSynth worker in the background. Optional
warming is skipped when the browser advertises Save-Data or a 2G connection,
and each optional asset is cached independently so one missing binary cannot
invalidate the shell.

The Bible reader uses the generated TB pack as a single source of truth. The
browser strips the pack's layout markers before display, while a lazy module
worker builds and queries the normalized 31,172-verse index off the main thread.
Worker startup is bounded and falls back to the same typed repository when a
worker is unavailable; stale requests are cancelled so a slow query cannot
overwrite a newer one. Split columns, bookmarks, highlights, notes, and query
history live in versioned local keys and remain available offline.

The global media surface subscribes to the external MIDI and speech stores,
not React render ticks. It exposes the active source as an internal route (and
verse hash for Bible speech), keeps title/progress visible in minimized mode,
clamps a persisted drag position after viewport changes, and registers Media
Session handlers against live refs so position updates do not recreate the
handler set.

The Kidung catalog builds a normalized search index once per loaded catalog
revision. Queries use token/prefix AND matching and preserve quoted phrases;
the UI never lower-cases the full lyric corpus on every keystroke. The vertical
PDF reader uses the same bounded-resource principle: pages outside the
IntersectionObserver preload window cancel their render task and release their
canvas. BFF Literature and Suara Sejati cache boundaries share in-flight
upstream requests, so concurrent shell mounts cannot create duplicate fetches.

```mermaid
flowchart LR
  PACK[TB reader pack] --> CLIENT[BibleSearchClient]
  CLIENT --> WORKER[Lazy search worker]
  WORKER --> INDEX[Normalized verse index]
  CLIENT --> FALLBACK[Typed repository fallback]
  INDEX --> RESULTS[Search results]
  RESULTS --> READER[Responsive Bible reader]
```

Kidung detail is a single viewer with three exclusive modes. The selected mode
is persisted per hymn in a versioned, bounded preference key. Selecting Chord
or PDF starts the corresponding verified fetch and switches the surface only
after the mode is selected; the Lyrics article is unmounted while either media
viewer is active. This prevents duplicate lyrics/PDF and lyrics/chord layouts
on small screens.

```mermaid
stateDiagram-v2
  [*] --> Lyrics
  Lyrics --> Chord: select chord
  Lyrics --> PDF: select PDF
  Chord --> Lyrics: select lirik
  Chord --> PDF: select PDF
  PDF --> Lyrics: close/select lirik
  PDF --> Chord: select chord
  Chord --> Chord: verified cache/revalidate
  PDF --> PDF: verified cache/revalidate
```

```mermaid
stateDiagram-v2
  [*] --> Missing
  Missing --> Downloading: version/hash differs
  Downloading --> Verifying: response complete
  Verifying --> Active: schema + size + SHA pass
  Verifying --> ActiveOld: validation fails and old copy is valid
  Active --> Stale: newer manifest
  Stale --> Downloading
  Active --> Evicted: unpinned LRU/GC
  ActiveOld --> Downloading: retry online
```

## Release gates

Local `pnpm verify:prepush` runs the same primary gates used by CI: e-GYS
revision/contract verification, formatting, lint, strict typecheck, unit and
contract tests, production builds, bundle budget, and Playwright critical
flows. It also runs `verify:native-assets` after the web build, which checks
the Tauri `frontendDist` boundary and every default offline/runtime binary.
Only the local hooks access the private e-GYS upstream; GitHub Actions is a
secondary verification layer for the already-reviewed generated contract and
never clones or fetches the upstream repository.

```mermaid
sequenceDiagram
  participant Reader as Kidung/PDF reader
  participant Cache as Cache Storage
  participant Worker as BFF music proxy
  participant Raw as gyschordweb immutable commit
  Reader->>Cache: get(source hash)
  alt cached and verified
    Cache-->>Reader: bytes
  else missing or corrupt
    Reader->>Worker: GET /api/v1/content/music?commit&path
    Worker->>Raw: GET immutable path (+ Range)
    Raw-->>Worker: binary response
    Worker-->>Reader: CORS-safe binary response
    Reader->>Reader: verify size + SHA-256
    Reader->>Cache: atomic replace pointer
  end
```
