# Feature parity matrix (initial baseline)

This is a living matrix. `PARITY` is reserved for an exercised behavior and
attached test evidence; `PLANNED` is not a claim of completion.

| Area             | Canonical behavior discovered                                  | Rewrite status                   | Evidence / remaining proof                                                                                   |
| ---------------- | -------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Shell/navigation | Five destinations, responsive bottom nav/rail/sidebar          | IMPLEMENTED / NEEDS VERIFICATION | Playwright responsive matrix, Axe Home; full device/screen-reader audit remains.                             |
| Kidung text      | 533-item catalog, ordered search, wrapping, verse navigation   | IMPLEMENTED / NEEDS VERIFICATION | Search golden tests, wrapped-chord E2E, visual baselines; canonical-vs-rewrite benchmark remains.            |
| Chord            | 140 canonical files, immutable commit fetch, cache/SWR/pinning | IMPLEMENTED / NEEDS VERIFICATION | Contract/domain/cache tests and PDF/Text overlay E2E; full 140-file position audit remains.                  |
| MIDI             | 128 GM programs, TimGM/GeneralUser, transport, playlist modes  | IMPLEMENTED / NEEDS VERIFICATION | Parser/transport/cache tests and load/minimize E2E; canonical median/p95 and long-session profile remain.    |
| PDF              | Local PDF.js worker, page/zoom/resume, text/PDF mode switch    | IMPLEMENTED / NEEDS VERIFICATION | PDF.js worker, fork-PDF load/download, layout/resume/retry E2E; device matrix remains.                       |
| Bible            | TB pack, reader, search, references, notes, split versions     | IMPLEMENTED / NEEDS VERIFICATION | TB/search/split/selection E2E; additional installed versions/pericope fixtures remain.                       |
| TTS              | Edge compatibility provider with offline capability fallback   | IMPLEMENTED / NEEDS VERIFICATION | Provider/orchestrator tests and local capability detection; protected Edge gateway and device voices remain. |
| Iman             | Ten topics, multilingual search/copy/share/note                | IMPLEMENTED / NEEDS VERIFICATION | Local data and contextual-action implementation; full locale/device review remains.                          |
| Backup           | Legacy `.gysbk` one-way import, new AES-GCM envelope           | IMPLEMENTED / NEEDS VERIFICATION | Domain round-trip/migration tests; cross-platform file-picker verification remains.                          |
| Account          | Normalized Google/Apple/e-GYS session/profile                  | IMPLEMENTED / NEEDS VERIFICATION | Upstream route contract, schema tests, secure-cookie boundary; protected OAuth/Worker exercise remains.      |
| Literature       | Real catalog, covers, resume, internal PDF/article reader      | IMPLEMENTED / NEEDS VERIFICATION | Catalog/progress tests, internal PDF load/download/retry E2E; full catalog/cover audit remains.              |
| Sauh / Suara     | Daily canonical Sauh and trusted internal Suara feed           | IMPLEMENTED / NEEDS VERIFICATION | Source parsing, outage, daily-selection, internal-reader E2E; production upstream monitoring remains.        |
| Media            | One persistent minimizable MIDI/TTS surface with handoff       | IMPLEMENTED / NEEDS VERIFICATION | Cross-route/minimize/queue E2E; native audio-focus matrix remains.                                           |

Song favorites and Google Drive backup remain intentionally absent because the
functional source removed them.

The statuses intentionally distinguish implemented behavior from GA evidence.
No row is marked `PARITY` until the scope-specific benchmark, accessibility,
device, or protected-service evidence named in the final column is attached.
This prevents the matrix from claiming a full GA sign-off merely because a
route or control exists locally.
