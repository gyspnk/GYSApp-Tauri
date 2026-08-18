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

| Area                    | Responsibility                                                                                                                                                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src`          | Route-level UI, responsive shell, browser adapters, global search, media surface, asset lifecycle, literature resume, and feature controllers.                                                                                           |
| `packages/contracts`    | Zod schemas and TypeScript types shared by the web, BFF, and tests.                                                                                                                                                                      |
| `packages/domain`       | Search, Bible, chord, MIDI, media, cache, and platform-independent repository behavior.                                                                                                                                                  |
| `apps/bff`              | Origin/CORS/cookie-CSRF/rate-limit boundary, upstream validation, PDF/canonical music range proxies (including the immutable GYSApp-Fork KR master), typed Edge speech audio proxy, cache headers, typed errors, and e-GYS cookie proxy. |
| `apps/native/src-tauri` | Tauri shell boundary and platform command registration; provider authentication belongs in a secure system-browser/native SDK.                                                                                                           |
| `scripts`               | Deterministic upstream/asset generation, local sync, provenance, and release checks.                                                                                                                                                     |
| `docs`                  | Discovery evidence, ADRs, integration contracts, test/release evidence, and runbooks.                                                                                                                                                    |

## Platform capability boundary

`PlatformServices` is the only feature-facing platform seam. It now exposes
the durable `database`, ordinary `keyValue`, atomic `blobs`, transient
`secrets`, notifications, file dialogs, sharing, speech providers, deep-link
subscriptions, lifecycle events, external links, and capability detection.
The browser adapter uses IndexedDB/Cache Storage and real browser APIs where
they exist. The Tauri adapter keeps verified data in native app-data and now
bridges file dialogs, deep links, notifications, and OS-backed secure secrets
through Tauri commands/plugins. Capability flags describe the selected native
adapter, while command results are still validated at the boundary and device
contract tests remain part of the signed-artifact gate. No adapter claims a
capability that it cannot execute, and the ephemeral secret boundary is never
used for authentication tokens.

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

The browser pack manager can check a configured `VITE_ASSET_MANIFEST_URL` (or
the immutable Pages manifest when no override is present). It parses the
versioned manifest, rejects duplicate IDs and untrusted origins, diffs content
identity rather than generated timestamps, stages only changed local assets,
validates every size/SHA-256 before the Cache Storage pointer changes, and
persists the active manifest. Removed local entries are cleaned after the new
pointer is active; a failed stage therefore leaves the previous pack usable.

Literature records keep a versioned page/scroll location. The catalog renders a
deduplicated “Terakhir dilihat” shelf and validates a saved page against the
current resource version before offering resume.

The PWA service worker keeps its install path small and deterministic. Cache
`gysapp-shell-v12` precaches the shell plus the compact offline indexes; after
the first client is ready, the client sends `gys-cache-optional` to warm the
TimGM soundfont and local MIDI/FluidSynth worker in the background. Optional
warming is skipped when the browser advertises Save-Data or a 2G connection,
and each optional asset is cached independently so one missing binary cannot
invalidate the shell. HTML navigations use a network-first refresh and fall
back to the cached `index.html` only when the network is unavailable, so
existing clients observe new Pages deployments.

The Bible reader uses the generated TB pack as a single source of truth. The
browser strips the pack's layout markers before display, while a lazy module
worker builds and queries the normalized 31,172-verse index off the main thread.
Worker startup is bounded and falls back to the same typed repository when a
worker is unavailable; stale requests are cancelled so a slow query cannot
overwrite a newer one. Split columns, bookmarks, highlights, notes, and query
history live in versioned local keys and remain available offline. The split
controller owns ratio clamping, pointer lifecycle, keyboard-safe persistence,
and the mobile guard independently of the reader component.

The global media surface subscribes to the external MIDI and speech stores,
not React render ticks. It exposes the active source as an internal route (and
verse hash for Bible speech), keeps title/progress visible in minimized mode,
clamps a persisted drag position after viewport changes, and registers Media
Session handlers against live refs so position updates do not recreate the
handler set.

Kidung subscribes only to the MIDI settings store (tempo/transpose/instrument),
not the 4 Hz playback-position store. This keeps the reader shell stable while
the floating surface updates its progress indicator.

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

Kidung detail is one viewer with two presentation modes: Lyrics and PDF. Chord
is a capability layered on either presentation, so it is never a third route or
an independent viewer. The selected presentation and chord visibility are
persisted per hymn in separate versioned, bounded preference keys. A verified
note-aligned v2 document is loaded once; its PDF text model is cached by
`hymnId:resourceHash`, then reused for both the Text chord-line association and
the DOM marker layer above PDF.js canvases. Transpose and accidental changes
only update marker labels and do not rerender the PDF.

The reader also stores bounded typography preferences per hymn. The PDF layout
preference supports single, two-page, vertical, and horizontal scrolling; the
effective layout downgrades a two-page spread to one page below 720 px so a
phone never receives two unreadable canvases. The global MIDI session keeps the
same transpose and exposes source-program playback or each of the 128 General
MIDI programs; render-cache keys include tempo, transpose, instrument, source
hash, soundfont, and sample rate.

```mermaid
stateDiagram-v2
  [*] --> Lyrics
  Lyrics --> Lyrics: show/hide shared chord layer
  Lyrics --> PDF: select PDF
  PDF --> PDF: show/hide shared chord layer
  PDF --> Lyrics: select lirik
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

