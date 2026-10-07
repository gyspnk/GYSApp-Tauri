# Architecture risks and safeguards

Current assessment, reviewed 2026-10-07.

| Risk                                   | Implemented safeguard                                                                                | Remaining evidence / action                                                                          |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Mutable or mismatched music/PDF source | Immutable commit/path/size/SHA, one shared viewer/chord lease and source-key base offset.            | Review actual source updates; retain strict geometry/identity fixtures.                              |
| Stale/corrupt chord data               | Metadata-only startup diff, verified reads, atomic serialized pointers, rollback and bounded caches. | Storage eviction/network still require on-demand recovery.                                           |
| Old or missing literature Worker       | Trusted TJC/S3 source parsing, range/CORS streaming, inline retry and public fallback.               | Deploy current Worker; old hosted 403 is not fixed by Pages alone.                                   |
| Races in media/reader transitions      | Generation cancellation, lease ownership, one content animation, retained/inert menu exits.          | Physical low-end memory/frame measurements remain separate.                                          |
| Browser provider cookies/origins       | HttpOnly session, exact allowed origin, reference-bound relay and sender-phone confirmation.         | Real Google/Apple/WhatsApp account/origin acceptance is still required.                              |
| Native credential bridge               | Official origin/command allowlist and OS keyring; no browser-storage fallback.                       | Packaged real-account/keyring platform smoke.                                                        |
| Optional speech capability             | Actual voice catalog/detected system voices, explicit native/gateway transport and fallback.         | Gateway availability/device installed voices are external.                                           |
| Legacy backups/reset                   | One-way legacy import; versioned random AES-GCM export; scoped drain-before-reset.                   | Cross-platform file picker and real restore acceptance.                                              |
| Startup versus optional assets         | Lazy runtime/indexes, bounded idle intent, packaged TimGM and optional GeneralUser.                  | Cold publisher/device latency is not an instant-load guarantee.                                      |
| Delivery/signing                       | Verified hooks/CI, protected variables, separate Pages/Worker/native workflows.                      | Signed installers, store artifacts and physical-device acceptance are not inferred from compilation. |

Immersive copy/selection suppression is an interaction choice, not a security
boundary. Credentials and trusted content are protected by server validation,
cookies/keyring, sanitization and integrity checks. Runtime limits and cache
budgets must be adjusted from measured bottlenecks, not arbitrary success claims.
