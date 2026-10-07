# Security policy

Reviewed 2026-10-07. Do not report suspected vulnerabilities publicly. Send a
minimal reproduction and affected commit to maintainers through the private
security channel configured for the `gyspnk` organization.

The BFF treats remote content as untrusted: exact origin allowlists, cookie-CSRF
boundary, typed schemas/errors, bounded requests/rate limits, CSP, URL sanitation
and immutable hash checks are required. Public cached content excludes private
account/provider responses. Article HTML is reduced to sanitized reader data;
PDF transport permits only validated trusted TJC/S3 sources and rejects HTML
error bodies before PDF.js.

Browser e-GYS tokens remain in HttpOnly cookies. WhatsApp relay is bound to the
reference cookie and allowed origin; clients cannot select an upstream host or
send arbitrary upstream commands. Automatic confirmation validates the matching
reference and sender phone. Apple authorization validates state before exchange.
Tauri accepts only official-origin logged-in bridge commands and keeps opaque
tokens in the OS keyring; raw keyring frontend access and browser-storage secret
fallback are not permitted. Diagnostics redact token/bearer/API-key values.

Secrets/signing material remain protected deployment values, never client build
variables or committed files. Private e-GYS checkouts stay ignored and are
synchronized only by explicit authenticated local maintenance. New encrypted
backups use random salt/nonce AES-GCM; legacy encryption is import-only.

Integrity, storage/reset cancellation and source provenance are independent
from immersive copy/context-menu suppression. That UI behavior is not content
access control. See [architecture](docs/architecture.md),
[e-GYS integration](docs/egys-integration.md) and [operations](docs/operations.md)
for current boundaries and protected acceptance requirements.