## Feature lifecycle diagrams

The 14 diagrams below form the complete operational architecture and lifecycle map for GYS App, corresponding to specifications R1 through R14. They define the structural boundaries that remain stable across routes, platform adapters, and deployment targets.

### 1. Content-First UI & Contextual Toolbar Flow

```mermaid
flowchart TB
  SCROLL["Scroll / Touch Interaction in Reader"] --> DETECT["useToolbarAutoHide Hook"]
  DETECT -->|Scroll Down| HIDE["Compact / Auto-Hide Top Toolbar"]
  DETECT -->|Scroll Up / Tap| RESTORE["Smoothly Restore Toolbar"]
  SHELL["Stratified UI Layout"] --> L0["Content Layer (z-index: 0)"]
  SHELL --> L10["Navigation Layer (z-index: 10)"]
  SHELL --> L20["Persistent Media Layer (z-index: 20)"]
  SHELL --> L30["Contextual Toolbar Layer (z-index: 30)"]
  SHELL --> L40["Popovers / Bottom Sheets (z-index: 40)"]
  SHELL --> L50["Modals / Dialogs (z-index: 50)"]
  READER["Active Reader Viewport"] --> WAKE["useWakeLock (Screen Lock)"]
  WAKE -->|Enter Reader| ACQUIRE["navigator.wakeLock.request('screen')"]
  WAKE -->|Leave Reader / Pause| RELEASE["wakeLock.release()"]
  THUMB["Mobile Thumb Zone (Lower 40%)"] --> ACTIONS["Search, Bookmark, Font Controls, Audio, Chords"]
```

### 2. Kidung Rohani Domain & Musical State Diagram

### Kidung

```mermaid
stateDiagram-v2
  [*] --> HymnDomainModel: Hymn ID, Title, Lyrics, PDF, Chords, MIDI
  state HymnDomainModel {
    [*] --> PresentationMode
    PresentationMode --> LyricsMode: Select Text/Lirik
    PresentationMode --> PDFMode: Select PDF/Not Angka
    LyricsMode --> PDFMode: Switch Mode (Shared State Retained)
    PDFMode --> LyricsMode: Switch Mode (Shared State Retained)
  }
  state SharedMusicalState {
    TransposeOffset: ±Semitone Shift (Shortest Path)
    KeyCalculation: Canonical Source Key -> Target Key
    AccidentalMode: Sharp (#) or Flat (b)
    ChordVisibility: Visible or Hidden (Shared across modes)
    MIDIPreferences: Tempo, Program (0-127), Volume, Mute
  }
  HymnDomainModel --> SharedMusicalState
  SharedMusicalState --> GlobalMediaSession: Synchronized Audio Transport
```

