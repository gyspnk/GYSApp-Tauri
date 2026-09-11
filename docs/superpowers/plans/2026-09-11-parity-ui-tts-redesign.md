# Parity, UI, and TTS Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring GYSApp-Tauri to the current canonical gyschordweb parity point, repair Edge-compatible no-key TTS, and make the shell/media UX compact, responsive, accessible, and deliberately designed.

**Architecture:** Preserve the existing React/domain/Tauri boundaries. Add direct Edge-compatible speech as an isolated transport used only when no configured gateway exists, and refine shell/media behavior through focused React state plus a dedicated CSS layer rather than replacing the app architecture. Keep parity generation source-locked to the canonical upstream commit and verify with unit, Playwright, generated-data, bundle, and native gates.

**Tech Stack:** React 19, TypeScript 7, Vite 8, Vitest 4, Playwright 1.62, pnpm 11, Hono, Tauri 2/Rust, existing CSS design tokens.

**Spec:** `docs/superpowers/specs/2026-09-11-parity-ui-tts-redesign.md`

## Global Constraints

- Canonical parity source: `gyspnk/gyschordweb@a9bf3219105dca3dde1b286328f46a0eede3287e`.
- Do not add a UI framework or general animation library.
- Do not claim direct Edge-compatible neural speech is offline; it is online-only and keyless.
- Keep custom/BFF Edge speech transport preferred when configured.
- Keep MIDI/TTS global media state and audio continuity across minimize/restore and route changes.
- Respect `prefers-reduced-motion`.
- Preserve 44 px minimum touch targets on mobile/touch controls.
- Follow red-green-refactor for every behavior change.

---

### Task 1: Lock current gyschordweb parity and expose stale-source failures

**Files:**
- Modify: `scripts/generate-music-lock.mjs`
- Modify: `scripts/generate-chord-manifest.mjs`
- Modify: `docs/discovery/feature-parity-matrix.md`
- Modify generated parity artifacts under `packages/contracts/generated/` and `apps/web/public/offline/`
- Test: existing script/generation verification tests plus chord audit

**Interfaces:**
- Consumes: `GYSCHORDWEB_SNAPSHOT` checkout at the exact canonical source commit.
- Produces: generated music/chord manifests that include hymn chord resources 108, 196, 271, and 492 and record the exact source commit.

- [ ] **Step 1: Add a failing provenance assertion**

Update the existing generation/provenance verification test so it expects the canonical source commit:

```js
assert.equal(lock.sourceCommit, "a9bf3219105dca3dde1b286328f46a0eede3287e");
for (const required of ["108_", "196_", "271_", "492_"]) {
  assert.ok(lock.items.some((item) => item.kind === "chord" && item.path.includes(required)));
}
```

- [ ] **Step 2: Run the focused verification and confirm RED**

Run:

```bash
pnpm verify:generated
```

Expected: FAIL because checked-in provenance still points to `a3d1ea7` and the new canonical chord files are absent.

- [ ] **Step 3: Change generator defaults to the exact canonical commit**

In both music/chord generation scripts, replace the old fallback commit with:

```js
const sourceCommit =
  process.env.GYSCHORDWEB_COMMIT ?? "a9bf3219105dca3dde1b286328f46a0eede3287e";
```

- [ ] **Step 4: Regenerate from a read-only checkout of canonical upstream**

Run with the source checkout at the exact commit:

```bash
GYSCHORDWEB_COMMIT=a9bf3219105dca3dde1b286328f46a0eede3287e \
GYSCHORDWEB_SNAPSHOT=/path/to/gyschordweb \
pnpm generate:music-lock
pnpm generate:chord-manifest
pnpm generate:hymn-catalog
pnpm generate:offline-manifest
```

- [ ] **Step 5: Run chord and generated-data verification**

```bash
pnpm audit:chords:check
pnpm verify:generated
```

Expected: PASS and no missing/orphan/invalid canonical chord mappings.

- [ ] **Step 6: Update the parity matrix**

Record the September 4–5 additions and mark parity only to the level of evidence actually exercised.

- [ ] **Step 7: Commit**

```bash
git add scripts packages/contracts/generated apps/web/public/offline docs/discovery/feature-parity-matrix.md
git commit -m "chore(parity): sync current gyschordweb chord source"
```

---

### Task 2: Build a unit-testable direct Edge-compatible speech protocol

**Files:**
- Create: `apps/web/src/edge-direct.ts`
- Create: `apps/web/src/edge-direct.test.ts`
- Modify: `apps/web/src/edge-speech.ts`
- Modify: `apps/web/src/edge-speech.test.ts`

