# Asset Management and Optional Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Settings asset manager that installs and uses GYSApp-Data Bible, hymnal, and SoundFont packages while keeping GitHub Pages first-load caching limited to the core offline pack.

**Architecture:** Keep the existing core `AssetManifestV1`/service-worker path for bundled Pages assets. Add a distributed catalog and installed-registry layer for GYSApp-Data release tracks, decode GYSPKG1 packages before atomic activation, and expose the manager through the existing Data & Offline Settings card. Generalize the BibleReaderPack seam and use a lazy SQLite WASM adapter for downloaded Bible databases; use pinned Fork metadata plus GYSApp-Data PDFs for optional hymnals.

**Tech Stack:** TypeScript, Zod, React 19, Vitest, Vite, Cache Storage, IndexedDB/localStorage registry, Web Crypto AES-CTR, DecompressionStream, lazy `sql.js` SQLite WASM, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-18-asset-management.md`

## Global Constraints

- GYSApp-Data remains the authoritative source for optional release payloads.
- GitHub Pages service-worker installation must not precache optional large payloads.
- Every downloaded package must pass declared size and SHA-256 validation before activation.
- A failed update must leave the previous installed asset usable.
- Existing core assets and prior Suara Sejati changes must remain compatible.
- No production code is written before its corresponding failing test is observed.

---

### Task 1: Generalize the Bible reader contract

**Files:**

- Modify: `packages/contracts/src/index.ts` around the Bible pack schemas
- Test: `packages/contracts/src/index.test.ts`

**Interfaces:**

- Produces a Bible pack contract whose `translation` accepts supported
  non-empty codes while preserving the existing TB data shape.

- [ ] **Step 1: Write the failing test**

Add a contract test that parses a minimal valid `BibleReaderPack` with
`translation: "KJV"` and a minimal valid `BiblePackManifest` with the same
translation, while retaining the existing TB fixture assertions.

- [ ] **Step 2: Run the focused contract test and verify it fails**

Run: `pnpm --filter @gys/contracts test -- src/index.test.ts`

Expected: FAIL because both schemas currently accept only the literal `TB`.

- [ ] **Step 3: Write the minimal implementation**

Change only the translation schema constraints from the TB literal to a
non-empty string. Do not change the version, book, verse, digest, or byte
constraints.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `pnpm --filter @gys/contracts test -- src/index.test.ts`

Expected: PASS with the existing contract tests still green.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/index.ts packages/contracts/src/index.test.ts
git commit -m "feat: allow distributed Bible translations"
```

### Task 2: Add distributed catalog contracts and fallback snapshot

**Files:**

- Modify: `packages/contracts/src/index.ts`
- Test: `packages/contracts/src/index.test.ts`
- Create: `apps/web/public/offline/distributed-assets.json`
- Create: `scripts/generate-distributed-assets.mjs`
- Modify: `package.json` scripts only if the repository exposes generated-data commands there

**Interfaces:**

- Produces schemas/types for release tracks, package entries, normalized asset
  definitions, and the offline catalog snapshot.
- Produces a generator that reads the three stable GYSApp-Data manifests and
  emits the checked-in fallback without changing release URLs.

- [ ] **Step 1: Write the failing contract tests**

Add fixtures for the three current GYSApp-Data manifests and assert that the
combined catalog parses the supported codes `b_kjv`, `b_cuv`, `HYMNE`, `MDR`,
`ASM-I`, `ASM-M`, `ASM-P`, and `GeneralUser-GS`, including positive sizes,
checksums, release tags, and GitHub release URLs.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `pnpm --filter @gys/contracts test -- src/index.test.ts`

Expected: FAIL because the distributed catalog schemas do not exist.

- [ ] **Step 3: Implement the schemas and generator**

Add strict Zod schemas for track/package/catalog data. Normalize source JSON
without embedding downloaded bytes. Implement the generator using the exact
stable raw URLs and preserve the current manifest's release metadata.

- [ ] **Step 4: Generate the fallback snapshot and verify it**

Run: `node scripts/generate-distributed-assets.mjs`

Expected: the snapshot contains every supported optional code and no local
payload bytes.

- [ ] **Step 5: Run contract tests and generated checks**

Run: `pnpm --filter @gys/contracts test -- src/index.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src/index.ts packages/contracts/src/index.test.ts apps/web/public/offline/distributed-assets.json scripts/generate-distributed-assets.mjs
git commit -m "feat: add GYSApp-Data distributed asset catalog"
```

