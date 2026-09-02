# Feature parity matrix (initial baseline)

This is a living matrix. `PARITY` is reserved for an exercised behavior and
attached test evidence; `PLANNED` is not a claim of completion.

| Area             | Canonical behavior discovered                                   | Rewrite status                   | Evidence / remaining proof                                                                                     |
| ---------------- | --------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Shell/navigation | Five destinations, responsive bottom nav/rail/sidebar           | IMPLEMENTED / NEEDS VERIFICATION | Playwright responsive matrix, Axe Home; full device/screen-reader audit remains.                               |
| Kidung text      | 533-item catalog, focused reader, wrapping, verse navigation    | IMPLEMENTED / NEEDS VERIFICATION | Search golden tests, compact-reader geometry, SoundFont settings and wrapped-chord E2E; device review remains. |
| Chord            | 144 canonical files, immutable commit fetch, cache/SWR/pinning  | IMPLEMENTED / NEEDS VERIFICATION | Chord audit: 144/144 files, 3291/3291 mapped, zero orphan/invalid; device parity remains.                      |
| MIDI             | 128 GM programs, GeneralUser install, transport, playlist modes | IMPLEMENTED / NEEDS VERIFICATION | Parser/transport/cache, active-setting adjacent preload and load/minimize E2E; long-session profile remains.   |
| PDF              | Local PDF.js worker, page/zoom/resume, text/PDF mode switch     | IMPLEMENTED / NEEDS VERIFICATION | PDF.js worker, fork-PDF load/download, layout/resume/retry E2E; device matrix remains.                         |
| Bible            | TB pack, reader, search, references, notes, split versions      | IMPLEMENTED / NEEDS VERIFICATION | TB/search/split/selection E2E; additional installed versions/pericope fixtures remain.                         |
| TTS              | Edge compatibility provider with offline capability fallback    | IMPLEMENTED / NEEDS VERIFICATION | Provider/orchestrator tests and local capability detection; protected Edge gateway and device voices remain.   |
| Iman             | Ten topics, multilingual search/copy/share/note                 | IMPLEMENTED / NEEDS VERIFICATION | Local data and contextual-action implementation; full locale/device review remains.                            |
| Backup           | Legacy `.gysbk` one-way import, new AES-GCM envelope            | IMPLEMENTED / NEEDS VERIFICATION | Domain round-trip/migration tests; cross-platform file-picker verification remains.                            |
| Account          | Official e-GYS v1 login; native bridge and keyring profile      | IMPLEMENTED / NEEDS VERIFICATION | Web link and native origin/message validation tests; real Tauri account smoke remains.                         |
| Literature       | Real catalog, covers, resume, internal PDF/article reader       | IMPLEMENTED / NEEDS VERIFICATION | Catalog/progress tests, internal PDF load/download/retry E2E; full catalog/cover audit remains.                |
| Sauh / Suara     | Daily canonical Sauh and trusted internal Suara feed            | IMPLEMENTED / NEEDS VERIFICATION | Source parsing, outage, daily-selection, internal-reader E2E; production upstream monitoring remains.          |
| Media            | One persistent minimizable MIDI/TTS surface with handoff        | IMPLEMENTED / NEEDS VERIFICATION | Cross-route/minimize/queue E2E; native audio-focus matrix remains.                                             |

## Parity additions (gyschordweb bundle audit)

The gyschordweb reference bundle (`docs/web/index-mRq1ab6k.js` +
`docs/js/lyrics-viewer.js`) was audited against this codebase. Features that
were present upstream but missing here were added in one pass:

| Feature                                                                                                                                                                    | Status                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Mini-player MIDI: MIDI Queue kicker, seek time, loop toggle (off/one/all), key dropdown (12 nada), accidental ♯/♭, transpose −/+/label, tombol Lihat Lirik                 | IMPLEMENTED (MediaSurface)                    |
| Mode lirik fullscreen (`LyricsPanel`): transport inline, chord toggle, instrumen/tempo/key/transpose, font A−/A+ autofit, spacing −/+, swipe bait/lagu, header collapsible | IMPLEMENTED (`apps/web/src/lyrics-panel.tsx`) |
| Loop cepat di MIDI dock (`MidiControlsPanel`)                                                                                                                              | IMPLEMENTED                                   |
| Info versi + reset cache/preferensi di Pengaturan Kidung                                                                                                                   | IMPLEMENTED                                   |
| Fix emoji mute mojibake (volumeOff/volume icon)                                                                                                                            | IMPLEMENTED                                   |

## Deep audit (legacy `app.bundle.min.js`, commit 2026-08)