### 3. PDF Note Extraction & DOM Chord Overlay Pipeline

```mermaid
flowchart LR
  PDFDOC["PDF Document (Fork KR Master / Canonical)"] --> PDFJS["PDF.js Render"]
  PDFJS --> CANVAS["Canvas Surface"]
  PDFJS --> TEXTCONTENT["PDF Text Content"]
  TEXTCONTENT --> EXTRACT["Dominant Notation Font & Note Extraction"]
  EXTRACT --> CACHE["pageNotesCache (resourceHash + page)"]
  CHORDJSON["Note-Aligned v2 Chords (Sentinels -1, 99999)"] --> MAPPER["Coordinate & Index Mapper"]
  CACHE --> MAPPER
  TRANSPOSE["Shortest-Path Transpose & Accidental Mode"] --> MAPPER
  MAPPER --> OVERLAY["DOM Marker Overlay Layer (Zero Canvas Re-render)"]
  OVERLAY --> CANVAS
```

### 4. Text Mode Note-Row ↔ Lyric-Line Chord Association

```mermaid
flowchart LR
  LYRICS["Structured Lyrics Corpus (Verses, Chorus, Lines)"] --> ASSOC["Positional Association Engine"]
  CHORDDATA["Note-Aligned v2 Chord JSON"] --> ASSOC
  NOTEMAP["PDF Note-Row Geometry"] --> ASSOC
  ASSOC --> WRAP["Measured Visual Lyric Rows & Character Wrapping"]
  WRAP --> AUTOFIT["Responsive Auto-Fit Scaling (Min 14 px)"]
  AUTOFIT --> TYPO["Per-Hymn Typography (Font 16–28 px, Line Height 1.4–2.2)"]
  TYPO --> DOM["Relative DOM Chord Marker Overlay"]
```

### 5. Unified Cache & Preload Resolution Flow

```mermaid
flowchart TD
  REQ["Resource Request (Hymn, Bible, Literature, Devotional)"] --> KEY["Immutable Hash / Version Key"]
  KEY --> CHECK{"Local Cache Hit?"}
  CHECK -->|Yes| HIT["Read from IndexedDB / Cache Storage"]
  HIT --> RETURN["Instant Normalized Model Return"]
  CHECK -->|No| FETCH["Fetch Remote / Upstream Asset"]
  FETCH --> VALIDATE{"Validate Zod Schema, Size & SHA-256"}
  VALIDATE -->|Valid| ATOMIC["Atomic Cache Write & Pointer Swap"]
  ATOMIC --> RETURN
  VALIDATE -->|Network Error| TRANSIENT["Retryable Error (Never Poison Cache)"]
  VALIDATE -->|Missing Resource| NEGATIVE["14-Day TTL Negative Cache Entry"]
```

### 6. MIDI Synthesis & Preload Queue Pipeline

```mermaid
flowchart LR
  MIDI["Canonical MIDI File"] --> SYNTH["Local FluidSynth WASM / TimGM SoundFont"]
  SYNTH --> PCMCACHE["Bounded 96 MB PCM Audio Cache"]
  PCMCACHE --> GEN{"Shared Generation Token Guard"}
  GEN -->|Active Generation| AUDIO["One Global Web Audio Context"]
  GEN -->|Stale / Superseded| DISCARD["Discard Obsolete WASM Render"]
  QUEUE["Serial Preload Queue (Prev/Next Hymn)"] -. Background .-> SYNTH
  FOREGROUND["User Selects Song / Seeks / Changes Tempo"] -->|Cancel Preload| GEN
```

### 7. Alkitab Split Reader & Navigation State

### Alkitab and voice

