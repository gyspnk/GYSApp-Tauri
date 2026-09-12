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

## Acceptance gates
- Universal-usability E2E contract passes on phone, tablet, and desktop.
- Existing accessibility, navigation, touch-target, UX, reader, media, settings, smoke, and parity tests remain green.
- Representative visual screenshots are inspected before intentional baselines are accepted.
- Format, lint, typecheck, unit tests, build, bundle budget, production audit, and native checks pass.
- Temporary QA workflows are removed before final acceptance.
