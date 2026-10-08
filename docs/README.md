# Application documentation

Reviewed against the working implementation and generated inventories on
**2026-10-07**. Current docs describe shipped code; deployment, provider-account
success, signed binaries and physical-device results require their own evidence.

## Current guides

| Document                                              | Purpose                                                                            |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [Project README](../README.md)                        | Features, setup, architecture and delivery overview.                               |
| [User guide](user-guide.md)                           | How to use readers, the numeric Bible picker, player, providers and offline tools. |
| [Architecture](architecture.md)                       | Runtime ownership, data/security boundaries and feature lifecycle diagrams.        |
| [Cache and preload](cache-and-preload.md)             | Startup, synchronization, binary/PCM/PDF cache lifetimes and reset behavior.       |
| [UI system](ui-system.md)                             | Church-blue theme, responsive controls, sizing and animation ownership.            |
| [Operations](operations.md)                           | Build variables, Pages/Worker/native delivery and troubleshooting.                 |
| [Testing and maintenance](testing-and-maintenance.md) | Fast verification, release gates, source fixtures and evidence rules.              |
| [e-GYS integration](egys-integration.md)              | Active v1 providers, WhatsApp message tracking, cookies and native keyring.        |
| [Release readiness](release-readiness.md)             | Current receipt, historical checks and remaining protected acceptance gates.       |
| [Codebase map](maintenance/codebase-map.md)           | Current file owners and recorded engineering decisions.                            |
| [Changelog](../CHANGELOG.md)                          | Changes awaiting release.                                                          |
| [Security policy](../SECURITY.md)                     | Disclosure channel and trusted runtime boundaries.                                 |

## Reference documents

| Reference                                                         | Scope                                                                 |
| ----------------------------------------------------------------- | --------------------------------------------------------------------- |
| [Application map](discovery/application-map.md)                   | Routes and presentation modes.                                        |
| [Feature matrix](discovery/feature-parity-matrix.md)              | Implemented behavior, validation and remaining device/provider gates. |
| [Dependencies](discovery/dependency-map.md)                       | Locked runtime/toolchain versions and module-loading policy.          |
| [Asset inventory](discovery/asset-inventory.md)                   | Exact music source counts/bytes, packaged seeds and attribution.      |
| [Offline pack](discovery/offline-pack.md)                         | Bundled projections, precache and requested binary installation.      |
| [Chord source map](discovery/chord-data-source-map.md)            | Commit/hash identity, incremental sync and PDF-key association.       |
| [MIDI capabilities](discovery/midi-capability-matrix.md)          | Transport, musical controls, audio caching and docking.               |
| [Provenance](discovery/provenance.md)                             | Source revisions and reviewed generation boundaries.                  |
| [Architecture risks](discovery/architecture-risks.md)             | Actual operational limitations and migration safeguards.              |
| [Performance baseline](discovery/performance-baseline.md)         | Current build budget and reproducible comparison requirements.        |
| [Native size audit](performance/2026-10-08-native-size.md)        | Repeated APK/NSIS comparisons, lossless assets and native QA limits.  |
| [October loading audit](discovery/loading-cache-audit-2026-10.md) | Dated rationale and regression receipts for recent loading/UI work.   |

ADRs in [adr/](adr/) retain accepted decisions and describe current implementation
where it has evolved. Native adapters are documented in
[apps/native/README.md](../apps/native/README.md); stylesheet ownership in
[styles/README.md](../apps/web/src/styles/README.md). Doctrine PDF and font
provenance are maintained beside their assets.

## Historical evidence

Documents in `plans/`, `superpowers/plans/`, `superpowers/specs/` and dated
September/October audits preserve original proposals, acceptance scopes and
measurements. Their dates, checkboxes, old control names, test counts and bundle
numbers describe that revision. Use the current guides above for current runtime
behavior. Historical receipts are not silently converted into new device or
production results.

Generated JSON contracts, manifests and audits are machine-owned evidence.
Do not hand-edit their revision, counts or hashes during prose maintenance.
Use the corresponding generator and provenance checks when source data changes.

## Update discipline

After a behavior or backend-boundary change, update its user guide/reference,
architecture/ADR when relevant, and changelog. Record validation with the tested
runtime and scope; keep remaining deployment/account prerequisites explicit.
Run `pnpm verify:docs`, formatting and generated-provenance checks before
committing. A manual commit/push instruction authorizes delivery; no requested
push should be described as complete before the remote branch SHA is verified.
