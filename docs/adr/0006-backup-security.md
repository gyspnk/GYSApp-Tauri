# ADR 0006 — Backup and security

Status: accepted

`BackupEnvelopeV2` uses AES-GCM with random salt/nonce and authenticated
metadata. Legacy `.gysbk` import is one-way, validates every domain, and never
exports the static-key/zero-IV format. BFF endpoints enforce an origin allowlist,
CORS policy, and a cookie-CSRF boundary: state-changing requests carrying a
cookie must include an allowlisted `Origin` or same-site Fetch Metadata signal;
the native adapter may send the explicit `x-gys-client: native` marker. Rate
limiting, schema validation, sanitization, cache headers, and structured errors
remain mandatory for every route.