### Task 3: Implement manifest loading and GYSPKG1 decoding

**Files:**

- Create: `apps/web/src/distributed-assets.ts`
- Create: `apps/web/src/distributed-assets.test.ts`
- Create: `apps/web/src/distributed-package.ts`
- Create: `apps/web/src/distributed-package.test.ts`
- Modify: `apps/web/src/asset-store.ts` only if a verified byte helper is needed

**Interfaces:**

- `loadDistributedCatalog(options?): Promise<DistributedAssetCatalog>`
- `parseDistributedCatalog(value): DistributedAssetCatalog`
- `decodeDistributedPackage(bytes): Promise<Uint8Array>`
- `verifyDistributedPackage(package, bytes): Promise<void>`

- [ ] **Step 1: Write failing manifest tests**

Cover runtime manifest normalization, snapshot fallback, duplicate-code
rejection, untrusted URL rejection, and retention of all supported definitions.

- [ ] **Step 2: Run the tests and verify they fail**

Run: `pnpm --filter @gys/web test -- src/distributed-assets.test.ts`

Expected: FAIL because the loader and parser do not exist.

- [ ] **Step 3: Implement the catalog loader and validation**

Fetch the three raw manifests in parallel, parse them through the contracts,
and fall back to the same-origin snapshot on network or parse failure. Keep
the caller-independent supported definition labels in the web module.

- [ ] **Step 4: Run manifest tests and verify they pass**

Run: `pnpm --filter @gys/web test -- src/distributed-assets.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing package decoder tests**

Use a known small plaintext fixture and a deterministic GYSPKG1 fixture built
with the Fork key. Assert raw bytes pass through, valid packages decode to the
plaintext, and bad header, bad padding, and truncated ciphertext fail.

- [ ] **Step 6: Run decoder tests and verify they fail**

Run: `pnpm --filter @gys/web test -- src/distributed-package.test.ts`

Expected: FAIL because the decoder does not exist.

- [ ] **Step 7: Implement minimal browser-compatible decoding**

Use Web Crypto AES-CTR with a 128-bit counter, strip only valid PKCS#7
padding, and use `DecompressionStream("gzip")`; return raw non-GYSPKG payloads.
Verify package byte count and SHA-256 before decoding.

- [ ] **Step 8: Run decoder tests and verify they pass**

Run: `pnpm --filter @gys/web test -- src/distributed-package.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/distributed-assets.ts apps/web/src/distributed-assets.test.ts apps/web/src/distributed-package.ts apps/web/src/distributed-package.test.ts apps/web/src/asset-store.ts
git commit -m "feat: validate and decode distributed asset packages"
```

### Task 4: Add the installed distributed-asset store and manager

**Files:**

- Create: `apps/web/src/distributed-asset-store.ts`
- Create: `apps/web/src/distributed-asset-store.test.ts`
- Create: `apps/web/src/distributed-asset-manager.ts`
- Create: `apps/web/src/distributed-asset-manager.test.ts`

**Interfaces:**

- `DistributedAssetStore.get(code, version): Promise<Uint8Array | undefined>`
- `DistributedAssetStore.put(record, bytes): Promise<void>`
- `DistributedAssetStore.remove(code): Promise<void>`
- `DistributedAssetManager.loadStatuses(): Promise<ManagedDistributedAsset[]>`
- `DistributedAssetManager.install(code, options?): Promise<void>`
- `DistributedAssetManager.remove(code): Promise<void>`

- [ ] **Step 1: Write failing store tests**

Assert verified payload writes are readable, registry metadata survives a new
store instance, old payloads remain when a new write fails, and deletion does
not affect another asset.

- [ ] **Step 2: Run the tests and verify they fail**

Run: `pnpm --filter @gys/web test -- src/distributed-asset-store.test.ts`

Expected: FAIL because the store does not exist.

- [ ] **Step 3: Implement the store**

Use a versioned Cache Storage entry for payload bytes and a small localStorage
registry for code/version/release/checksum/size/path. Keep pointer replacement
after the cache write; never delete the previous version first.

- [ ] **Step 4: Run store tests and verify they pass**

Run: `pnpm --filter @gys/web test -- src/distributed-asset-store.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing manager tests**

Assert bundled assets report installed, optional assets report available,
install verifies/downloads/decodes/stores/releases status, cancellation leaves
no active record, and update failure preserves the old record.

