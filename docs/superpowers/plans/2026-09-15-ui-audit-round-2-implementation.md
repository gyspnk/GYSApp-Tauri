# UI Audit Round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Normalize Literatur, Iman, Preferences, theme behavior, and responsive reading states using evidence-first UI changes while preserving the already-stable Kidung experience.

**Architecture:** Introduce a dedicated `reading-surfaces.css` layer for active Literatur/Iman presentation rules, loaded before the existing final `calm-liturgical.css` authority. Keep component behavior intact unless tests expose a real interaction defect. Expand Playwright coverage first, then make minimal CSS/markup changes, manually inspect screenshot differences, and require exact-head full verification before merge.

**Tech Stack:** React 19, TypeScript 7, CSS, Playwright 1.62, Vitest 4, Vite 8, pnpm 11.21, GitHub Actions, Tauri/Rust verification.

**Spec:** `docs/superpowers/specs/2026-09-15-ui-audit-round-2.md`

## Global Constraints

- Start from `main` after merge commit `b6efc5c48c78f2edf2f9467d5b7e47a89311ca04` or a descendant containing it.
- Keep the five primary destinations unchanged: Beranda, Alkitab, Kidung, Iman, Lainnya.
- No new UI framework, component library, font package, icon package, or runtime dependency.
- Preserve light, dark, AMOLED, sepia, system theme, user accent, TTS, MIDI, PDF readers, offline tools, account, literature, and faith features.
- Common actionable controls remain at least 44x44 CSS px where touch interaction is expected.
- Tablet 600-959px keeps the labelled compact rail; phone <600px keeps the five-item bottom navigation; desktop >=960px keeps the readable sidebar.
- Kidung is a regression reference surface and is not redesigned unless a new test proves a defect.
- `calm-liturgical.css` remains the final cross-app visual authority.
- Do not solve feature-specific problems with broad global selectors or blanket `!important`.
- Do not accept screenshot baselines automatically after a mismatch; inspect actual renders first.
- Light, dark, sepia, and AMOLED representative states must preserve hierarchy and legibility.
- Phone/tablet/desktop verification includes 320, 390, 430, 599, 600, 768, 959, 960, 1024, 1440, and 1920 widths where relevant.
- Exact-head verification decides completion; an earlier green commit is not sufficient.
- Node requirement remains `>=24.0.0`; package manager remains `pnpm@11.21.0`.

---

### Task 1: Define the reading-family structural contract

**Files:**

- Create: `apps/web/e2e/reading-family-usability.spec.ts`
- Reuse fixtures/patterns from: `apps/web/e2e/visual-reading.spec.ts`

**Interfaces:**

- Consumes: `.literature-page`, `.literature-toolbar`, `.literature-row`, `.literature-shelf-item`, `.literature-reader-panel`, `.faith-page`, `.faith-search-bar`, `.faith-rows`, `.faith-row-heading`, `.faith-pdf-overlay`.
- Produces: `installLiteratureFixture(page)`, `installFaithFixture(page)`, `expectNoHorizontalOverflow(page)`, `expectTouchTarget(locator, min = 44)` test helpers local to this spec.

- [ ] **Step 1: Create deterministic fixtures and viewport helpers**

Use the same deterministic catalog/faith data model as `visual-reading.spec.ts`, but add one deliberately long publication title and one long doctrine sentence so wrapping is exercised rather than inferred.

```ts
const auditViewports = [
  { width: 320, height: 720 },
  { width: 390, height: 844 },
  { width: 600, height: 900 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const;

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
}

async function expectTouchTarget(locator: Locator, min = 44) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(min);
  expect(box!.height).toBeGreaterThanOrEqual(min);
}
```

- [ ] **Step 2: Add the RED catalog hierarchy tests**

For Literatur and Iman, assert:

```ts
await expectNoHorizontalOverflow(page);
await expect(page.locator(".literature-copy strong").first()).toBeVisible();
await expect(page.locator(".faith-row-heading").first()).toBeVisible();
```

Then assert the intended calm reading-family grammar:

```ts
const faithRows = page.locator(".faith-rows");
expect(await faithRows.evaluate((el) => getComputedStyle(el).boxShadow)).toBe(
  "none",
);

const shelfItem = page.locator(".literature-shelf-item").first();
await shelfItem.hover();
const shelfStyle = await shelfItem.evaluate((el) => {
  const style = getComputedStyle(el);
  return { transform: style.transform, boxShadow: style.boxShadow };
});
expect(shelfStyle.transform).toBe("none");
expect(shelfStyle.boxShadow).toBe("none");
```