**Interfaces:**
- Produces: `DirectEdgeTransport` with `synthesize(request, signal): Promise<Blob>` and `available(): boolean`.
- `EdgeSpeechProvider` selects configured gateway first and direct transport second.

- [ ] **Step 1: Write failing transport-selection test**

```ts
it("uses direct keyless transport when no gateway is configured", async () => {
  vi.stubEnv("VITE_EDGE_TTS_URL", "");
  vi.stubEnv("VITE_BFF_BASE_URL", "");
  const direct = { available: () => true, synthesize: vi.fn().mockResolvedValue(new Blob(["mp3"], { type: "audio/mpeg" })) };
  const provider = new EdgeSpeechProvider({ directTransport: direct });
  await expect(provider.status()).resolves.toMatchObject({ available: true, offline: false });
});
```

Production change that makes this test fail: absence of direct transport selection.

- [ ] **Step 2: Confirm RED**

```bash
pnpm --filter @gys/web test -- edge-speech.test.ts
```

Expected: FAIL because `EdgeSpeechProvider` has no injectable direct transport.

- [ ] **Step 3: Write framing/parser tests before implementation**

Cover these real behaviors in `edge-direct.test.ts`:

```ts
it("builds a valid speech.config frame with CRLF-separated headers", ...)
it("builds escaped SSML using the requested voice and rate", ...)
it("collects binary audio frames and ignores metadata frames", ...)
it("rejects protocol close before audio is complete without poisoning the next request", ...)
it("abort closes the socket exactly once", ...)
```

- [ ] **Step 4: Confirm framing tests RED**

