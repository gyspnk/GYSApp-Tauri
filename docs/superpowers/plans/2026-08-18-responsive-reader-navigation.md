# Responsive Reader and Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Bible and Kidung Rohani web flows comfortable and visually coherent at mobile, tablet, and desktop dimensions, then verify the result locally with Playwright-backed in-app Browser checks before any push.

**Architecture:** Preserve the existing React route/page components and design tokens. Introduce small semantic wrappers and state only where they clarify task groups; express most responsive behavior in `styles.css`. Keep route/data behavior unchanged.

**Tech Stack:** React, TypeScript, Vite, existing CSS tokens, Vitest, Playwright-based repository E2E, Codex in-app Browser for visual QA.

**Spec:** `docs/superpowers/specs/2026-08-18-responsive-reader-navigation-design.md`

## Global Constraints

- Work only in the local workspace; do not push, deploy, or change GitHub branches/PRs.
- Reuse existing GYSApp tokens, icons, semantic controls, and data fields.
- Keep existing routes and core interactions working.
- Use `apply_patch` for source and test edits.
- Visual QA must use the already-running local Vite server and in-app Browser, with current-run screenshots outside the repository.

---

## Task 1: Add regression checks for the observed responsive failures

**Files:**

- Modify: `apps/web/e2e/visual.spec.ts` (only if its fixtures are the correct home for layout checks)
- Create or modify: `apps/web/e2e/navigation-layout.spec.ts`

- [ ] Inspect the existing Playwright config and E2E conventions; choose the smallest compatible test file.
- [ ] Add failing checks for the mobile Kidung catalog search/filter widths and no horizontal overflow.
- [ ] Add failing checks for labeled Kidung detail actions at mobile width.
- [ ] Add failing checks for the Bible mobile chapter scrubber width and no horizontal overflow.
- [ ] Add interaction assertions for Kidung filter/navigation and Bible reader controls so the checks cover behavior, not screenshots only.
- [ ] Run the focused E2E file once and record the expected failures before changing implementation.

## Task 2: Repair the responsive shell and Kidung catalog hierarchy

**Files:**

- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/kidung.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] Add stable accessible names/titles to compact navigation items without changing destination behavior.
- [ ] Fix the high-specificity mobile catalog rule so search and collection controls are full-width and stacked below 600px.
- [ ] Refine Kidung rows with existing data: number tile, readable title/meta block, status/action affordance, and no horizontal growth.
- [ ] Add semantic class hooks for catalog/detail action grouping rather than styling by fragile descendant selectors.
- [ ] Run typecheck/lint or the narrowest available web check after the catalog edit.

## Task 3: Make Kidung detail actions legible and task-oriented

**Files:**

- Modify: `apps/web/src/kidung.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] Group the primary MIDI action separately from utility actions while preserving all existing handlers and disabled states.
- [ ] Keep short readable labels visible on mobile for important actions; allow wrapping rather than clipping.
- [ ] Ensure viewer tabs, verse selector, and detail actions wrap without horizontal overflow at 360–430px.
- [ ] Verify keyboard focus and button activation in the focused browser test.
- [ ] Add a PDF-mode viewer chrome aligned to the GYSChordWeb hierarchy: exit/back, hymn identity, previous/next song, and MIDI shortcut.
- [ ] Put the PDF surface immediately below the compact chrome while retaining the existing PDF page controls and advanced utility actions.
- [ ] Compare the mobile viewer screenshot with the captured GYSChordWeb reference and adjust spacing/density without copying its dark palette.

## Task 4: Recompose the Bible reader toolbar for narrow screens

**Files:**

- Modify: `apps/web/src/bible.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] Add semantic navigation/action/speech groups around the existing controls without changing their handlers.
- [ ] Give the chapter scrubber a dedicated flexible row on mobile and prevent the range input from shrinking to zero.
- [ ] Keep desktop/tablet controls scannable with grouped wrapping and preserve sticky positioning.
- [ ] Add a clearly labeled mobile speech-settings disclosure while retaining desktop/tablet access to the existing controls.
- [ ] Ensure expanded speech settings clear the fixed mobile bottom navigation safe area.
- [ ] Verify book/chapter selection, scrubber input, action buttons, and speech disclosure with browser interactions.

## Task 5: Compact the reader shell and move page controls into context header

**Files:**

- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/e2e/navigation-layout.spec.ts`
- Modify: relevant shell/accessibility E2E coverage if an assertion needs the new context header.

- [ ] Detect Bible/Kidung reader routes and render a compact page-context header in place of redundant logo/global-search chrome.
- [ ] Keep a labeled page-specific search action in that header, focusing the existing Bible/Kidung search field without opening global search.
- [ ] Reduce the reader-route topbar and safe-area offsets at mobile/tablet/desktop sizes while preserving the five-item bottom navigation and larger-screen rail/sidebar.
- [ ] Keep page title/context visible in the compact header and expose list/back actions for Kidung detail.
- [ ] Verify header actions, focus behavior, route navigation, no-overflow, and reader content start positions at 360–1440px.

## Task 6: Run the local visual iteration loop

**Files:**

- No repository screenshot output; save evidence under the existing temp audit directory.

- [ ] Reload the local Vite app in the in-app Browser after implementation.
- [ ] Capture Kidung catalog/detail and Bible at 360, 390, 430, 768, 1024, 1280, and 1440px widths where the flow is meaningful.
- [ ] Inspect each representative screenshot for clipping, alignment, density, focus/active states, and bottom-nav overlap.
- [ ] Measure document overflow, control widths, touch-target heights, and sticky/fixed regions through the browser DOM.
- [ ] Iterate CSS/markup until all acceptance criteria pass; re-run screenshots after every material change.

## Task 7: Run verification gates and hand off without publishing

**Files:**

- No additional files unless a test exposes a real regression.

- [ ] Run focused unit/type/build checks for the web package.
- [ ] Run the new responsive E2E checks and existing relevant E2E checks locally.
- [ ] Confirm browser console has no errors/warnings and the app has no framework error overlay.
- [ ] Confirm `git status` contains only intentional local changes and no push was performed.
- [ ] Report exact commands, viewport evidence, interaction evidence, remaining risks, and the local preview state in Indonesian.