Also require visible Literatur shelf/recent metadata to compute to at least `11.5px` and allow wrapping rather than forced one-line truncation on 320/390px.

- [ ] **Step 3: Add reader geometry checks**

For direct Literatur PDF and Iman PDF overlay at 390, 768, and 1024 widths, assert the reader/panel remains within the viewport and the visible close/back controls are >=44px.

```ts
const box = await page.locator(".literature-reader-panel").boundingBox();
expect(box).not.toBeNull();
expect(box!.x).toBeGreaterThanOrEqual(-1);
expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
```

- [ ] **Step 4: Run the new spec and capture RED evidence**

Run:

```bash
pnpm --filter @gys/web exec playwright test e2e/reading-family-usability.spec.ts
```

Expected on the pre-refinement UI: at least the ordinary Faith surface elevation assertion and Literatur hover/elevation or small-metadata assertion fails. If all proposed assertions pass, do not invent a visual defect; retain the green coverage and mark the corresponding styling sub-step in Task 3 unnecessary.

- [ ] **Step 5: Commit the contract**

```bash
git add apps/web/e2e/reading-family-usability.spec.ts
git commit -m "test(ui): define reading family usability contract"
```

---

### Task 2: Give Literatur and Iman an explicit CSS owner

**Files:**

- Create: `apps/web/src/reading-surfaces.css`
- Modify: `apps/web/src/main.tsx`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/ui-layering-contract.test.ts`

**Interfaces:**

- Consumes: existing Literatur/Iman class names; no component API change.
- Produces: `reading-surfaces.css` as the owner for active Literatur/Iman layout/presentation rules, imported after `direct-manipulation.css` and before `calm-liturgical.css`.

- [ ] **Step 1: Write the failing layer-ownership unit test**

Extend `ui-layering-contract.test.ts`:

```ts
const reading = readFileSync(join(__dirname, "reading-surfaces.css"), "utf8");
const styles = readFileSync(join(__dirname, "styles.css"), "utf8");

it("loads reading surfaces before final calm authority", () => {
  const readingImport = main.indexOf('import "./reading-surfaces.css";');
  const calm = main.indexOf('import "./calm-liturgical.css";');
  expect(readingImport).toBeGreaterThan(
    main.indexOf('import "./direct-manipulation.css";'),
  );
  expect(readingImport).toBeLessThan(calm);
});

it("keeps active reading-family ownership out of the legacy base layer", () => {
  expect(reading).toContain(".literature-row");
  expect(reading).toContain(".faith-rows");
  expect(styles).not.toContain(".literature-row {");
  expect(styles).not.toContain(".faith-rows {");
});
```

- [ ] **Step 2: Run the unit test to verify it fails**

```bash
pnpm --filter @gys/web test -- ui-layering-contract.test.ts
```

Expected: FAIL because `reading-surfaces.css` and its import do not exist yet.

- [ ] **Step 3: Create the feature-family layer and import it in the approved order**

In `main.tsx`, the style imports become:

```ts
import "./styles.css";
import "./ui-hardening.css";
import "./ui-preferences.css";
import "./kidung-ux.css";
import "./direct-manipulation.css";
import "./reading-surfaces.css";
import "./calm-liturgical.css";
import "./kidung-responsive.css";
```

`kidung-responsive.css` remains after the calm layer because it is the narrow, explicitly approved Kidung breakpoint exception already protected by tests.

- [ ] **Step 4: Move only active reading-family selectors from `styles.css`**

Move the current selectors used by `literature.tsx` and `faith.tsx`, including their associated responsive blocks, into `reading-surfaces.css`. At minimum this includes the active `.literature-*` catalog/detail/reader rules and `.faith-stack`, `.faith-search-bar`, `.faith-rows`, `.faith-row-*`, `.faith-selection*`, `.faith-pdf-*` rules.

Do not migrate unrelated legacy selectors such as an unused historical layout merely to make the file look cleaner. Do not leave duplicate active selectors behind in `styles.css`.

- [ ] **Step 5: Verify behavior is unchanged before refinement**

Run:

```bash
pnpm --filter @gys/web test -- ui-layering-contract.test.ts
pnpm --filter @gys/web exec playwright test e2e/visual-reading.spec.ts
```

Expected: layer test passes; visual-reading either matches exactly or changes only where CSS source order exposed an existing ownership bug. If screenshots change, inspect before proceeding and correct the migration rather than updating snapshots during this task.

- [ ] **Step 6: Commit the ownership migration**

```bash
git add apps/web/src/main.tsx apps/web/src/styles.css apps/web/src/reading-surfaces.css apps/web/src/ui-layering-contract.test.ts
git commit -m "refactor(ui): isolate reading surface styles"
```

---

### Task 3: Normalize Literatur and Iman catalog hierarchy

**Files:**

- Modify: `apps/web/src/reading-surfaces.css`
- Modify only if semantic markers are necessary: `apps/web/src/literature.tsx`
- Modify only if semantic markers are necessary: `apps/web/src/faith.tsx`
- Test: `apps/web/e2e/reading-family-usability.spec.ts`
- Visual test: `apps/web/e2e/visual-reading.spec.ts`

**Interfaces:**

- Consumes: Task 1 structural assertions and Task 2 CSS ownership.
- Produces: flat ordinary rows, restrained publication shelves, consistent search/control rhythm, readable metadata, and no hover lift on reading indexes.

- [ ] **Step 1: Re-run Task 1 to confirm the exact failing assertions**

```bash
pnpm --filter @gys/web exec playwright test e2e/reading-family-usability.spec.ts
```

Record the failed assertion names; only fix failures supported by the approved spec.

- [ ] **Step 2: Flatten ordinary reading-family surfaces**

Apply this grammar in `reading-surfaces.css`:

```css
.faith-rows,
.literature-list {
  border-inline: 0;
  border-radius: 0;
  box-shadow: none;
  background: transparent;
}