```bash
pnpm --filter @gys/web test -- edge-direct.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 5: Implement the minimal direct transport**

`edge-direct.ts` must:

```ts
export interface DirectEdgeTransport {
  available(): boolean;
  synthesize(request: EdgeTtsRequest, signal?: AbortSignal): Promise<Blob>;
}
```

Implementation requirements:

- generate request/connection IDs with `crypto.randomUUID()` normalized for protocol use;
- connect only to the fixed Microsoft Edge read-aloud compatibility WebSocket host encoded in the module;
- send `speech.config` then SSML frames;
- parse text metadata separately from binary audio payloads;
- concatenate audio chunks into `audio/mpeg` Blob;
- enforce an 8,000-character request ceiling already present in `EdgeSpeechProvider`;
- abort and close cleanly;
- keep no credentials or secrets;
- throw recoverable `Error` objects on protocol/network failure.

- [ ] **Step 6: Integrate selection into `EdgeSpeechProvider`**

Constructor shape:

```ts
export class EdgeSpeechProvider implements SpeechProvider {
  constructor(options: { directTransport?: DirectEdgeTransport } = {}) { ... }
}
```

Selection rules:

```ts
if (configuredEndpoint) useGateway();
else if (directTransport.available()) useDirect();
else reportUnavailable();
```

Gateway behavior remains unchanged.

- [ ] **Step 7: Verify GREEN and regression**

```bash
pnpm --filter @gys/web test -- edge-direct.test.ts edge-speech.test.ts
pnpm --filter @gys/web typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/edge-direct.ts apps/web/src/edge-direct.test.ts apps/web/src/edge-speech.ts apps/web/src/edge-speech.test.ts
git commit -m "feat(tts): add keyless direct Edge-compatible transport"
```

---

### Task 3: Make TTS fallback and settings truthful and recoverable

**Files:**
- Modify: `apps/web/src/speech-player.ts`
- Modify: corresponding speech-player tests
- Modify: `apps/web/src/more.tsx`
- Test: speech orchestrator/settings tests

**Interfaces:**
- Consumes: `EdgeSpeechProvider.status()` and failures from gateway/direct mode.
- Produces: recoverable fallback to system provider and truthful UI copy for online Edge-compatible speech.

- [ ] **Step 1: Add failing transient-failure fallback test**

```ts
it("falls back to system speech after a transient Edge-compatible transport failure", async () => {
  const edge = providerThatFailsOnce();
  const system = availableSystemProvider();
  const player = createSpeechPlayer({ providers: [edge, system] });
  await player.speak("Uji");
  expect(system.speak).toHaveBeenCalled();
});
```

- [ ] **Step 2: Confirm RED**

Run the focused speech-player test and verify the failure is due to missing fallback behavior.

- [ ] **Step 3: Implement fallback without permanently disabling Edge**

Only the active utterance falls back. A later utterance must be allowed to attempt Edge again.

- [ ] **Step 4: Update settings/help copy**

The UI must state that Edge-compatible neural voices are keyless but online and send requested text to the remote speech service. Custom endpoint configuration remains available as an advanced override.

- [ ] **Step 5: Verify**

```bash
pnpm --filter @gys/web test -- speech-player edge-speech
pnpm --filter @gys/web typecheck
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/speech-player.ts apps/web/src/*speech*.test.ts apps/web/src/more.tsx
git commit -m "fix(tts): recover from Edge transport failures"
```

---

### Task 4: Add a persistent desktop sidebar collapse state

**Files:**
- Create: `apps/web/src/shell-preferences.ts`
- Create: `apps/web/src/shell-preferences.test.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/icons.tsx`
- Modify: `apps/web/src/styles.css` or create/import `apps/web/src/shell-refinement.css`
- Test: `apps/web/e2e/navigation-layout.spec.ts`

**Interfaces:**
- Produces: `readSidebarCollapsed(storage): boolean` and `writeSidebarCollapsed(storage, value): void`.
- Shell applies `.is-sidebar-collapsed` only at wide desktop composition.

- [ ] **Step 1: Add failing preference test**

```ts
it("persists and restores desktop sidebar collapse", () => {
  const storage = new MemoryStorage();
  writeSidebarCollapsed(storage, true);
  expect(readSidebarCollapsed(storage)).toBe(true);
});
```

- [ ] **Step 2: Confirm RED**, then implement the minimal storage module.

- [ ] **Step 3: Add failing Playwright geometry/accessibility test**

At 1440×900:

```ts
await page.getByRole("button", { name: "Ciutkan navigasi" }).click();
await expect(page.locator(".workspace")).toHaveClass(/is-sidebar-collapsed/);
expect((await page.locator(".navigation-shell").boundingBox())!.width).toBeLessThan(100);
await expect(page.getByRole("button", { name: "Perluas navigasi" })).toHaveAttribute("aria-expanded", "false");
```

Reload and verify state persists.

- [ ] **Step 4: Confirm RED**.

- [ ] **Step 5: Implement sidebar toggle**

Add an edge toggle with existing SVG icon primitives. Do not use raw Unicode arrows. The desktop grid transitions between roughly 256 px and 76–84 px. Labels animate opacity/transform and remain in the DOM for accessibility.

- [ ] **Step 6: Add reduced-motion rule**

```css
@media (prefers-reduced-motion: reduce) {
  .workspace,
  .navigation-shell,
  .nav-copy,
  .sidebar-collapse-toggle,
  .nav-active-indicator { transition: none !important; }
}
```

- [ ] **Step 7: Verify desktop/tablet/mobile regressions**

```bash
pnpm --filter @gys/web test:e2e:nav
```

Expected: desktop collapse passes; existing tablet rail and mobile bottom navigation remain unchanged.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/shell-preferences* apps/web/src/App.tsx apps/web/src/icons.tsx apps/web/src/styles.css apps/web/e2e/navigation-layout.spec.ts
git commit -m "feat(shell): add accessible desktop navigation collapse"
```

---

### Task 5: Redesign the persistent media surface and minimize/restore behavior

**Files:**
- Prefer create: `apps/web/src/media-surface.tsx` by extracting existing component from `App.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/icons.tsx`
- Modify: `apps/web/src/styles.css` or `apps/web/src/shell-refinement.css`
- Test: existing media unit tests
- Test: `apps/web/e2e/media-load.spec.ts`
- Test: `apps/web/e2e/navigation-layout.spec.ts`

**Interfaces:**
- Consumes: unchanged `midiPlayer`, `speechPlayer`, queue, route context, persisted media minimize/position preferences.
- Produces: bottom-centered expanded dock and compact minimized dock without interrupting playback.

- [ ] **Step 1: Add failing minimize/restore E2E test**

Cover:

```ts
await expect(page.locator(".media-surface")).toBeVisible();
await page.getByRole("button", { name: "Minimalkan pemutar" }).click();
await expect(page.locator(".media-surface")).toHaveClass(/is-minimized/);
await expect(page.getByRole("button", { name: "Perbesar pemutar" })).toBeVisible();
await expect(page.locator(".media-surface")).toContainText(/Pujilah|Kejadian/);
```

Verify active playback state does not change across the click.

- [ ] **Step 2: Add failing mobile non-overlap test**

At 390×844, assert the dock bottom is above the bottom-navigation top and the document has no horizontal overflow.

- [ ] **Step 3: Confirm RED** for the new layout assertions.

- [ ] **Step 4: Extract `MediaSurface` from `App.tsx` without behavior change**

Run existing media tests after extraction. This refactor must be green before visual behavior changes.

- [ ] **Step 5: Replace raw glyph controls with semantic SVG icons**

Add icon names as needed for collapse/expand/close using paths in `icons.tsx`, then render `<Icon>` inside buttons with existing accessible labels.

- [ ] **Step 6: Implement deterministic dock composition**

Desktop/tablet default:

```css
.media-surface:not(.has-user-position) {
  left: 50%;
  right: auto;
  transform: translateX(-50%);
  bottom: 18px;
}
```

Phone default sits above bottom nav/safe area. User-positioned drag remains desktop-only and is clamped on resize.

- [ ] **Step 7: Implement compact minimized hierarchy**

Minimized layout includes source icon, ellipsized source title/context, primary play/pause, and restore. Secondary adjustments are hidden. No audio stop occurs.

- [ ] **Step 8: Normalize popovers and touch targets**

Ensure all visible touch controls are at least 44 px on phone, popovers fit viewport, and no parent clips them.

- [ ] **Step 9: Verify**

```bash
pnpm --filter @gys/web test:e2e -- e2e/media-load.spec.ts e2e/navigation-layout.spec.ts
pnpm --filter @gys/web test
pnpm --filter @gys/web typecheck
```

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/media-surface.tsx apps/web/src/App.tsx apps/web/src/icons.tsx apps/web/src/styles.css apps/web/e2e
git commit -m "feat(media): redesign persistent mini player"
```

---

### Task 6: Remove repeated AI-slop UI patterns without semantic churn

**Files:**
- Modify: `apps/web/src/styles.css` and focused route components only where needed
- Test: `apps/web/e2e/visual.spec.ts`
- Test: `apps/web/e2e/accessibility.spec.ts`
- Test: route-specific smoke/navigation tests

**Interfaces:**
- No domain/API changes.
- Produces: a consistent control vocabulary and denser reading-first shell.

- [ ] **Step 1: Capture existing visual baselines at 390×844, 768×1024, 1440×900** using the existing Playwright visual workflow.

- [ ] **Step 2: Add assertions for control heights and reading density** before changing CSS, including 44 px touch controls on phone and no oversized empty shell spacing.

- [ ] **Step 3: Confirm any new density assertions RED** where the existing shell violates them.

- [ ] **Step 4: Refine tokens and shared roles**

Apply one coherent set of primary/secondary/icon/segmented roles. Remove unnecessary hover translate/lift on utility controls, reduce redundant shadows, and replace nested cards with spacing/dividers where no containment is needed.

- [ ] **Step 5: Audit mobile separately**

Do not simply shrink desktop CSS. Keep bottom navigation, compact topbars, player positioning, and reader actions touch-first.

- [ ] **Step 6: Run visual and accessibility suites**

```bash
pnpm --filter @gys/web test:e2e:visual
pnpm --filter @gys/web exec playwright test e2e/accessibility.spec.ts
```

Review failures visually rather than blindly accepting screenshot updates.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src apps/web/e2e
git commit -m "refactor(ui): tighten reading-first interaction design"
```

---

### Task 7: Full verification, performance cleanup, and parity documentation

**Files:**
- Modify only files required by discovered regressions
- Modify: `CHANGELOG.md`
- Modify: `docs/discovery/feature-parity-matrix.md`
- Modify: `docs/release-readiness.md` if evidence changes

**Interfaces:**
- Produces: verified branch ready for review/merge, with remaining platform-only limitations explicitly documented.

- [ ] **Step 1: Run web/workspace quality gates**

```bash
pnpm verify:generated
pnpm verify:docs
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm verify:native-assets
pnpm verify:bundle
pnpm audit --prod
```

- [ ] **Step 2: Run complete Playwright suite**

```bash
pnpm --filter @gys/web test:e2e
```

- [ ] **Step 3: Run native gates**

```bash
cargo check --manifest-path apps/native/src-tauri/Cargo.toml
cargo fmt --manifest-path apps/native/src-tauri/Cargo.toml -- --check
cargo test --manifest-path apps/native/src-tauri/Cargo.toml
cargo clippy --manifest-path apps/native/src-tauri/Cargo.toml --all-targets -- -D warnings
```

If the local environment cannot execute platform-specific gates, require GitHub Actions evidence before claiming them green.

- [ ] **Step 4: Inspect bundle/performance regressions**

Do not accept a new eager dependency for direct TTS or UI. If bundle budget grows materially, lazy-load the direct transport behind speech usage.

- [ ] **Step 5: Update parity/release docs with evidence**

Mark only exercised behaviors as verified. Keep real-device audio-focus, OS-specific speech, installer signing, or screen-reader gaps explicit if not run.

- [ ] **Step 6: Run verification again after documentation/final fixes**

Repeat the affected gates plus `pnpm verify:docs` and `pnpm format:check`.

- [ ] **Step 7: Commit final evidence**

```bash
git add CHANGELOG.md docs
git commit -m "docs: record parity and UX verification evidence"
```
