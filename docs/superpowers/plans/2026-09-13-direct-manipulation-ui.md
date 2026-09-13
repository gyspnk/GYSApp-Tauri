# Direct-Manipulation UI Simplification Implementation Plan

> Follow this plan task-by-task with test-first changes and CI evidence before completion.

**Goal:** Reduce persistent UI chrome across reader surfaces by using natural gesture/keyboard interactions, contextual secondary controls, transient feedback, and one consistent motion/accessibility system.

**Architecture:** Keep existing React feature ownership intact. Add small pure interaction helpers for input decisions, keep gesture state inside the owning reader, and use the existing Kidung/PDF/Bible shell components rather than introducing a second UI framework. Reuse existing CSS motion tokens and reader toolbar auto-hide primitives. Tests cover interaction semantics first, then user-visible Playwright behavior.

**Tech stack:** React 19 + TypeScript, Vite, Vitest, Playwright, existing CSS design system, Tauri web shell.

**Spec:** `docs/superpowers/specs/2026-09-13-direct-manipulation-ui.md`

**Global constraints:** preserve 40-44px hit targets, focus-visible, reduced motion, explicit back paths, essential media controls, and current Edge TTS/CI behavior. Avoid decorative motion and long-list stagger effects.

---

## Task 1: Establish PDF direct-manipulation regression coverage

**Files:**

- Modify: `apps/web/e2e/kidung-usability.spec.ts`
- Modify: `apps/web/src/pdf.test.ts` or `apps/web/src/pdf-utils.test.ts` only when a pure helper is introduced

**Steps:**

1. Add Playwright expectations that the Kidung PDF reading surface does not expose a persistent zoom range slider in primary reading chrome.
2. Add keyboard coverage for Ctrl/Cmd `+`, `-`, and `0` zoom actions and transient zoom feedback.
3. Run/observe the targeted PR CI test and confirm the new test fails for the intended current UI behavior before production changes.

## Task 2: Simplify Kidung PDF chrome

**Files:**

- Modify: `apps/web/src/pdf.tsx`
- Modify: `apps/web/src/styles.css` or a focused late-loaded interaction stylesheet
- Modify: `apps/web/src/main.tsx` only if a new focused stylesheet/module is added

**Steps:**

1. Collapse advanced Kidung PDF controls by default instead of opening them automatically.
2. Remove the persistent zoom range slider from Kidung reading UI.
3. Keep accessible fallback zoom buttons inside the advanced/overflow surface, but keep them out of primary reading chrome.
4. Add Ctrl/Cmd `+`, `-`, and `0` behavior at the viewer stage without hijacking unmodified scrolling/typing.
5. Add a transient zoom HUD that updates for pinch, Ctrl/Cmd+wheel, keyboard zoom, and fallback button changes.
6. Preserve existing pinch, cursor-anchored wheel zoom, panning, page gestures, fullscreen, chord overlay, and PDF layouts.
7. Run targeted tests and verify GREEN.

## Task 3: Compact Kidung viewer actions without hiding essential functions

**Files:**

- Modify: `apps/web/src/kidung.tsx`
- Modify: `apps/web/src/kidung-ux.css`
- Modify: `apps/web/e2e/kidung-usability.spec.ts`

**Steps:**

1. Inventory duplicate commands across the viewer chrome, detail actions, `...` menu, and reader settings.
2. Keep back, primary mode/navigation, active playback, and contextual transpose/chord controls accessible.
3. Move genuinely secondary technical actions to the existing overflow/settings surfaces rather than creating new permanent buttons.
4. Keep the visible Kidung / Playlist / Pengaturan information architecture unchanged.
5. Add/adjust Playwright assertions for compact mobile and desktop layouts.
6. Verify no overflow or hit-target regressions.

## Task 4: Simplify Bible reader navigation and eliminate duplicate chrome

**Files:**

- Modify: `apps/web/src/bible.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify/add targeted Bible E2E spec as appropriate

**Steps:**

1. Audit typography, display mode, audio, theme, chapter navigation, and picker commands between the reader header and hamburger drawer.
2. Keep Kitab/Pasal picker and version selector explicit.
3. Consolidate secondary reader preferences into the existing drawer; do not duplicate them in the main reading canvas.
4. Add conventional keyboard/swipe chapter navigation only where it cannot conflict with text selection, split view, or native scroll.
5. Add regression tests for picker accessibility and chapter navigation.

## Task 5: Compact minimized media while preserving playback essentials

**Files:**

- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css` or focused interaction stylesheet
- Modify: `apps/web/e2e/media-dock.spec.ts`

**Steps:**

1. Keep play/pause and seek explicit.
2. In minimized state, prioritize title/status + essential playback and hide/compact secondary playlist, instrument, repeat, and configuration controls until expanded.
3. Ensure keyboard focus does not land on visually hidden secondary controls.
4. Verify desktop/mobile minimized and expanded player states.

## Task 6: Complete the motion/accessibility pass

**Files:**

- Modify: `apps/web/src/styles.css`, `apps/web/src/kidung-ux.css`, `apps/web/src/ui-hardening.css`, or a focused late-loaded stylesheet
- Modify: `apps/web/e2e/accessibility.spec.ts`
- Modify: `apps/web/e2e/navigation-layout.spec.ts` as needed

**Steps:**

1. Audit route/view changes, sidebar collapse, viewer chrome, bottom sheets/popovers, hamburger drawer, zoom/page HUD, mini-player, select/dropdown, toast/feedback, selection toolbar, and quick navigation.
2. Reuse `--motion-fast`, `--motion-normal`, and `--ease-out`; add no new arbitrary timing scale unless required.
3. Remove abrupt state changes that benefit from short opacity/transform transitions.
4. Ensure `prefers-reduced-motion` removes non-essential motion.
5. Ensure coarse-pointer operation never depends on hover.
6. Verify responsive layouts at representative desktop and mobile widths.

## Task 7: Full regression and PR verification

**Files:** only fixes discovered by verification

**Steps:**

1. Run/observe unit/typecheck/build and Playwright CI for the final head.
2. Inspect failed or flaky jobs; fix causes rather than accepting retries.
3. Confirm Edge TTS live smoke remains green if triggered.
4. Confirm PR #4 is mergeable and summarize the interaction changes plus any intentional controls that were kept explicit for accessibility/usability.