.faith-rows > div,
.literature-row {
  border-bottom: 1px solid var(--line);
}

.literature-row:hover,
.literature-shelf-item:hover,
.literature-recent-item:hover {
  transform: none;
  box-shadow: none;
}
```

Do not remove visible selected/focus state. Use `background: var(--surface-soft)` or a blue-soft mix for hover/focus only where it helps scanning.

- [ ] **Step 3: Normalize metadata and wrapping**

Use a readable floor:

```css
.literature-shelf-item small,
.literature-recent-item small,
.faith-row-progress,
.faith-row-summary {
  font-size: max(var(--text-meta), 0.71875rem);
  line-height: 1.4;
}
```

On phone, remove forced single-line truncation from primary titles/metadata that need context:

```css
@media (max-width: 599px) {
  .literature-shelf-item strong,
  .literature-recent-item strong {
    white-space: normal;
    text-overflow: clip;
  }
}
```

- [ ] **Step 4: Align search/control rhythm without making the domains identical**

Keep Literatur's search + category + sort controls and Iman's single search field, but make both use the shared hit-size and spacing language:

```css
.literature-toolbar,
.faith-search-bar {
  margin-block: 0 24px;
}

.literature-toolbar :is(input, button, .control-select),
.faith-search-bar {
  min-height: var(--control-hit);
}
```

At <600px, Literatur controls stack full-width; at 600-959px they wrap predictably; >=960px they remain inline when space allows.

- [ ] **Step 5: Keep domain-specific distinctions**

Literatur may retain cover art and horizontal featured shelf behavior on phone. Iman keeps numbered doctrine rows and `Ringkasan & catatan`. Do not introduce cover/card visuals into Iman and do not turn Literatur into a numbered doctrine list.

- [ ] **Step 6: Run structural tests until GREEN**

```bash
pnpm --filter @gys/web exec playwright test e2e/reading-family-usability.spec.ts
```

Expected: all catalog hierarchy, wrapping, touch-size, and overflow assertions pass.

- [ ] **Step 7: Run representative Kidung regression immediately**

```bash
pnpm --filter @gys/web exec playwright test e2e/kidung-usability.spec.ts e2e/kidung-small-phone-nav.spec.ts
```

Expected: unchanged Kidung contracts stay green.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/reading-surfaces.css apps/web/src/literature.tsx apps/web/src/faith.tsx apps/web/e2e/reading-family-usability.spec.ts
git commit -m "feat(ui): normalize reading catalog hierarchy"
```

Only add the TSX files if they actually changed.

---

### Task 4: Normalize PDF/reader chrome and theme behavior

**Files:**

- Modify: `apps/web/src/reading-surfaces.css`
- Modify: `apps/web/e2e/reading-family-usability.spec.ts`
- Modify: `apps/web/e2e/visual-reading.spec.ts`

**Interfaces:**