```mermaid
flowchart TB
  TBBIBLE["TB 31,172-Verse Pack"] --> SEARCHWORKER["Lazy Search Worker (PL 39 / PB 27, 3-Tier Ranking)"]
  TBBIBLE --> SPLIT["SplitManager Controller"]
  SPLIT --> PANE1["Primary Reading Pane (Persistent Font & Offset)"]
  SPLIT --> DIVIDER["Draggable Divider (50/50 Haptic Snap & Persistence)"]
  SPLIT --> PANE2["Secondary Reading Pane (Independent / Sync Scroll)"]
  NAV["Quick Title Drag Navigation"] --> PICKER["Direct Rapid Overlay (Kitab -> Pasal -> Ayat)"]
  SEARCHWORKER --> DEEPLINK["Direct Verse Route (/bible?book=&chapter=&verse=)"]
  DEEPLINK --> PANE1
```

### 8. Alkitab Suara (TTS) VoiceEngine Flow

```mermaid
flowchart LR
  VERSES["Spoken Verses Queue"] --> SANITIZE["Sanitize Markup, Footnotes & Tokens"]
  SANITIZE --> VOICEENGINE["VoiceEngine Orchestrator"]
  VOICEENGINE --> PREFERRED["Online / Edge Natural TTS (Preferred)"]
  VOICEENGINE --> FALLBACK["Local / System Web Speech Fallback"]
  VOICEENGINE --> TRANSPORT["Audio Transport & Playback Stream"]
  TRANSPORT --> HIGHLIGHT["Synchronized Verse Highlight & Auto-Scroll"]
  TRANSPORT --> HEADPHONE["Headphone Disconnect Guard (Auto-Pause)"]
  TRANSPORT --> ARBITRATION["Global Audio Focus (MIDI ↔ TTS Arbitration)"]
```

### 9. Persistent Global Media Controller & Floating Player

### Persistent media

```mermaid
flowchart TB
  SESSION["Active Media Session (TTS / MIDI)"] --> CONTROLLER["GlobalMediaController (SPA-wide)"]
  CONTROLLER --> ROUTE["Persists Across All SPA Route Transitions"]
  CONTROLLER --> FLOAT["Minimized Floating Player Surface"]
  FLOAT --> DRAG["Pointer Drag & Keyboard Arrow Navigation"]
  FLOAT --> CLAMP["Viewport Boundary Clamping & Safe-Area Padding"]
  FLOAT --> AVOID["Bottom Nav & Form Collision Avoidance"]
  FLOAT --> BACK["Context Tap -> Navigate to Active Verse / Song"]
  CONTROLLER --> MAX["Maximized Player Sheet (Full Controls)"]
  CONTROLLER --> MEDIASESSION["Media Session API (Lock Screen & Notification)"]
```

### 10. Literature ReadingLocation & Resume Pipeline

### Literature and PDF

```mermaid
flowchart LR
  CATALOG["TJC Literature Catalog (279 Covered + 18 Fallback)"] --> SHELF["Shelves, Categories & Search"]
  SHELF --> VIEWER["In-App PDF.js / Article Document Viewer"]
  VIEWER --> LOC["Debounced ReadingLocation (Page, Scroll, Progress %, Version)"]
  LOC --> PERSIST["Versioned Persistence in Storage"]
  PERSIST --> RECENT["Deduplicated 'Terakhir Dilihat' Shelf"]
  RECENT --> RESUME["'Lanjutkan Membaca' & 'Kembali ke Posisi Terakhir' CTA"]
```

### 11. e-GYS Web Auth → Native API & Local Sync Flow

### e-GYS authentication and local contract sync