The full legacy runtime bundle (245 KB, `docs/js/app.bundle.min.js` + `docs/web/index-mRq1ab6k.js`) was decompiled and audited line-by-line against this codebase. Second pass additions:

| Feature                                                                                                                    | Status                                                               |
| -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Chord UI prefs: 12 tema huruf chord, fill none/soft/solid, opacity, ukuran font, padding, sync accent (text + PDF markers) | IMPLEMENTED (`chord-ui-prefs.ts`, settings section "Tampilan chord") |
| Transpose range diperluas -11..+11 (dari -6..+6)                                                                           | IMPLEMENTED                                                          |
| Indikator chord tersedia (`check_circle`/`cancel`) di daftar pujian                                                        | IMPLEMENTED                                                          |
| Mini player subtitle Auto Next (Berikutnya: / Shuffle / Single Loop / Selesai / Mode Loop Mati)                            | IMPLEMENTED (MediaSurface)                                           |
| Tombol Fullscreen di viewer PDF hymn                                                                                       | IMPLEMENTED (pdf.tsx)                                                |

## Third pass (latest upstream `728c93cc`, 2026-08-28)

Re-checked against the current gyschordweb HEAD (`728c93cc`): `sw.js` v86 with
`PURGE_URLS` self-healing, `04-viewer.css` v43 (MIDI player 1-row/2-row
consolidation, compact sizing, mini-player popovers), `runtime-fixes.css`
(layout style density vars), `assets-list.json` (530 songs, incl. 51A/B, 124A/B,
132A/B variants), `assets-chord-list.json` (144 files).

| Feature                                                                                                     | Status                                                                      |
| ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `PURGE_URLS` SW handler: purge poisoned PDF.js cache entries + auto reload after 2 consecutive PDF failures | IMPLEMENTED (`sw.js` `gys-purge-urls` + `pdf.tsx` recovery)                 |
| Chord list parity: 144 canonical chord files confirmed in `chordRef` of the generated catalog               | CONFIRMED (no change needed)                                                |
| MIDI player compact sizing / 1-row desktop 2-row mobile                                                     | Already matches app's `hymn-midi-dock` responsive layout (no change needed) |

## Fourth pass (2026-08-29 regression fixes)

User-reported regressions against gyschordweb behavior, all fixed:

| Issue                                                                  | Root cause                                                                                                                                           | Fix                                                                                                                                                             |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PDF zoom did not change the rendered scale                             | CSS capped canvas display size (`width:min(100%,500px)` frame + `max-height` mobile caps) so the JS-rendered zoomed bitmap was re-scaled back to fit | Scope caps to `.is-fit` (100%); `.is-zoomed` keeps JS pixel size; per-page `fitScaleRef` in `VerticalPdfPage` so scroll-layout zoom works from 100%             |
| Viewer button layout messy                                             | `.hymn-segmented-toolbar` had no CSS; PDF chrome had a 6th Chord button in a 5-column grid; footer 5 columns left a hole in "all verses" mode        | Two-row text toolbar (actions + more/settings row 1, segmented row 2), chord toggle on its own right-aligned row, adaptive footer grid (`is-all-verses` 3 cols) |
| Chord text wrong after verse swipe in `LyricsPanel`                    | Panel received a verse-scoped `chordLines` memo that never updated when the panel changed verse                                                      | `getChordLinesForVerse(verseIndex)` callback recomputed per in-panel verse                                                                                      |
| `matchChordLinesToLyrics` replaced app lyrics with chord-document text | Function returned the matched document line verbatim                                                                                                 | Keep app lyric text; re-map chord indices via `remapChordIndex` (proportional fallback)                                                                         |
| Autofit ignored vertical overflow                                      | `autoFitFontSize` only measured width; `LyricsPanel` had no resize observer                                                                          | Height-aware fit (`availableHeight`/`measuredHeight`) + `ResizeObserver` + `visualViewport` + `fonts.ready` refit                                               |
| Literature covers missing                                              | `LazyImage`/`Cover` shimmered forever when the tjc.org image neither loaded nor errored                                                              | 12 s timeout → fallback placeholder                                                                                                                             |
| Bible first launch opened Yohanes 3                                    | Hardcoded default `BOOK_KEY, 43` / `CHAPTER_KEY, 3`; a normalizing effect also clobbered deep-links                                                  | Default Kejadian 1 (`BOOK_KEY, 1`); removed `setSelectedBook(book.id)` write-back that overrode `/bible?book=43`                                                |
| Sauh status ineffective / wrong position                               | Loading/error rendered as a thin panel above the content; network race could take >8 s                                                               | Loading/error rendered INSIDE the `.sauh-article` main card with spinner/retry + tjc.org link; per-request timeout 4 s → 3 s                                    |

