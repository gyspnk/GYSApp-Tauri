# Fresh-install and retained offline content

Reviewed 2026-10-07. Packaged availability, service-worker preparation and
requested downloads are distinct states.

## Packaged data

- TB SQLite and its browser reader/search projection: 66 books, 31,172 verses.
- 533 source-backed KR/core hymn entries, including six A/B variants, with
  small metadata separate from full lyrics; six collection definitions.
- 1,229 immutable music-lock entries, including 161 canonical chord references.
  A reference is not a downloaded binary.
- Ten complete belief topics in ID/EN/ZH plus ten local official Indonesian PDFs.
- Sauh/Suara and a 300-item literature snapshot; Fork KR page-range manifest.
- Church assets/fonts, TimGM6mb and local FluidSynth runtime; one canonical
  score PDF seed. GeneralUser-GS is optional.

`pack-manifest.json` records integrity for 11 core data projections;
`asset-manifest.json` separately lists distributed/packaged assets. Do not edit
hashes or counts by hand. Faith PDF provenance lives in its own manifest.

## Browser/PWA preparation

Service-worker generation v25 prepares the shell/build/code and compact offline
indexes, including `startup.js`, with verified emitted-build identity. Editorial
snapshots survive shell updates in their separate content cache. TimGM/runtime
warming follows shell readiness and optional connection policy. Complete MIDI/
remaining PDF files load on demand or explicit installation; chord startup sync
downloads only missing/changed payloads rather than bulk-redownloading the cache.
Native builds use packaged assets and do not register the browser PWA worker.

Cached first paint and route-intent warming reduce waits. Fresh optional content
still needs network/source retrieval, and a catalog image/link is not a complete
publication download. Browser storage eviction can remove retained bytes.

## Updates and recovery

A configured `VITE_ASSET_MANIFEST_URL` can supply a newer HTTPS manifest;
otherwise use the bundled version. Downloads stage only changed assets, validate
size/hash and atomically activate the new pointer. A failed stage retains the
last valid pack. Chord startup checks similarly compare metadata and download
only missing/changed files, with verified on-demand repair.

The update/activation flow preserves an active reader/editor/audio session.
Reset drains pending work before clearing owned IndexedDB/Cache Storage/native
app-data. See [cache/preload](../cache-and-preload.md) and
[operations](../operations.md) for exact owners and retry versus reset.