- [ ] **Step 6: Run manager tests and verify they fail**

Run: `pnpm --filter @gys/web test -- src/distributed-asset-manager.test.ts`

Expected: FAIL because the manager does not exist.

- [ ] **Step 7: Implement the manager**

Connect catalog packages, streaming fetch/progress, package verification,
decoder, store, and status events. Deduplicate simultaneous installs by code
and use `AbortSignal` for cancellation.

- [ ] **Step 8: Run manager tests and verify they pass**

Run: `pnpm --filter @gys/web test -- src/distributed-asset-manager.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/distributed-asset-store.ts apps/web/src/distributed-asset-store.test.ts apps/web/src/distributed-asset-manager.ts apps/web/src/distributed-asset-manager.test.ts
git commit -m "feat: manage installed distributed assets"
```

### Task 5: Integrate the lazy Bible SQLite reader

**Files:**

- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/web/src/bible-distributed.ts`
- Create: `apps/web/src/bible-distributed.test.ts`
- Modify: `apps/web/src/bible.tsx`
- Modify: `apps/web/src/global-bible-search.ts`

**Interfaces:**

- `loadBibleReaderPack(code, store): Promise<BibleReaderPack>`
- `isDistributedBibleCode(code): boolean`
- `availableBibleCodes(statuses): string[]`

- [ ] **Step 1: Add a failing fixture test**

Create a tiny SQLite fixture with the canonical `book` and `bible` tables and
assert `loadBibleReaderPack("KJV", ...)` returns the expected books/verses and
translation code.

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm --filter @gys/web test -- src/bible-distributed.test.ts`

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Add the lazy SQLite dependency and adapter**

Load the WASM runtime only from the distributed Bible path, query ordered rows,
and construct the existing pack. Keep core TB loading unchanged.

- [ ] **Step 4: Run the adapter test and verify it passes**

Run: `pnpm --filter @gys/web test -- src/bible-distributed.test.ts`

Expected: PASS.

- [ ] **Step 5: Add Bible version selection behavior**

Persist the selected code, show available installed versions in the Bible page,
load the selected pack, reset invalid saved positions per code, and keep TB as
the fallback when an optional asset is removed.

- [ ] **Step 6: Run Bible tests and existing reader tests**

Run: `pnpm --filter @gys/web test -- src/bible-distributed.test.ts src/bible-search.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/src/bible-distributed.ts apps/web/src/bible-distributed.test.ts apps/web/src/bible.tsx apps/web/src/global-bible-search.ts
git commit -m "feat: read downloaded Bible translations in web reader"
```

### Task 6: Integrate optional hymnal metadata and PDF payloads

**Files:**

- Create: `apps/web/public/offline/hymn-catalogs.json`
- Create: `scripts/generate-distributed-hymn-catalog.mjs`
- Create: `apps/web/src/distributed-hymnals.ts`
- Create: `apps/web/src/distributed-hymnals.test.ts`
- Modify: `apps/web/src/kidung.tsx`
- Modify: `apps/web/src/pdf.tsx` only if byte-source support is required

**Interfaces:**

- `loadAvailableHymnCatalogs(store?): Promise<HymnCatalogEntry[]>`
- `resolveInstalledHymnalPdf(code, store): Promise<Uint8Array | undefined>`

- [ ] **Step 1: Generate and inspect Fork-derived catalog fixtures**

Use the pinned Fork index/manifests to emit metadata for KR, HYMNE, MDR, ASM-I,
ASM-M, and ASM-P without copying PDF bytes into the web bundle.

- [ ] **Step 2: Write failing hymnal resolution tests**

Assert each supported code maps to the right catalog and installed PDF, while a
missing optional PDF reports unavailable rather than silently using another
book's PDF.

- [ ] **Step 3: Run tests and verify they fail**

Run: `pnpm --filter @gys/web test -- src/distributed-hymnals.test.ts`

Expected: FAIL because the resolver does not exist.

- [ ] **Step 4: Implement catalogs and PDF resolution**

Load the core catalog immediately, merge installed optional catalog entries,
and pass decoded local PDF bytes into the existing viewer path. Keep canonical
KR fallback behavior intact.

- [ ] **Step 5: Run hymnal tests and existing media tests**

