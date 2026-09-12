# Calm Liturgical Utility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine GYSApp into a calm, professional, universally understandable interface without removing features or regressing parity.

**Architecture:** Add one final, small cross-app refinement stylesheet after the existing base and hardening layers, and protect it with a dedicated Playwright usability contract. Avoid component rewrites unless a behavior cannot be expressed safely through shared CSS. Keep feature code stable and use visual evidence plus existing regression suites to validate intentional styling changes.

**Tech Stack:** React, TypeScript, CSS, Playwright, pnpm, GitHub Actions, Tauri/Rust verification.

**Spec:** `docs/superpowers/specs/2026-09-12-calm-liturgical-utility.md`

## Global Constraints

- Preserve all existing features and current gyschordweb parity.
- No new runtime dependency, UI framework, font package, or icon package.
- Keep all current themes and user accent support.
- Maintain 44px practical targets for primary touch controls.
- Tablet navigation must show visible labels.
- Mobile navigation labels must remain readable at 320px width.
- Preserve reduced-motion and keyboard accessibility.
- Visual changes require screenshot inspection before baseline acceptance.

---

### Task 1: Add universal-usability contract

**Files:**
- Create: `apps/web/e2e/universal-usability.spec.ts`

**Interfaces:**
- Consumes: existing `.navigation-shell`, `.nav-item`, `.nav-copy`, `.search-trigger`, `.account-button`, `.main-content`, route classes.
- Produces: automated constraints for touch size, tablet labels, 200% text zoom containment, readable mobile labels, and reduced motion.

- [ ] **Step 1: Write the failing Playwright contract**

Create tests for:

```ts
const representativeRoutes = [
  "/GYSApp-Tauri/",
  "/GYSApp-Tauri/bible",
  "/GYSApp-Tauri/kidung",
  "/GYSApp-Tauri/iman",
  "/GYSApp-Tauri/literatur",
  "/GYSApp-Tauri/lainnya",
];
```

Assert on tablet that `.navigation-shell .nav-copy strong` is visible and font size >=11px. Assert on phone that primary nav labels are >=11px and common shell controls are >=44px. Apply `document.documentElement.style.fontSize = "200%"` on representative routes and assert page width stays within viewport. Verify reduced-motion mode reports zero-duration workspace/sidebar transitions.

- [ ] **Step 2: Push the RED contract and observe CI failure**

Expected: tablet label assertion and one or more shared-control size/typography assertions fail against current styling.

- [ ] **Step 3: Keep the test deterministic**

Block unnecessary service workers/external content when needed and wait only for stable route landmarks.

- [ ] **Step 4: Commit**

Commit message: `test: define universal usability contract`

---

### Task 2: Implement the Calm Liturgical refinement layer

**Files:**
- Create: `apps/web/src/calm-liturgical.css`
- Modify: `apps/web/src/main.tsx`

**Interfaces:**
- Consumes: existing CSS custom properties/classes.
- Produces: final shared visual hierarchy and responsive interaction behavior without changing feature APIs.

- [ ] **Step 1: Define restrained shared tokens**

Add only refinement variables such as:

```css
:root {
  --control-hit: 44px;
  --text-ui: 0.9375rem;
  --text-meta: 0.75rem;
  --content-reading: 72rem;
  --surface-shadow-calm: 0 1px 2px rgba(31, 50, 78, 0.06), 0 8px 24px rgba(31, 50, 78, 0.05);
}
```

Do not replace theme colors or accent logic.

- [ ] **Step 2: Refine shared controls**

Ensure `.search-trigger`, `.account-button`, `.primary-button`, `.quiet-button`, common text buttons, media controls, and navigation items have reliable 44px hit areas and restrained hover states. Remove decorative translate/lift effects from shared shell controls.

- [ ] **Step 3: Refine surface hierarchy**

Reduce broad card elevation and visual noise. Keep borders and spacing as the main grouping tools. Make `.more-card`, home panels, and common reader surfaces use subtle elevation instead of floating-card treatment.

- [ ] **Step 4: Make tablet navigation self-explanatory**

At 600-959px keep the compact rail but show `.nav-copy strong`, hide descriptions, center label under/with icon, and keep rail width bounded. Update mobile nav labels to >=11px.

- [ ] **Step 5: Improve typography for cross-age legibility**

Raise important visible utility copy from 10-11px to 11.5-12px where space permits, maintain comfortable line-height, and preserve compact nonessential metadata.

- [ ] **Step 6: Preserve reduced motion**

Disable nonessential transitions/transforms under `prefers-reduced-motion: reduce`.

- [ ] **Step 7: Import the layer last**

In `main.tsx` add:

```ts
import "./calm-liturgical.css";
```

after `ui-hardening.css`.

- [ ] **Step 8: Run the usability contract**

Expected: Task 1 tests pass.

- [ ] **Step 9: Commit**

Commit message: `feat: apply calm liturgical utility system`

---

### Task 3: Visual evidence across core surfaces

**Files:**
- Create temporarily: `.github/workflows/agent-calm-ui-audit.yml`
- Reuse: `apps/web/e2e/visual.spec.ts`, `apps/web/e2e/visual-reading.spec.ts`

**Interfaces:**
- Produces: screenshot artifact for manual inspection before baseline acceptance.

- [ ] **Step 1: Add a temporary PR workflow**

Run Chromium screenshots for representative mobile/tablet/desktop surfaces and upload `apps/web/test-results` plus generated screenshots even if snapshot comparison fails.

- [ ] **Step 2: Inspect screenshots manually**

Check hierarchy, wrapping, labels, contrast, overflow, reader chrome, home composition, tablet rail, and mobile bottom navigation. Reject generic card-heavy or overly animated appearance.

- [ ] **Step 3: Fix visual defects before accepting baselines**

Make minimal CSS changes only; do not alter feature behavior to satisfy screenshots.

- [ ] **Step 4: Accept intentional snapshots only after inspection**

Use a guarded workflow or exact-file update so only reviewed visual baselines change.

---

### Task 4: Full regression and cleanup

**Files:**
- Remove temporary workflow from Task 3.
- Modify visual snapshots only where manually accepted.

**Interfaces:**
- Produces: exact-head green PR evidence.

- [ ] **Step 1: Run repository gates**

Verify `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm verify:native-assets`, `pnpm verify:bundle`, and `pnpm audit --prod` through CI.

- [ ] **Step 2: Run full Playwright suite**

Expected: all E2E tests pass including universal-usability, accessibility, navigation, touch targets, reader flows, media, settings, smoke, and visual tests.

- [ ] **Step 3: Verify native job**

Expected: cargo check, fmt, test, and clippy pass on Windows.

- [ ] **Step 4: Remove temporary QA workflow**

Commit message: `chore: remove calm UI audit workflow`

- [ ] **Step 5: Re-run exact-head CI**

Do not claim completion until the exact final head SHA has green verify/e2e/secret-scan/native-check jobs.