- Consumes: existing `PdfReader`, `.literature-reader-panel`, `.faith-pdf-overlay`, `.faith-pdf-backdrop`, existing progress/resume behavior.
- Produces: content-first reader chrome across Literatur/Iman without changing PDF engine APIs.

- [ ] **Step 1: Extend structural reader coverage before styling**

Add reader cases at 390, 768, 1024, and 1440. For each case assert:

```ts
await expectNoHorizontalOverflow(page);
const canvases = page.locator(".pdf-pages canvas");
await expect(canvases.first()).toBeVisible();
```

For the Iman overlay, assert the overlay never exceeds the viewport and the close control remains reachable. For Literatur direct reader, assert the detail hero stays hidden when `?read=1` is active.

- [ ] **Step 2: Add theme matrix assertions**

Use these representative structural states:

```ts
const themes = ["light", "dark", "sepia", "amoled"] as const;
```

For each theme, set `localStorage.setItem("gys-theme", theme)` before navigation, then assert body text and muted text colors differ and focus/selected outlines remain visible. Do not use exact RGB values; assert hierarchy through computed inequality and non-transparent borders/outlines.

- [ ] **Step 3: Run tests before styling**

```bash
pnpm --filter @gys/web exec playwright test e2e/reading-family-usability.spec.ts
```

If the new geometry/theme assertions are already green, keep them as coverage and do not restyle solely to create a diff.

- [ ] **Step 4: Reduce reader chrome only where evidence supports it**

Use restrained rules such as:

```css
.literature-reader-panel,
.faith-pdf-overlay {
  --reader-chrome-border: var(--line);
}

.literature-reader-panel {
  box-shadow: none;
}

.faith-pdf-overlay {
  box-shadow: var(--calm-shadow-raised);
}
```

The Iman PDF overlay may remain elevated because it is genuinely above the document; the Literatur direct reader should not look like a floating card inside its own page.

- [ ] **Step 5: Expand visual-reading viewport coverage deliberately**

Change catalog visual viewports to:

```ts
const viewports = [
  { name: "320x720", width: 320, height: 720 },
  { name: "390x844", width: 390, height: 844 },
  { name: "600x900", width: 600, height: 900 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1920x1080", width: 1920, height: 1080 },
] as const;
```

Keep reader screenshots to the smaller set 390, 768, 1024, 1440 to avoid redundant baseline explosion.

- [ ] **Step 6: Add only three extra themed visual samples**

Add one dark catalog, one sepia reading state, and one AMOLED overlay state. Structural tests cover all four themes; these three screenshots provide representative perceptual evidence without multiplying every viewport by every theme.

- [ ] **Step 7: Run visual tests and inspect failures manually**

```bash
pnpm --filter @gys/web exec playwright test e2e/visual-reading.spec.ts
```

Do not run `--update-snapshots` yet. Inspect actual-vs-expected images first. Only intentional changes advance to Task 7 baseline acceptance.

- [ ] **Step 8: Commit code/test changes without unreviewed baseline updates**

```bash
git add apps/web/src/reading-surfaces.css apps/web/e2e/reading-family-usability.spec.ts apps/web/e2e/visual-reading.spec.ts
git commit -m "feat(ui): refine reading reader hierarchy"
```

---

### Task 5: Close Preferences responsive and keyboard blind spots

**Files:**

- Modify: `apps/web/e2e/appearance-preferences.spec.ts`
- Modify only if a new assertion fails: `apps/web/src/ui-preferences.css`
- Modify only if interaction semantics fail: `apps/web/src/ui-preferences-panel.tsx`

**Interfaces:**

- Consumes: `UiPreferencesPanel`, `DENSITY_OPTIONS`, `FONT_OPTIONS`, focus trap, `.ui-preferences-panel`.
- Produces: verified reachability of all options across sheet/dialog breakpoints, short phone heights, density modes, keyboard traversal, and enlarged text.

- [ ] **Step 1: Add pre-selection reachability test on a narrow/short phone**

```ts
test("phone sheet exposes every preference before any selection", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  const { dialog } = await openAppearance(page);
  for (const name of [
    "Nyaman",
    "Standar",
    "Ringkas",
    "Otomatis",
    "Himne",
    "Sans modern",
  ]) {
    const option = dialog.getByRole("radio", { name: new RegExp(`^${name}`) });
    await option.scrollIntoViewIfNeeded();
    await expect(option).toBeVisible();
  }
  await expect(dialog.getByRole("button", { name: "Selesai" })).toBeVisible();
});
```

