# Balanced Universal Appearance + CI Implementation Plan

> **For Codex/ChatGPT:** execute this plan task-by-task with red-green-refactor. Draft PR runs selective browser feedback; final ready-for-review head must run the full exact-head browser/native/build gates.

**Goal:** Adapt the useful `gyschordweb` Appearance Studio parity into a universal GYSApp readability system, add coherent motion without regressions, and shorten draft-PR browser feedback while preserving the final full-suite gate.

**Architecture:** Keep appearance preferences in a focused module independent from the existing shell settings schema. Apply preferences before React renders, expose one small React panel from `main.tsx`, and express density/font/motion through CSS tokens in `calm-liturgical.css`. Keep all existing routes and domain behavior intact. CI uses the existing changed-file resolver for draft PRs and the existing two-shard full suite for ready PRs/main.

**Tech stack:** React 19, TypeScript 7, CSS, Vitest, Playwright, GitHub Actions.

---

## Task 1: Lock preference behavior with failing unit tests

**Files:**

- Create: `apps/web/src/ui-preferences.test.ts`
- Create later: `apps/web/src/ui-preferences.ts`

**Steps:**

1. Add tests for defaults (`standard` + `auto`), invalid stored values, persistence, document dataset application, and subscriber notification.
2. Push tests before production code and verify CI fails because the preference module does not exist.
3. Implement only the preference module needed by the tests.
4. Re-run CI and confirm the unit/static gate is green.

## Task 2: Add the real UI and browser contract

**Files:**

- Create: `apps/web/src/ui-preferences-panel.tsx`
- Modify: `apps/web/src/main.tsx`
- Modify: `apps/web/src/calm-liturgical.css`
- Modify: `apps/web/src/backup-settings.ts`
- Create: `apps/web/e2e/appearance-preferences.spec.ts`

**Steps:**

1. Browser test first: panel is reachable in `Lainnya`, density and font changes apply immediately, persist across navigation/reload, compact mode preserves mobile 44px targets, and reduced-motion removes nonessential motion.
2. Browser test writes QA screenshots for phone/tablet/desktop states into Playwright test output.
3. Implement a polished `Tampilan & Keterbacaan` panel with `Nyaman`, `Standar`, `Ringkas` and `Otomatis`, `Himne`, `Sans modern` font choices.
4. Initialize preferences before React render and render the panel alongside the app.
5. Add the preference key to portable backup.
6. Add CSS tokens so default `standard/auto` remains visually compatible while comfort/compact/font modes affect the entire application predictably.

## Task 3: Complete the motion system safely

**Files:**

- Modify: `apps/web/src/calm-liturgical.css`
- Verify with: `apps/web/e2e/appearance-preferences.spec.ts`, existing navigation/media/sidebar specs

**Steps:**

1. Define shared 160/200/240ms motion tokens and a non-bouncy ease-out curve.
2. Apply transition properties only to stateful shell/navigation/media/panel/popover surfaces; avoid `transition: all` and continuous decorative animation.
3. Use transform/opacity for the new panel entrance and state affordances.
4. Preserve existing sidebar/media motion and make reduced-motion equivalent immediate.

## Task 4: Make draft PR browser feedback selective

**Files:**

- Create: `scripts/test-e2e-selective-ui.test.mjs`
- Modify: `scripts/test-e2e-selective-core.mjs`
- Modify: `.github/workflows/ci.yml`

**Steps:**

1. Add a failing resolver test proving `ui-preferences`/appearance CSS changes include the appearance, smoke, navigation, accessibility and universal-usability browser contracts.
2. Update the resolver minimally until the test passes.
3. On draft PRs, run one selective browser job using exact PR base/head SHAs and the already verified build artifact.
4. On ready PRs and `main`, keep the full two-shard exact-head browser suite.
5. Keep one stable `e2e` aggregate check that accepts exactly the applicable path and fails if neither path succeeds.
6. Upload UI-preview screenshots from browser jobs when present.

## Task 5: Measure and visually inspect

**Files:**

- Existing visual suites plus new appearance suite

**Steps:**

1. Inspect draft workflow timings against the existing full-suite baseline.
2. Download Playwright screenshots generated from real Chromium.
3. Visually inspect at least 390x844, 768x1024 and 1440x900; inspect standard, comfortable and compact states, panel open/closed, light/dark when exercised.
4. Fix clipping, overlap, insufficient contrast, undersized controls, awkward density or animation regressions before final acceptance.

## Task 6: Final exact-head acceptance

**Steps:**

1. Mark PR ready for review.
2. Require the new head to pass format/docs/generated/audit, build, unit/policy, bundle, security, native Windows and full two-shard Playwright.
3. Inspect browser artifacts and final screenshots from that same final head.
4. Do not claim completion until verification evidence is fresh and all required gates pass.

## Execution status

Draft selective verification is green with the production build reused by browser tests. Removing Playwright's redundant hosted-runner dependency bootstrap reduced the measured headless-browser install step from about 17.8 seconds to about 6.2 seconds while the Chromium smoke suite continued to pass. The pull request is now ready for review; this documentation-only synchronization intentionally triggers the required full two-shard exact-head acceptance run.
