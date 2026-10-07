# Faith UI follow-up — 2 October 2026

> Historical plan/audit/receipt. Its dates, measurements and acceptance scope
> remain attached to the original revision. Current behavior and outstanding
> delivery gates were reviewed on 2026-10-07; use the [documentation index](../README.md)
> and [current feature matrix](../discovery/feature-parity-matrix.md) for the present implementation.

Based on `origin/main` at `85743fe` (merged PR #9). Cards and search follow the
content width; the heading remains accessible without a visible title. All ten
statements remain complete and justified. Phone text defaults to 14px in rem,
and desktop search text is 16px. PDF/Notes actions use the explicitly requested
32px height, sit at the bottom right and have an 8px text-to-control gap. Search
has a plain blue icon, translated placeholder and clear control restoring input
focus. Remove the reflection hint and unused translations/styles.

Ctrl+wheel and two-finger pinch zoom text from 75% to 300%. A single CSS custom
property and one scheduled animation frame update the text without React
rerendering all cards. Ordinary scrolling stays native, controls retain their
size, and event listeners/frames are disposed on route unmount. Scope gestures
to the Faith page so existing PDF/lyrics zoom remains independent.

The desktop toggle is inside the sidebar with a 44px click target, no border or
background, and a hover/focus state. It clears navigation items and preserves
collapse state across reload. Header search uses the shared surface token, and
the unused header network status and event listeners are removed.

## Fast verification

After a production build, run:

```sh
GYS_E2E_PREBUILT=1 pnpm test:e2e e2e/faith-zoom.spec.ts e2e/sidebar-collapse.spec.ts --fully-parallel --retries=0
```

This runs gesture, three-locale phone/desktop search/layout and sidebar contracts
without retries, external CDN requests or screenshot generation. The first
local run passed 10 cases in 10.8 seconds. Regular selective verification now
classifies Faith/gesture edits explicitly and distributes tests within the
existing worker bound. Unknown shared changes still select the full suite;
shared composition edits retain shell, accessibility, responsive and visual
checks. Full CI/release gates and screenshot tolerances are unchanged.

The first visual regeneration passed 57 cases in 1.2 minutes. Updated baselines
reflect intentional header/sidebar/Faith geometry changes. Workspace typecheck
and unit tests pass after removing the unused reflection-hint translations.

Snapshot review also found inherited `main` baselines showing the earlier dark
sidebar and pre-collection More page, although merged source already uses a
light rail and collection cards. Regeneration includes those existing source
changes alongside this follow-up; no screenshot thresholds or masks are changed.

## Final local evidence

- Production build, workspace typecheck, all workspace/script units (369 web
  units), formatting, documentation and generated provenance pass.
- The broad functional browser run passed 469 cases and skipped three
  environment-dependent cases. Its one failure exposed a duplicate accessible
  name on the search landmark and input. Remove the redundant landmark label
  and verify unique input targeting in all three locales.
- The final focused rerun includes that search/notes flow and direct PDF opening:
  12/12 pass without retries in 9.8 seconds.
- Final visual comparison, without regeneration: 57/57 pass in 49.4 seconds.
- Initial JavaScript is 177.6 KiB gzip across 17 files, below the 180 KiB budget.
  No dependencies or native audio code changed. Hosted CI remains a separate
  verification step; local Chromium evidence does not assert Windows results.