- [ ] **Step 2: Add breakpoint-state test**

Check 599, 600, 959, 960 widths. At 599 the panel should behave as a bottom sheet; at >=600 it should be centered rather than anchored to the bottom. Assert geometry rather than implementation strings.

```ts
const box = await dialog.boundingBox();
expect(box).not.toBeNull();
if (width < 600) expect(box!.y + box!.height).toBeCloseTo(height, -1);
else expect(box!.y).toBeGreaterThan(8);
```

- [ ] **Step 3: Add keyboard traversal and enlarged-text coverage**

Tab through the six radios and `Selesai`, assert focus stays inside the dialog, then press Escape and verify focus restoration. In a separate case set `document.documentElement.style.fontSize = "200%"`, scroll the last option into view, and assert no document-level horizontal overflow.

- [ ] **Step 4: Run the expanded preferences spec**

```bash
pnpm --filter @gys/web exec playwright test e2e/appearance-preferences.spec.ts
```

If all new assertions pass, commit test-only coverage. Do not change Preferences styling merely because this audit expected to find a problem.

- [ ] **Step 5: If reachability fails, apply the minimal mobile CSS fix**

Use a scrollable panel with a stable header and non-obscuring footer. Prefer:

```css
@media (max-width: 599px) {
  .ui-preferences-panel {
    overflow-y: auto;
    scroll-padding-block: 92px calc(76px + env(safe-area-inset-bottom));
  }

  .ui-preferences-header {
    position: sticky;
    top: 0;
  }
}
```

Only make the footer sticky if the failing geometry proves it improves reachability; if used, give it an opaque `var(--surface)` background and enough bottom padding so the last radio is never covered.

- [ ] **Step 6: If keyboard semantics fail, fix the existing focus helper rather than adding another focus system**

Keep `useModalKeyboard` as the single focus-trap implementation. Correct its focusable filtering/order if necessary; do not introduce an external dialog library.

- [ ] **Step 7: Run Preferences + accessibility tests**

```bash
pnpm --filter @gys/web exec playwright test e2e/appearance-preferences.spec.ts e2e/accessibility.spec.ts
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/e2e/appearance-preferences.spec.ts apps/web/src/ui-preferences.css apps/web/src/ui-preferences-panel.tsx
git commit -m "test(ui): harden preference sheet breakpoints"
```

Only stage source files that actually changed.

---

### Task 6: Extend accessibility and protect Kidung from shared regressions

**Files:**

- Modify: `apps/web/e2e/accessibility.spec.ts`
- Modify: `apps/web/e2e/responsive-layout-matrix.spec.ts`
- Re-run only: `apps/web/e2e/kidung-usability.spec.ts`
- Re-run only: `apps/web/e2e/kidung-small-phone-nav.spec.ts`

**Interfaces:**

- Consumes: final reading-family and preference states.
- Produces: release gates for accessible reading surfaces and breakpoint containment.

- [ ] **Step 1: Add axe coverage for the audited surfaces**

Add deterministic literature/faith routes or use their local offline fixtures where possible. At minimum cover one 390px reading catalog and one 1440px reading catalog.

```ts
const results = await new AxeBuilder({ page }).analyze();
expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual(
  [],
);
```

Also test the Preferences dialog while open so radio semantics/focusable structure are scanned.

- [ ] **Step 2: Extend the responsive matrix to the reading-specific blind spots**

Add focused assertions at 430, 599/600, 959/960, and 1024 for Literatur and Iman, reusing `expectNoHorizontalOverflow` and `expectInsideViewport` already present in `responsive-layout-matrix.spec.ts`.

Do not duplicate the full shell loop; add one separate reading-surface test that visits only `/literatur` and `/iman`.

- [ ] **Step 3: Run accessibility + responsive matrix**

```bash
pnpm --filter @gys/web exec playwright test e2e/accessibility.spec.ts e2e/responsive-layout-matrix.spec.ts
```

- [ ] **Step 4: Re-run the Kidung reference surface**

```bash
pnpm --filter @gys/web exec playwright test e2e/kidung-usability.spec.ts e2e/kidung-small-phone-nav.spec.ts
```

Expected: no Kidung behavior or geometry regression from the new reading-family layer.

- [ ] **Step 5: Commit**

```bash
git add apps/web/e2e/accessibility.spec.ts apps/web/e2e/responsive-layout-matrix.spec.ts
git commit -m "test(ui): extend second audit release gates"
```

---

