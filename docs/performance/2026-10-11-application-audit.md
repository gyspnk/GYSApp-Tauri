# Application backend, UI, performance and packaging audit

Source baseline: `b695d423a7341d83f81aee09e707f67d8480d136`, with the existing
uncommitted unified Kidung controls preserved. Measurements below describe
local production web builds and Chromium; no APK, EXE, tag or release was made.

## Reproduced inefficiencies and corrections

| Area                    | Reproduction                                                                                                                                                                                                               | Correction                                                                                                                                                                                                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Literature backend      | The optional book request did not start until the main catalogue response completed.                                                                                                                                       | Request both independent official sources concurrently, preserving item order and main-catalogue recovery.                                                                                                                                                                     |
| Image backend           | A stalled source blocked mirrors; a successful HTML error page was returned as an image.                                                                                                                                   | Bound each connection to 3 seconds within an 8-second shared budget; cancel failed bodies and reject explicit non-image responses. Successful bodies remain streamed without a probe timeout.                                                                                  |
| Article cancellation    | Cancelling the primary request launched another fallback and lost the abort reason.                                                                                                                                        | Check cancellation before network/after decoding and before fallback or persistence.                                                                                                                                                                                           |
| Offline article reading | Expiring the 24-hour cache deleted the complete body; preference migration deleted good article bodies and active shell caches, and full storage prevented startup; writes duplicated full bodies into both storage areas. | Keep the last good complete body while refreshing and migrating preferences, retain the shell's independent build lifecycle, tolerate a failed migration marker write, use one durable copy with a session fallback, and bound memory to 32 entries / 4 MiB estimated strings. |
| Bible search worker     | Queued cancellation still scanned verses; unknown cancellation IDs remained retained; a reinitialized index could publish old results.                                                                                     | Defer a queued scan to a cancellable job, remove completed jobs, and ignore cancelled/retired results. An already-running synchronous scan is not forcibly interrupted.                                                                                                        |
| MIDI memory             | Reading 40 distinct source hashes retained every raw and parsed model.                                                                                                                                                     | LRU bounds: 32 entries per cache, 2 MiB raw bytes and an 8 MiB conservative parsed-event estimate. Oversized valid files still load and play.                                                                                                                                  |
| Queue synchronization   | A storage event notified readers but left their immutable playlist snapshot unchanged; late backup restoration could overwrite a newer external edit.                                                                      | Validate and install the external snapshot once, retire the older backup, and notify UI/playback settings without writing storage again.                                                                                                                                       |
| Speech cancellation     | Cancelling during provider readiness/failure still started the next voice.                                                                                                                                                 | Abort before/after readiness and speech, preserving normal fallback for real provider failure.                                                                                                                                                                                 |
| Bible header rendering  | Real SoundFont playback caused 6 unrelated header renders over 1.5 seconds.                                                                                                                                                | Stable derived MIDI/voice snapshots produced 0 extra header renders in the same probe; pause still updates the header.                                                                                                                                                         |
| Startup graph           | The shell's queue import made MIDI parser, loader and unrelated domain exports reachable before audio was requested.                                                                                                       | Dedicated package exports and a shared lazy loader, requested alongside catalog/song defaults when playback starts.                                                                                                                                                            |
| Runtime packing         | Both the complete TB JSON and its 7,016,448-byte SQLite generator input shipped in public assets.                                                                                                                          | Move the unmodified SQLite source outside public assets; regenerate references and reject SQLite build sources in runtime output. SQL translation support and all verse content remain.                                                                                        |
| Hymnal PDF probes       | Each failed/stalled source received a new 8-second timeout, delaying healthy mirrors and allowing retries to exceed the overall budget.                                                                                    | Give the preferred source a 250 ms head start, then probe alternatives together under one 8-second deadline; inspect only the PDF signature, cancel losing probes and release both timers.                                                                                     |
| Typecheck output        | Running prepush after the production build added 15 compiler/test/declaration/map files (103,661 bytes) to runtime `dist`.                                                                                                 | Emit into ignored `.typecheck` instead; runtime verification rejects compiler/debug artifacts while retaining bundled workers and bootstrap scripts.                                                                                                                           |

## Measurements and verification

This section and the JSON receipt record the local audit on 2026-10-11,
including Git status at measurement time. Subsequent changes and CI results
are tracked in Git history and Actions.

Initial baseline: 47,260,284 web-output bytes across 135 files; initial
JavaScript 179.0 KiB gzip. Thirty local startup samples measured median
479.8 ms and p95 602.8 ms. These are warm/repeated Chromium page loads with
the existing harness, not a cold Android startup or a public-network benchmark.

Final web output measures 40,152,934 bytes across 133 files: 7,107,350 bytes
less, a 15.04% reduction. Initial JavaScript is 175.0 KiB gzip against the
unchanged 180 KiB budget. Thirty follow-up startup samples measured median
457.9 ms and p95 597.7 ms; this is a local repeated-load comparison and the
p95 difference is small. Header playback probes measured 6 → 0 unrelated
renders per 1.5 seconds while retaining transport-state updates.

The TB reader SHA256 remains
`7b022c06f36ef2d0fedef894f9297ddc8f4573d08184c77f4ba2d00352a83d3c`.
The relocated SQLite SHA256 remains
`08173f05e2bbbcb1bfba7b4b12e78d57cbf67004e1fc92ad5879b9ba27b8f57c`.
Integration tests compare every canonical book/chapter/verse/pericope/cross-ref
against that input. PDFs, fonts and SoundFont instruments remain available.

`pnpm verify:prepush` passes format, documentation, generated provenance and
workspace typechecks; 20 contracts, 45 domain, 2 testkit, 74 backend and
475 web tests pass, alongside the existing policy/script checks and the new
packing guard. `verify:bundle` passes at 175.0 KiB; `verify:native-assets`
passes with 24 core files and 17,282,483 asset bytes.

The responsive audit passed all 102 browser cases: 320–1920 px, three locales,
five themes, 200% text, focus/touch targets and article contrast. Cached/refreshed
articles, real cross-tab storage and actual SoundFont playback/render counts
pass their four new browser regressions. The reader/PDF/CDP-touch run passed
65 cases with retries disabled; the remaining PCM-cache case first hit an old
helper that selected both the tempo slider and number field. Selecting the
slider explicitly preserves its musical/cache assertions; that case passed
again with retries disabled. All 66 distinct cases have successful coverage
on the tested production build.

After isolating TypeScript output, all 94 tested runtime/bootstrap/manifest
fingerprints remain identical. Re-running full prepush leaves `dist` at the
same 133 files / 40,152,934 bytes; native asset and bundle checks pass again.
Machine-readable counts, budgets, hashes and local limitations are retained
in [the audit receipt](2026-10-11-application-audit.json).

Native command and Android accent/safe-area sources were inspected. Rust,
Android SDK and device execution are unavailable in this workspace; native
runtime measurements and final APK/EXE archive savings remain unmeasured.
Worker deployment, live-account sign-in and remote Actions are outside this
local verification. Remote `main` was independently read with `git ls-remote`
and remains `b695d423a7341d83f81aee09e707f67d8480d136`. At measurement time, these changes were local
and had not been committed/pushed.
