# Architecture problems and migration risks

- The legacy chord downloader omits the source commit from its raw URL; the
  rewrite validates immutable ref, size, and hash before changing a pointer.
- The legacy backup format uses a static key and zero IV; it is import-only and
  never re-exported. New backups use versioned AES-GCM with random salt/nonce.
- Canonical MIDI uses runtime CDN imports and duplicate fetches; the rewrite
  vendors worker/WASM, deduplicates raw/render caches, and measures cold/warm
  median/p95 before enabling streaming.
- Web offline speech is capability-dependent. Edge no-key is a compatibility
  service, not an official Azure API; native providers must remain OS-offline.
- OAuth, signing, store submission, and Cloudflare deployment require protected
  credentials and are not represented as GA evidence until supplied.