### Task 7: Inspect and accept intentional visual baselines

**Files:**

- Review: `apps/web/e2e/visual-reading.spec.ts`
- Modify only after inspection: `apps/web/e2e/visual-reading.spec.ts-snapshots/*.png`
- Review only: existing Kidung visual preview output from `kidung-usability.spec.ts`

**Interfaces:**

- Consumes: all final styling from Tasks 2-6.
- Produces: reviewed Linux visual baselines limited to intentional changes.

- [ ] **Step 1: Generate current visual failures without updating snapshots**

```bash
pnpm --filter @gys/web exec playwright test e2e/visual-reading.spec.ts
```

- [ ] **Step 2: Inspect each changed image**

For every mismatch, explicitly check:

```text
- no clipping or horizontal overflow
- title and metadata wrapping is intentional
- search/filter controls remain subordinate to content
- ordinary rows are flat and scannable
- reader chrome does not dominate the PDF/content
- dark/sepia/AMOLED preserve text hierarchy
- no Kidung regression from shared tokens/import order
```

- [ ] **Step 3: Reject unexplained differences**

If a screenshot differs for reasons not described by the spec, fix the CSS/source first and rerun. Do not normalize the unexplained difference by changing expected PNGs.

- [ ] **Step 4: Update only reviewed baselines**

After every changed image has an explicit visual justification, run:

```bash
pnpm --filter @gys/web exec playwright test e2e/visual-reading.spec.ts --update-snapshots
```

Then inspect `git diff --stat` and verify that only the expected reading screenshots changed.

- [ ] **Step 5: Re-run visual-reading against the accepted baselines**

```bash
pnpm --filter @gys/web exec playwright test e2e/visual-reading.spec.ts
```

Expected: PASS with no unreviewed snapshot difference.

- [ ] **Step 6: Commit baselines separately**

```bash
git add apps/web/e2e/visual-reading.spec.ts-snapshots
git commit -m "test(ui): refresh reviewed reading baselines"
```

Skip this commit entirely if no baseline changed.

---

### Task 8: Exact-head verification and PR readiness

**Files:**

- No planned source changes.
- If a verification failure requires a fix, return to the owning earlier task and add a regression test before fixing it.

**Interfaces:**

- Produces: exact-head evidence suitable for review/merge.

- [ ] **Step 1: Run formatting and static checks**

```bash
pnpm format:check
pnpm typecheck
```

Expected: exit 0 for both.

- [ ] **Step 2: Run all unit/policy tests**

```bash
pnpm test
```

Expected: exit 0 with zero failing tests.

- [ ] **Step 3: Build and verify bundle/docs/generated contracts**

```bash
pnpm verify:generated
pnpm verify:docs
pnpm build
pnpm verify:bundle
pnpm verify:native-assets
```

Expected: exit 0 for every command.

- [ ] **Step 4: Run focused UI suites once more**

```bash
pnpm --filter @gys/web exec playwright test \
  e2e/reading-family-usability.spec.ts \
  e2e/appearance-preferences.spec.ts \
  e2e/accessibility.spec.ts \
  e2e/responsive-layout-matrix.spec.ts \
  e2e/kidung-usability.spec.ts \
  e2e/kidung-small-phone-nav.spec.ts \
  e2e/visual-reading.spec.ts
```

Expected: all tests pass.

- [ ] **Step 5: Run the full browser suite**

```bash
pnpm test:e2e
```

Expected: all Playwright tests pass on the exact final head.

- [ ] **Step 6: Run native verification**

```bash
pnpm native:check
```

Expected: native/Tauri check exits 0. In GitHub Actions, also require the existing Windows native job's test/fmt/clippy stages to be green.

- [ ] **Step 7: Compare final branch to base before PR/merge**

Confirm the diff is limited to:

```text
reading surface ownership/style changes
Literatur/Iman markup only where justified
Preferences source only if new tests proved a defect
new/expanded UI tests
reviewed reading visual baselines
this spec/plan documentation
```

Any unrelated file change must be removed or separately justified.

- [ ] **Step 8: Require exact-head GitHub Actions evidence**

After push/PR creation, verify the workflow run attached to the exact final SHA. Do not rely on a previous green commit. Required gates include the repository's quality/build/secret-scan/native/full-browser gates, with full E2E shards enabled before merge.

- [ ] **Step 9: Request review rather than merging automatically**

Use the normal branch-finishing workflow. Present merge/PR/keep options to the user after verification; integration remains the user's decision.
