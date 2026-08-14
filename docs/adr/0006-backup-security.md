# ADR 0006 — Backup and security

Status: accepted

`BackupEnvelopeV2` uses AES-GCM with random salt/nonce and authenticated
metadata. Legacy `.gysbk` import is one-way, validates every domain, and never
exports the static-key/zero-IV format. BFF endpoints enforce origin allowlist,
CSRF/CORS policy, rate limiting, schema validation, sanitization, cache headers,
and structured errors.
