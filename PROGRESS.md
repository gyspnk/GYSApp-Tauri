# GYSApp-Tauri progress

Status meanings: `Done & Verified` means the implementation, relevant tests,
local manual flow, and documentation have all been checked. `Implemented /
Needs Verification` means the code exists but depends on a protected external
service or platform artifact that cannot be exercised in this workspace.

## Done & Verified

- Clean-room MIT pnpm monorepo, typed contracts, responsive Quiet Sanctuary
  shell, local PWA assets, and GitHub Pages delivery.
- TB Bible, multilingual faith list with contextual actions, 533-song hymn
  catalog, ordered search, persistent reading/activity state, and single
  `Lanjutkan` home item.
- Today's Sauh Bagi Jiwa and real Suara Sejati feed with validated static
  snapshots, online/BFF revalidation, image mapping, and offline recovery.
- GYSChordWeb chord manifest/cache/integrity validation, GYSApp-Fork hymnal
  PDF database fallback, local PDF.js worker, canonical MIDI loading, and
  shell-level minimizable media surface.
- Literature ebook shelf, category/filter/sort discovery, detail route,
  local favorites, reading progress, verified PDF offline cache, and explicit
  error/retry states. The generated real TJC snapshot maps 279/297 catalog
  entries to source cover images; the remaining 18 have explicit source-backed
  fallback because no cover is exposed by the upstream metadata.
- Native e-GYS BFF/session/profile adapter with branch and membership mapping;
  no WebView or client-side credential storage.
- Local-first e-GYS revision/route-contract synchronization, generated route
  metadata, breaking route removal detection, repository-managed pre-commit
  and pre-push hooks, and documented workflow.
- Formatting, lint, strict typecheck, unit/contract tests, production build,
  bundle budget, generated provenance, and Playwright smoke coverage pass
  locally.

## Implemented / Needs Verification

- Live e-GYS OAuth/session/profile requires protected Worker configuration and
  a reachable production backend; preview builds intentionally show a safe
  signed-out state when those secrets are absent.
- Native Tauri packaging/signing and iOS/Android store artifacts require their
  platform toolchains and signing material.
- Full canonical-vs-rewrite MIDI performance parity, screen-reader audit, and
  visual baseline review require the target device/browser matrix.

## Next controlled work

- Add cover URL records to the versioned asset manifest when the source begins
  exposing a stable version/checksum for them.
- Extend e-GYS contract extraction with OpenAPI request/response schemas when
  the upstream API document is available in the authenticated checkout.
