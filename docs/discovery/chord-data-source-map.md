# Chord data and score association

Current reference, reviewed 2026-10-07. The immutable source is
`gyschordweb@e8e7efe1189b5746a2bb542348e221844091c8d1`, with 161 canonical
chord documents. Generated `UpstreamMusicLock` and chord manifest preserve
commit/path/size/SHA; payloads are retrieved only when requested or startup sync
finds a missing/changed verified entry.

Every launch schedules a manifest check after first paint. Six-hour age,
reconnect and manual refresh also trigger SWR, with a 60-second cooldown and one
manifest request in flight. Startup reads verified pointer metadata, not every
cached document; at most three songs synchronize concurrently. Identical bytes
remain reusable across commits while document provenance remains explicit.

Disk retention uses a 25 MiB LRU, protected pinned entries and 14-day rollback/
negative-cache expiry. Verified parsed reads use a 32-entry/1 MiB memory LRU.
Reads share integrity work; evicted/corrupt blobs repair on demand. Pointer
commits are serialized before old blobs are removed; failed updates retain the
previous active document. Reset disposes pending sync before clearing stores.

Text and score chord modes consume the same verified v2 source. PDF key and note
geometry come from the same displayed immutable PDF lease, with cached page
notes/layout. The canonical key can differ from the score key: hymn 001 uses C
chords while the score is Es. A shared base offset is applied before user
transpose/capo; overlay labels sit above notation and animate visibility.

The checked strict geometry audit is 161 files / 3,738 mapped positions, zero
orphan/invalid positions. It is source-byte evidence, not a claim that every
published lyric/score has canonical chords. Retryable download errors remain
distinct from songs with no published chord reference.

Owners: `chords.ts`, `chord-cache.ts`, `chord-layout-pdf.ts`, `hymn-pdf-meta.ts`,
`pdf-document-cache.ts`, `packages/domain/src/chord-sync.ts`. See
[ADR 0003](../adr/0003-chord-sync.md) and [cache/preload](../cache-and-preload.md).
