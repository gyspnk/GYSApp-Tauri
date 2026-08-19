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

Song favorites and Google Drive backup remain intentionally absent because the
functional source removed them.

The statuses intentionally distinguish implemented behavior from GA evidence.
No row is marked `PARITY` until the scope-specific benchmark, accessibility,
device, or protected-service evidence named in the final column is attached.
This prevents the matrix from claiming a full GA sign-off merely because a
route or control exists locally.
