# Calm Liturgical Utility

Approved direction: Option A, 2026-09-12.

## Goal

Make GYSApp feel like a calm, professional Bible and worship utility that is easy to understand for children, adults, and older users without removing any existing feature.

## Principles

- Content first; avoid generic SaaS/dashboard styling and decorative AI-slop patterns.
- Keep the five primary destinations: Beranda, Alkitab, Kidung, Iman, Lainnya.
- Keep light, dark, AMOLED, sepia, system theme, user accent, TTS, MIDI, PDF readers, offline tools, account, literature, and faith features.
- No new UI framework, font package, icon library, or runtime dependency.
- Prefer typography, spacing, dividers, and active-state clarity over heavy shadows, gradients, glass, oversized radii, or decorative motion.
- Preserve keyboard access, focus visibility, semantic landmarks, reduced motion, and screen-reader names.

## Responsive interaction model

- Desktop >=960px: readable full sidebar by default; collapsed sidebar remains an intentional power-user state.
- Tablet 600-959px: compact side rail keeps visible destination labels instead of mystery icon-only navigation.
- Phone <600px: stable five-item bottom navigation with readable labels and safe-area spacing.

## Universal usability contract

1. Common tap targets are at least 44x44 CSS px.
2. Tablet primary navigation exposes visible text labels.
3. Mobile primary navigation labels are at least 11px.
4. Important operational copy does not rely on 10px text.
5. Search, account, reader, media, and primary buttons have predictable focus and hit areas.
6. Representative pages remain usable at 200% text zoom without horizontal page overflow.
7. Hover is never required to discover a primary action.
8. Surface elevation is subtle; cards are not the default treatment for every feature.
9. Advanced actions remain available through clear progressive disclosure.
10. Reduced-motion mode provides equivalent usability.

## Surface priorities

- Beranda: continuation/current spiritual content first, secondary shelves later.
- Alkitab: scripture dominates; book/version/TTS controls stay compact and reachable.
- Kidung: search and song selection dominate; playlist/favorite/MIDI/PDF/settings remain available but secondary.
- Iman: scannable beliefs with direct PDF reading, notes, and resume intact.
- Literatur: direct reading, progress, and resume intact with quiet reader controls.
- Lainnya: account/preferences first, offline/data second, personal utilities next, advanced device tools last.
- Media surface: persistent and predictable; playback controls are easy to hit while metadata stays secondary.

## Developer velocity and CI contract

Fast feedback is part of product quality. The normal edit-test loop and pull-request checks must avoid repeating expensive work when an equivalent verified artifact can be reused.

1. A CI run should build the production web application once where practical; browser tests should consume that verified build rather than compiling the full workspace again.
2. Permanent CI must not run semantically identical TypeScript compilation gates twice. If `lint` and `typecheck` are both aliases for `tsc -b`, one canonical static TypeScript gate is sufficient until a distinct linter exists.
3. Playwright keeps a clean-checkout local fallback that can build automatically, while CI can explicitly select a prebuilt artifact path.
4. GitHub-hosted runners should reuse safe dependency/compiler caches where they materially help, especially Cargo/Rust dependencies. Browser caching is used only when measurement shows it is faster than a fresh Playwright install.
5. Targeted/selective tests may provide rapid development and PR feedback, but they do not replace the full exact-head E2E, native, build, bundle, audit, and visual acceptance gate required before this goal can finish.
6. CI changes must preserve generated-provenance, documentation, security scan, native, bundle-budget, and production dependency-audit coverage.
7. Performance changes are accepted from measured GitHub Actions evidence, comparing the same meaningful phases before and after rather than relying on subjective speed.
8. Local development should expose a fast path for affected tests without changing the semantics of the full verification command.

### Measured baseline

The reference successful CI run before this optimization used a separate E2E runner that reinstalled dependencies, installed Playwright system/browser payloads, then executed the Playwright `webServer` command which rebuilt the full monorepo before browser tests. The browser job was about 4 minutes end to end; browser/dependency setup consumed roughly 30 seconds, the duplicate root build roughly 6 seconds, and the 129-test Playwright run roughly 3.3 minutes. These figures are the comparison baseline for this refinement cycle.

## Acceptance gates

- Universal-usability E2E contract passes on phone, tablet, and desktop.
- Existing accessibility, navigation, touch-target, UX, reader, media, settings, smoke, and parity tests remain green.
- Representative visual screenshots are inspected before intentional baselines are accepted.
- CI/development optimization demonstrably removes redundant compilation/setup and improves feedback time without weakening the final full verification gate.
- Format, canonical TypeScript static check, unit tests, build, bundle budget, production audit, full E2E, and native checks pass on the exact final head.
- Temporary QA workflows are removed before final acceptance.
