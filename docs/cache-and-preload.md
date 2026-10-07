# Cache, loading and preload reference

Reviewed 2026-10-07. This describes implementation bounds; cold network, device
performance and storage eviction remain external to a cache-hit guarantee.

## Startup and route intent

`public/startup.js` restores the saved theme before React paints. The logo and
loading track occupy a stable first frame. Bootstrap bytes participate in the
build identity, service-worker integrity and the 180 KiB initial JS budget.

`route-preload.ts` shares route promises, removes rejected promises for retry
and warms destinations sequentially during idle time after first paint.
Save-Data/2G connections suppress optional idle warm-up. Link intent prepares
local modules/data; direct score and literature-reader intent can prepare
PDF.js. Navigation uses a bounded wait rather than allowing preload to block
indefinitely. View transitions preserve the shell/player and restore the
incoming scroll position before capture.

Hymn metadata is separate from the full lyric payload. Settings do not need the
song catalog; playlist/catalog views load independently. The TB pack is shared,
and its search index/worker starts only when actual search needs it. Text-only
hymn entry does not prepare soundfonts, render PCM or fetch neighboring scores.
Active score mode may warm neighbors; active playback may warm neighboring MIDI.
User preload/data-saving preferences remain authoritative.

## Cache owners

| Store                     | Identity / bound                                                                                    | Recovery                                                                                              |
| ------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Build shell               | `gysapp-shell-v25` plus emitted build identity; integrity of bootstrap/modules/core                 | Reject partial/mixed build; retain usable active shell until explicit activation.                     |
| Editorial JSON            | Separate `gysapp-content-v1`; cached first paint + shared background refresh                        | Keep usable snapshot when live refresh fails; daily Sauh selection still follows publisher/day rules. |
| Remote covers             | `gysapp-remote-media-v1`, at most 96 successful entries                                             | Bounded cleanup; reserved image geometry/fallback avoids layout spikes.                               |
| Chord disk                | Immutable commit/path/SHA pointers, 25 MiB LRU, pinned entries protected, 14-day rollback retention | Preserve previous verified bytes on failure; repair missing/corrupt data on read.                     |
| Chord memory              | Verified parsed results, 32 entries / 1 MiB                                                         | Evict cold parses; disk remains independently reusable.                                               |
| MIDI raw / parse          | Immutable source hash and shared loader/model                                                       | Share concurrent requests, retry failed fetches, reject stale load generations.                       |
| MIDI PCM / AudioBuffer    | Source, SoundFont, tempo, transpose, instrument and sample rate; 128 MiB default cap                | Reuse completed renders; failed/superseded work cannot replace current playback.                      |
| Hymn PDF bytes            | Resolved immutable source identity and integrity checks                                             | Cache validated bytes; prune on writes, not on each MIDI read.                                        |
| PDF document workers      | Shared leases, at most two idle documents, 30-second idle lifetime                                  | Retry invalidates only its source; active readers retain their own lease.                             |
| Literature PDF links      | Validated issue→official URL; up to 64, 24-hour freshness                                           | Share requests, bound time, retry failed discovery and fall back for older Worker metadata.           |
| Literature resume         | Resource version + page/scroll                                                                      | Validate version/page before reuse; clamp invalid positions.                                          |
| Preferences / annotations | Versioned local records                                                                             | Validate/migrate affected records; reset is explicit.                                                 |

Consult the implementations for exact units and evolving budget constants;
these caches are separate allocations, not a single global memory reservation.

## Incremental chord synchronization

Each launch schedules a manifest check after first paint. Reconnect, six-hour
age and manual refresh are additional triggers, with a 60-second cooldown and
one manifest request in flight. Startup compares verified metadata instead of
opening every payload. Only missing, changed or legacy entries need download/
verification, with at most three concurrent songs. HTTP conditional validation
is used without adding raw-GitHub CORS-breaking conditional request headers.

Identical canonical bytes can be reused across source commits while the
normalized document retains provenance. Reads validate bytes before admitting
them to memory; concurrent readers share that verification. Negative missing-
chord records are scoped by source commit and expire with retention. Serialized
pointer mutations persist before deleting replaced blobs; advisory access order
flushes in batches. A failed new pointer cannot poison the previous cache.

Chord geometry and source key come from the same PDF lease as the viewer.
Canonical chord key and score key can differ: hymn 001's canonical chords are
C while its score is Es. The shared base offset bridges them before user
transpose/capo; no second unrelated PDF is used for overlay coordinates.

## MIDI work scheduling

TimGM is packaged; GeneralUser remains optional. Opening the UI does not start
PCM rendering. Actual playback loads the local FluidSynth worker/WASM and bank.
Foreground playback takes priority over adjacent-track work, which uses the
same setting-aware key. Metadata cache checks do not copy PCM arrays; audio
clock/time fragments subscribe separately from settings, chord layout and page
content. Cancelled preload cannot resurrect its queue after a late bank result.
Web Audio cleanup is synchronous; stale metadata cannot undo a user transpose.

The oscillator compatibility backend remains explicit when worker/WASM audio
cannot run. It is not described as equivalent SoundFont playback. Media Session
callbacks read current refs instead of reinstalling at every position tick.

## PDF transport, zoom and cleanup

Official literature URLs use the public content Worker even when the optional
login/build BFF variable is empty. Source discovery requests the minimal
publisher metadata and validates TJC/S3 URLs. Streaming preserves Range,
Content-Range, Accept-Ranges and Last-Modified; CORS exposes the headers needed
by PDF.js. HTML error pages are rejected before trusted mirror fallback.

PDF.js and its worker stay lazy. Shared document leases deduplicate viewer/chord
loading. Completed spreads paint together; page navigation crossfades the
completed page, while zoom/resize retain the current preview. Visible-region
vector detail tiles provide sharper enlarged content without allocating the
whole document at extreme zoom. Idle page canvases/operator lists are released.
Continuous readers preload half a viewport beyond each edge; the margin adapts
on resize rather than retaining a fixed pixel buffer on smaller screens.
Ctrl+wheel/pinch uses anchored smooth geometry; enlarged pages accept pointer/
single-touch pan. Retry cancels/invalidate-releases only the current source,
not unrelated documents or the PDF runtime.

## Service worker and private data

Generation v25 separates verified shell preparation, retained editorial
snapshots and bounded successful media. TimGM/runtime warm after shell readiness;
GeneralUser and full PDF packages need an explicit install. Chords sync only
changed/missing entries in the background; MIDI fetching follows playback and
its restricted neighbor preload.
The generated build manifest validates prepared bytes and rejects mixed build
identities. Update activation protects active reading/editing/audio; the previous
usable build is retained when a replacement cannot be prepared safely.

Public API/content caches never store authenticated profile or provider-cookie
responses. Logout, provider cancellation and content-cache reset have different
owners. Browser account tokens live only in the HttpOnly cookie; Tauri secrets
live only in the keyring.

## Reset and verification

Reset disposes chord sync, aborts pending work, drains serialized mutations and
advisory writes before clearing owned stores. Browser reset clears its IndexedDB
and GYS Cache Storage namespaces; native reset clears only versioned app-data
stores and its webview caches. Partial reset failures remain visible. A delayed
startup import cannot repopulate a cache during reset.

Focused evidence lives in chord-cache/startup tests, MIDI playback-cache tests,
PDF lease/source/reader tests, `literature-loading.spec.ts`, service-worker tests
and route-preload tests. Source-backed fixtures are immutable; see
[testing](testing-and-maintenance.md) and [the October audit](discovery/loading-cache-audit-2026-10.md).
