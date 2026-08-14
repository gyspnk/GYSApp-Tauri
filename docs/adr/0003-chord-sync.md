# ADR 0003 — Chord sync and cache

Status: accepted

Chord manifests use stale-while-revalidate with age/reconnect/manual triggers,
one in-flight request, 60-second cooldown, negative-cache by source commit,
14-day rollback retention, atomic pointer replacement, and a 25 MB LRU that
never evicts pinned content.