```mermaid
sequenceDiagram
  autonumber
  participant User as App User
  participant Provider as Official Provider SDK (Google/Apple/WA)
  participant BFF as Hono BFF Boundary
  participant EGYS as e-GYS Native API
  participant Hook as Local Pre-Commit Hook (sync-egys.mjs)

  User->>Provider: Authenticate via SDK / System Browser
  Provider-->>BFF: Provider ID-Token / WhatsApp Poll
  BFF->>EGYS: POST /api/v1/auth/{provider}
  EGYS-->>BFF: Upstream HttpOnly egys_session Cookie
  BFF-->>User: Normalized Session & Same-Origin Cookie
  User->>BFF: Request Profile / Branch / Membership
  BFF->>EGYS: Forward egys_session to API Endpoints
  EGYS-->>User: Real Validated Domain Data
  Note over Hook: Developer Local Sync Workflow
  Hook->>Hook: git ls-remote HEAD check & shallow clone .tmp-egys-*
  Hook->>Hook: Extract Springdoc/OpenAPI route contract & diff
  Hook-->>User: Stage derived egys-contract.ts only (zero upstream code committed)
```

### 12. Web Cache & Service Worker Strategy

### Web cache, packaged assets, and release workflow

```mermaid
flowchart TD
  SW["Service Worker v10 Install"] --> CORE["Precache Shell & Compact Offline Indexes"]
  CORE --> ACTIVATE["Activate & First Usable Paint"]
  ACTIVATE --> CHECKNET{"Save-Data or 2G Connection?"}
  CHECKNET -->|No| WARM["Background Warm-up: TimGM SoundFont & FluidSynth WASM"]
  CHECKNET -->|Yes| SKIP["Skip Heavy Preloads to Preserve Bandwidth"]
  ACTIVATE --> TJCCACHE["Bounded TJC Media Cache (96 entries LRU)"]
  ACTIVATE --> MANIFEST["Versioned Offline Manifest & Atomic Pointer Swap"]
```

### 13. Packaged Native Asset Strategy

```mermaid
flowchart LR
  TAURI["Tauri Native Package (NSIS/MSI/APK)"] --> ASSETS["18 Bundled Runtime Assets (36.8 MB)"]
  ASSETS --> SEEDS["TB Bible, Hymn Catalog, Lyrics, SoundFonts, FluidSynth"]
  TAURI --> BRIDGE["PlatformServices Native Bridge (Rust Command Layer)"]
  BRIDGE --> CAPS["Payload Caps: 128 MB Blobs, 8 MB Key-Value/DB"]
  BRIDGE --> APPDATA["OS App-Data Directory Storage"]
  APPDATA --> ATOMIC["Path-Safe Hex Keys & Unique Temp File Replacement"]
```

### 14. Direct-to-Main Git Workflow

```mermaid
flowchart LR
  DEV["Direct-to-Main Development on 'main'"] --> PRECOMMIT["pnpm verify:precommit"]
  PRECOMMIT --> HOOK1["Sync e-GYS, Lint, Typecheck, Contract Tests, Verify Generated"]
  HOOK1 --> PREPUSH["pnpm verify:prepush"]
  PREPUSH --> HOOK2["Full Test Matrix, Policy Tests, Chord Audit, Build, Budgets, Native, E2E"]
  HOOK2 --> PUSH["Fast-Forward Push directly to origin/main"]
  PUSH --> CI["CI Secondary Verification"]
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

## Native platform boundary

Tauri exposes the shared `PlatformServices` key-value/blob boundary through
typed invoke commands. Records and verified media blobs are written under the
OS app-data directory with hex-encoded keys and unique temporary files before
atomic replacement; malformed base64 or corrupt JSON is rejected at the
boundary. The browser adapter remains the PWA fallback, while Tauri webviews
select the native adapter through the global invoke bridge. External URL
handoff is restricted to `http`/`https` and uses the allowlisted shell opener;
the in-app PDF/chord/document readers never use this path.

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

The KR hymn presentation follows the same path through
`/api/v1/content/fork-pdf`, but its source is locked independently to
`ThenGB/GYSApp-Fork@4f0d39b` and `assets/data/pdf/kr/kr_master.pdf`. The route
accepts only that commit/path pair, preserves byte ranges, and is optional:
Pages and native previews still fall back to the immutable raw source when the
Worker is not configured. The page database in
`offline/fork-hymnal-manifest.json` and the binary therefore cannot drift.
