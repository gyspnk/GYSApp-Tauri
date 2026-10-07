# ADR 0003 — Chord sync and cache

Status: accepted

Chord manifests use stale-while-revalidate with age/reconnect/manual triggers,
one in-flight request, 60-second cooldown, negative-cache by source commit,
14-day rollback retention, atomic pointer replacement, and a 25 MB LRU that
never evicts pinned content.

The platform adapter persists document pointers through IndexedDB on the web
and app-data files in Tauri. Blob storage retains its Cache Storage and
in-memory compatibility fallbacks for restricted webviews. Canonical note-aligned V2
documents are accepted alongside the normalized internal shape; the immutable
source commit and SHA-256 remain properties of the manifest reference.

Every launch checks the upstream manifest after first paint. Startup compares
verified pointer metadata instead of reading every payload: only missing,
changed, or legacy entries enter revalidation. Identical canonical bytes remain
reusable across source commits; normalized documents retain commit provenance.
Old canonical pointers without a shape marker are identified on their first
read. The browser's HTTP cache performs conditional manifest validation; explicit
If-None-Match headers are avoided because raw GitHub rejects their CORS preflight.

Opening a chord verifies disk bytes before admitting its parsed document to a
32-entry/1 MiB memory LRU. Concurrent readers share verification. Independently
evicted or corrupted blobs are repaired on demand; failed updates retain the
previous payload. Pointer mutations are serialized and persisted before old
blobs are deleted. Advisory access order is flushed in batches, and GC writes
only when eviction is necessary. Startup downloads remain limited to three
concurrent songs and do not block navigation.

Device reset disposes the repository before clearing storage: abort its fetches,
drain every active worker and serialized mutation, and cancel advisory writes.
A delayed startup import cannot restart synchronization during that reset.
Subsequent reads may create a fresh repository; full startup sync resumes on the
next application launch.

## Implementation review — 2026-10-07

The disk cap is 25 MiB and verified parsed memory is bounded to 32 entries /
1 MiB. Startup concurrency is three songs. The current manifest has 161
canonical files, with 3,738 strict mapped score positions. Displayed PDF key/
geometry and canonical chord key are bridged before user transpose/capo; do not
reuse geometry from a different PDF identity. See
[chord source map](../discovery/chord-data-source-map.md).
