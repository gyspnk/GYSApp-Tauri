# Feature parity matrix (initial baseline)

This is a living matrix. `PARITY` is reserved for an exercised behavior and
attached test evidence; `PLANNED` is not a claim of completion.

| Area             | Canonical behavior discovered                                  | Rewrite status |
| ---------------- | -------------------------------------------------------------- | -------------- |
| Shell/navigation | Five destinations, responsive bottom nav/rail/sidebar          | IN PROGRESS    |
| Kidung text      | 533-item catalog, ordered search, wrapping, verse navigation   | IN PROGRESS    |
| Chord            | 140 canonical files, immutable commit fetch, cache/SWR/pinning | IN PROGRESS    |
| MIDI             | 128 GM programs, TimGM/GeneralUser, transport, playlist modes  | IN PROGRESS    |
| PDF              | Local PDF.js worker, page/zoom/resume, text/PDF mode switch    | IN PROGRESS    |
| Bible            | TB pack, reader, search, references, notes, split versions     | IN PROGRESS    |
| TTS              | Edge compatibility provider with offline capability fallback   | PLANNED        |
| Iman             | Ten topics, multilingual search/copy/share/note                | IN PROGRESS    |
| Backup           | Legacy `.gysbk` one-way import, new AES-GCM envelope           | IN PROGRESS    |
| Account          | Normalized Google/Apple/e-GYS session/profile                  | PLANNED        |

Song favorites and Google Drive backup remain intentionally absent because the
functional source removed them.
