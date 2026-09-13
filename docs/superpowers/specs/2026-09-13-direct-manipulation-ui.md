# Direct-Manipulation UI Simplification Spec

**Date:** 2026-09-13

## Goal

Make GYSApp calmer, faster to understand, and less button-heavy by preferring natural direct manipulation where a well-known input already exists, while retaining explicit accessible fallbacks for actions that are not discoverable or cannot be performed by every input method.

## Interaction policy

1. Keep permanent chrome only for primary navigation, essential media controls, explicit back/escape paths, and actions without a conventional gesture/shortcut.
2. Prefer direct manipulation for conventional interactions:
   - PDF zoom: pinch on touch, Ctrl/Cmd + wheel on desktop/trackpad.
   - PDF keyboard zoom: Ctrl/Cmd + Plus, Minus, and 0 to reset.
   - Reader navigation: scroll stays scroll; supported swipe/keyboard navigation complements, but does not replace, explicit long-distance pickers.
3. Secondary and technical actions belong in contextual overflow/settings surfaces instead of the main reading canvas.
4. Give transient feedback for invisible inputs (for example a temporary `125%` zoom HUD) rather than keeping a permanent slider on screen.
5. Never make an essential action gesture-only. Preserve keyboard and single-pointer fallbacks, with at least 40-44px hit areas where controls remain.
6. Keep Kidung/Playlist/Pengaturan as visible local information architecture. Transpose stays an explicit compact control because there is no standard transpose gesture.
7. Media play/pause and seek remain explicit. Secondary MIDI/playlist/repeat/instrument options may compact when the player is minimized.
8. Motion explains state change rather than decorating the UI. Reuse the existing `--motion-fast`, `--motion-normal`, and `--ease-out` tokens, and fully respect `prefers-reduced-motion`.

## PDF / Kidung reader

- Remove the persistent visible zoom range control from the normal Kidung PDF reading experience.
- Keep the existing pinch and Ctrl/Cmd+wheel behavior.
- Add Ctrl/Cmd + `+`, Ctrl/Cmd + `-`, and Ctrl/Cmd + `0` keyboard behavior.
- Show a short-lived zoom percentage HUD when zoom changes through a direct-manipulation input.
- Advanced PDF tools are collapsed by default for Kidung instead of opening automatically.
- Keep a compact accessible fallback inside the advanced/overflow surface rather than in primary chrome.
- Fullscreen, layout, download, editor, and other technical controls stay available but should not compete with reading/navigation.

## Kidung text reader

- Keep the local Kidung / Playlist / Pengaturan tabs.
- Keep frequent one-tap reading actions explicit.
- Keep secondary actions in the existing `...`/reader-settings sheets and avoid duplicating the same command in multiple visible bars.
- Preserve transpose/base-key controls as explicit contextual controls.

## Bible reader

- Preserve the explicit Kitab/Pasal picker and version selector.
- Avoid duplicating typography, display mode, audio, and theme controls between header and drawer.
- Reader navigation may add conventional swipe/keyboard affordances, but long-distance navigation remains explicit.

## Media / shell

- Preserve explicit play/pause and seek controls.
- When minimized, prioritize title/state + play/pause and put secondary MIDI/playlist/instrument/repeat configuration behind expansion or contextual controls.
- Navigation, drawer, sidebar, player, popover, sheet, HUD, and route-state transitions should share the same motion language.

## Motion and accessibility constraints

- No large stagger animations on long hymn or Bible lists.
- No hover-dependent functionality on coarse pointers.
- Preserve focus-visible states and minimum touch targets.
- Reduced-motion mode removes non-essential transforms/animations while retaining state clarity.
- No layout shift should be introduced solely to show temporary feedback.

## Verification bar

- Unit tests for interaction decision helpers where possible.
- Playwright coverage for the user-visible simplification and keyboard/direct-manipulation behavior.
- Desktop and mobile/coarse-pointer behavior checked.
- Full CI green, including existing Edge TTS live smoke where applicable.
- PR remains mergeable after the interaction pass.