## Fifth pass (2026-08-29 visual/functional parity)

Gap-closing pass against the gyschordweb reference shell (audit of the bundle
template + viewer CSS):

| Feature                                                                                                                                       | Status                           |
| --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Transpose/key/accidental controls inside the PDF overlay (`.pdf-transpose-inline` with key dropdown, accidental ♯/♭, transpose −/+ and reset) | IMPLEMENTED (`kidung.tsx`)       |
| `playlist_add` / `playlist_add_check` icons on the queue-add button (replaces text `＋`/`✓`)                                                  | IMPLEMENTED (`icons.tsx`)        |
| Material-style icons on the Kidung local nav tabs (music_note / queue_music / settings)                                                       | IMPLEMENTED (`KidungLocalNav`)   |
| PDF view/scroll toggle uses `swap_vert` / `book` icons instead of ASCII `↓`/`→`                                                               | IMPLEMENTED (`pdf.tsx`)          |
| Mini-player tempo becomes a compact toggle + popover (parity `mini-tempo-toggle-btn`) instead of an inline slider                             | IMPLEMENTED (`MediaSurface`)     |
| Lyrics fullscreen panel gains explicit verse prev/next buttons (desktop parity; swipe/wheel remain)                                           | IMPLEMENTED (`LyricsPanel`)      |
| Playfair Display font for hymn titles (katalog, detail, PDF title, lyrics panel)                                                              | IMPLEMENTED (`index.html` + CSS) |

## Skipped (superseded by app architecture)

- Layout style density presets (balanced/compact/focused/spacious): the app's
  shell uses a topbar + nav rail (desktop) / bottom-nav (mobile) design, not
  the gyschordweb header + bottom-nav variables (`--app-header-height`,
  `--layout-list-width`, …). Porting those presets would require re-theming the
  entire shell; the app already offers equivalent density controls via its own
  responsive layout.
- Appearance Studio colorScheme palettes (warm/slate/sage/rose/ocean):
  superseded by the app's theme system (light/dark/sepia/amoled + accent).

## Audited and confirmed already present (no change needed)

- MIDI engine: Web Audio + FluidSynth WASM worker, GeneralUser-GS install via distributed asset, tempo 30–220, transpose, instrument 128 GM, crossfade, preload neighbors, seekbar + time, muted/volume, autoplay-next modes, queue persistence (localStorage + IndexedDB `gys-playlist-backup`).
- Playlist manager: CRUD, reorder, import/export JSON, auto-next modes (off/one/number/playlist/shuffle-all/shuffle-playlist), active playlist, backup restore, playlist card list + detail, song add via list button.
- PDF viewer: page fit/single/double/vertical/horizontal, zoom 100–800%, pinch/wheel zoom, double-tap reset, page nav, orientation warning, chord layer note-aligned + grid editor, transpose keyboard shortcuts, auto-hide toolbar, PDF.js local worker.
- Data caching: `gys-data-cache` IndexedDB with 30 s revalidation + `gys-data-updated` events; `assets-list`/`assets-lyrics`/`assets-chord-list` equivalents live in generated `offline/hymn-catalog.json` + `music-lock.json`.
- Search: normalized lyric index, AND token matching, prefix fallback, re-filter on data update.
- Chord engine: note-aligned v2 `.chord.json`, note extraction from PDF (noteIdx → xPct/yPct), chord transposition with accidental sharp/flat, family-chord key dropdown, natural-chord preference (-1 for black keys), hold-repeat steppers.
- Appearance: theme light/dark/system/sepia/amoled, accent presets + custom, locale id/en/zh.
- Auto-update: SW version + `CLEAR_CACHE`/`GET_VERSION` message API equivalent via `more.tsx` reset + `sw.js`.

## Skipped (data not available upstream or superseded)

- SoundFont switching (GeneralUser-GS vs TimGM6mb): upstream `soundfont-manifest.json` only publishes GeneralUser-GS; adding TimGM6mb would require publishing new release assets. The soundfont active label is already shown.

Song favorites and Google Drive backup remain intentionally absent because the
functional source removed them.

The statuses intentionally distinguish implemented behavior from GA evidence.
No row is marked `PARITY` until the scope-specific benchmark, accessibility,
device, or protected-service evidence named in the final column is attached.
This prevents the matrix from claiming a full GA sign-off merely because a
route or control exists locally.
