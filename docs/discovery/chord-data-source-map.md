# Chord and data source map

Canonical chord documents are read from `gyschordweb` under the immutable
`{sourceCommit}/{path}` URL shape. A generated `UpstreamMusicLock` records size
and SHA-256 for every derived asset. The app installs metadata and lyrics but
zero chord files; chord content is fetched on first open or explicit pin.

The chord repository uses a stale-while-revalidate manifest (six-hour age,
reconnect, or manual refresh), a 60-second cooldown, one in-flight manifest
request, negative cache per source commit, 14-day rollback retention, and a
25 MB LRU with pinned entries protected from eviction.