Run: `pnpm --filter @gys/web test -- src/distributed-hymnals.test.ts src/fork-pdf.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/public/offline/hymn-catalogs.json scripts/generate-distributed-hymn-catalog.mjs apps/web/src/distributed-hymnals.ts apps/web/src/distributed-hymnals.test.ts apps/web/src/kidung.tsx apps/web/src/pdf.tsx
git commit -m "feat: connect optional hymnals to downloaded PDFs"
```

### Task 7: Add Manajemen Aset to Pengaturan

**Files:**

- Modify: `apps/web/src/more.tsx`
- Modify: `apps/web/src/styles.css`
- Create: `apps/web/src/asset-management-view.test.tsx` if component tests are needed

**Interfaces:**

- The Settings page consumes manager status/progress events and exposes the
  actions without duplicating package-install logic.

- [ ] **Step 1: Write failing UI tests**

Assert the Data & Offline section renders the Manajemen Aset heading, all
optional codes, bundled/available status, and Download/Delete/Update controls.

- [ ] **Step 2: Run UI tests and verify they fail**

Run: `pnpm --filter @gys/web test -- src/asset-management-view.test.tsx`

Expected: FAIL because the Settings UI has no distributed asset rows.

- [ ] **Step 3: Implement the Settings integration**

Add a manager hook/controller in the existing Data & Offline section. Render
grouped rows, progress, errors, refresh, and destructive-action confirmation.
Keep the current core pack card and its behavior.

- [ ] **Step 4: Add focused styles and responsive behavior**

Use existing card/button tokens, preserve 320px layout, and keep action labels
accessible with status text announced through the existing patterns.

- [ ] **Step 5: Run UI tests and accessibility smoke**

Run: `pnpm --filter @gys/web test -- src/asset-management-view.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/more.tsx apps/web/src/styles.css apps/web/src/asset-management-view.test.tsx
git commit -m "feat: add asset management to settings"
```

### Task 8: Keep GitHub Pages core cache bounded and verify end to end

**Files:**

- Modify: `apps/web/public/sw.js`
- Modify: `apps/web/src/main.tsx` only if optional warming needs an explicit exclusion
- Modify: `apps/web/e2e/accessibility.spec.ts` or create a focused settings spec
- Create: `apps/web/e2e/asset-management.spec.ts`
- Modify: `docs/architecture.md`, `docs/release-readiness.md`, and generated provenance checks as needed

**Interfaces:**

- Service worker install caches the catalog snapshot and existing core files,
  never optional release URLs or optional package bytes.

- [ ] **Step 1: Write the failing service-worker/E2E assertions**

Assert the core list contains `distributed-assets.json` and excludes
`b_kjv.gyspkg`, `b_cuv.gyspkg`, `hymne.gyspkg`, `mdr.gyspkg`, ASM packages, and
GeneralUser. Add a browser flow that opens Settings, downloads one fixture
asset, shows Installed, and removes it.

- [ ] **Step 2: Run focused checks and verify the new assertions fail**

Run: `pnpm --filter @gys/web test -- src/service-worker.test.ts` (or the
repository's existing service-worker test command) and
`pnpm --filter @gys/web test:e2e -- e2e/asset-management.spec.ts`.

Expected: FAIL before the core list and UI flow are updated.

- [ ] **Step 3: Update the service worker and test fixtures**

Add only the same-origin catalog snapshot to CORE. Leave optional package URLs
out of CORE and OPTIONAL; they are managed by the user-driven manager.

- [ ] **Step 4: Run all verification gates**

Run:

```bash
pnpm test
pnpm typecheck
pnpm build
node scripts/verify-generated-provenance.mjs
git diff --check
```

Expected: all existing tests and new asset-manager/reader/service-worker tests
pass, with no generated provenance or formatting errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/public/sw.js apps/web/src/main.tsx apps/web/e2e docs/architecture.md docs/release-readiness.md
git commit -m "test: verify bounded offline asset management"
```

## Self-Review Checklist

- [ ] Contract supports all requested Bible and hymnal codes.
- [ ] GYSApp-Data remains the package source and is verified before activation.
- [ ] GitHub Pages core install excludes optional large packages.
- [ ] Settings exposes every requested asset and actions.
- [ ] Downloaded KJV/CUV are actually readable by the Bible page.
- [ ] Downloaded hymnal packages are actually resolved by the hymn page.
- [ ] Failed/cancelled updates preserve prior installed assets.
- [ ] Unit, typecheck, build, provenance, and E2E evidence is captured.

---

Plan complete and saved to `docs/superpowers/plans/2026-08-18-asset-management.md`.
