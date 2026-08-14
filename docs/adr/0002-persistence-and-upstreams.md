# ADR 0002 — Persistence and immutable upstreams

Status: accepted

Web persistence uses IndexedDB/Cache Storage; native uses app-data filesystem,
SQLite, and OS credential storage. Canonical music is addressed by immutable
commit and guarded by generated size/hash manifests. Source repositories stay
read-only.
