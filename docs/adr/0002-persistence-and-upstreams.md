# ADR 0002 — Persistence and immutable upstreams

Status: accepted

Web persistence uses IndexedDB/Cache Storage; native uses app-data filesystem,
SQLite, and OS credential storage. Canonical music is addressed by immutable
commit and guarded by generated size/hash manifests. Source repositories stay
read-only.

## Implementation review — 2026-10-07

Small records, verified binary pointers, editorial snapshots and build assets
have separate ownership. Reset disposes/drains outstanding work before clearing
owned stores; failed updates retain a last-good pointer. Canonical music is
currently pinned to `e8e7efe1189b5746a2bb542348e221844091c8d1`; machine-owned
locks define counts/hashes. Browser tokens are HttpOnly, native tokens keyring-
backed, and neither enters public content caches. See
[cache/preload](../cache-and-preload.md) and [provenance](../discovery/provenance.md).
