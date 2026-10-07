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

## Implementation review — 2026-10-07

Public literature source parsing/proxying allows only validated TJC/S3 PDF URLs,
rejects HTML error bodies, preserves streamed range headers and bounds fallback.
WhatsApp tracking is a reference-cookie-bound relay to the fixed official
origin; it is not an arbitrary upstream WebSocket tunnel. Sender-phone and
reference validation precede automatic confirmation. Provider tokens never
enter JS storage. See [security policy](../../SECURITY.md) and
[e-GYS integration](../egys-integration.md).
