# Responsive Reader and Navigation Design

## Goal

Make the Bible and Kidung Rohani flows comfortable and legible on desktop, tablet, and mobile dimensions without changing the existing routes, data model, or visual identity of GYSApp. The work is verified in the local web app with the in-app Browser before any publication decision.

## Evidence and diagnosis

The current local app was inspected at 390x844, 768x1024, and 1440x900, with additional desktop captures at 1280x720. A local GYSChordWeb reference was inspected at desktop and mobile sizes to understand its content hierarchy, not to copy its dark palette.

- The Kidung catalog search field computes to 63px at 390px because `.hymn-page-header .hymn-catalog-controls` has higher specificity than the mobile one-column rule. The result clips the input and makes the filter hard to use.
- Kidung catalog rows are visually flat and stretch across the available width. The reference uses a compact number tile, clear title truncation, status metadata, and a distinct action affordance; GYSApp can adopt that hierarchy while retaining its blue/ivory tokens.
- Kidung detail actions become icon-only at mobile widths. The controls remain technically accessible through aria text, but their visual discoverability is poor and the primary MIDI action is not sufficiently prominent.
- The Bible reader toolbar places navigation, actions, and speech controls in one dense flex region. At 390px the chapter range input computes to zero width and the lower speech area approaches the fixed bottom navigation.
- The tablet shell intentionally collapses the sidebar to an icon rail, but labels and tooltips are not available as a visible learning aid.

## Mobile Bible reader research

The compact-reader direction is also grounded in current platform and product guidance:

- [Android responsive navigation guidance](https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-and-nav-patterns) recommends three to five primary destinations in a compact navigation bar, moving to a navigation rail on larger windows, and placing infrequent actions in overflow.
- [Android adaptive navigation guidance](https://developer.android.com/develop/adaptive-apps/guides/build-adaptive-navigation) reinforces a bottom bar for compact windows and a rail for expanded windows, with navigation controls kept persistent and out of system safe areas.
- [Apple Human Interface Guidelines for tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars) separates top-level navigation from content actions, keeps labels visible, and recommends an adaptive sidebar for complex structures.
- [Apple toolbar guidance](https://developer.apple.com/design/human-interface-guidelines/toolbars) frames a toolbar as the place for the current title, back/navigation controls, search, and a deliberately limited set of actions.
- [YouVersion's official Bible App overview](https://blog.youversion.com/getstarted/) describes the Reader as the main space for Scripture, with book/chapter switching, audio, typography, highlights, bookmarks, notes, and sharing available from the reading experience.
- [YouVersion's official Android redesign notes](https://blog.youversion.com/2015/08/introducing-all-new-youversion-bible-app-for-android/) describe menus receding while reading to give the text more space, with audio controls floating near the bottom when needed.

Resulting decisions for GYSApp: keep the five labeled destinations in the compact bottom bar, keep the rail/sidebar at larger widths, make the route header the place for page-specific search and context, hide redundant global chrome on Bible/Kidung routes, and keep advanced reader controls behind an explicit disclosure while leaving book/chapter navigation immediately available.

## Design direction

Use a task-first responsive layout inside the existing React components and CSS token system.

1. Keep GYSApp's current light blue/ivory visual language, type scale, icon set, borders, and radii.
2. Borrow the GYSChordWeb content hierarchy only where it improves scanning: numbered tiles, compact metadata/status, card-like row separation, and a deliberate action affordance.
3. Keep desktop navigation labeled. Keep the compact tablet rail, but expose destination names through native titles/accessible labels and preserve a clear active state.
4. Keep the mobile bottom navigation and its fixed safe area. Every primary navigation item and important action must remain a comfortable touch target.

## Flow behavior

### Kidung catalog

- The page heading and offline-pack status remain together.
- Search and collection filtering become one-column, full-width controls below 600px. They may share a row at tablet/desktop widths when both controls retain readable minimum widths.
- Each hymn row has a stable number tile, a title block, compact metadata, and a trailing action/status affordance. Titles remain ellipsized rather than pushing the page horizontally.
- Existing search, collection filter, keyboard navigation, and route behavior stay intact.

### Kidung detail

- Song identity/back navigation stays separate from the action surface.
- The primary MIDI action is visually dominant and remains labeled at every viewport.
- Chord, favorite, queue, PDF, download, and text controls remain available, but are grouped so utility actions do not compete with the primary action.
- Mobile action controls use readable icon-plus-label tiles or grouped rows; no important action depends on an unlabeled icon-only presentation.
- Viewer mode and verse navigation remain reachable without horizontal overflow.

### Kidung viewer alignment

- The Kidung list and viewer share the same scan rhythm: compact identity, clear primary action, and small status/utility affordances.
- When PDF viewer mode is active, the detail hero collapses into a compact viewer chrome with a back/exit affordance, hymn title/number, previous/next song navigation, and a MIDI shortcut. The existing GYSApp shell and light tokens remain visible.
- The PDF surface moves immediately below that chrome so the sheet is the task's first viewport, while advanced actions remain available in a secondary utility area.
- PDF page navigation, zoom, layout, download, chord visibility, and touch gestures stay functional; the compact viewer chrome must not be confused with PDF page navigation.

### Bible reader

- The reader toolbar is divided into navigation, reading actions, and speech settings.
- Book/chapter navigation remains immediately visible. The chapter scrubber receives its own flexible row on narrow screens so its range input cannot collapse to zero width.
- Reader actions wrap in a predictable group and keep labels where space allows.
- Speech controls remain available on desktop/tablet and become a clearly labeled, expandable section on mobile so the first viewport prioritizes reading navigation. The fixed bottom navigation must not cover the expanded controls or essential content.
- Existing split, sync, copy, read-aloud, selection, pagination, and preference behavior stays intact.

## Responsive rules

- 360–599px: single-column page controls, labeled mobile actions, bottom navigation safe area, no horizontal overflow.
- 600–959px: compact icon rail with accessible names, content controls in readable two-column or wrapped layouts, no clipped labels.
- 960px and above: labeled sidebar, centered content surfaces with a comfortable max width, toolbar groups that remain scannable at 1280px and 1440px.
- All breakpoints must be tested at 360, 390, 430, 768, 1024, 1280, and 1440px widths.

## Accessibility and interaction

- Preserve semantic buttons, links, labels, and existing aria attributes.
- Keep primary controls at least 44px high where practical.
- Native titles/tooltips supplement (but do not replace) accessible names on the compact rail.
- Focus states must remain visible against the existing surfaces.
- Keyboard activation, search/filter changes, route navigation, Kidung action buttons, Bible book/chapter changes, and speech-section expansion must be exercised in browser checks.

## Verification contract

Verification is local and evidence-based:

- Use the existing Vite dev server and Codex in-app Browser with Playwright-backed interactions.
- Capture current-run screenshots for Kidung catalog/detail and Bible at representative mobile, tablet, and desktop sizes.
- Assert no horizontal overflow, nonzero mobile search and scrubber widths, visible action labels, stable navigation, meaningful DOM content, no framework error overlay, and clean browser console.
- Run the repository's targeted unit/build checks and local E2E checks after the visual loop.
- Do not push, deploy, delete branches, or modify GitHub state as part of this design/build task.

## Non-goals

- No new routes, authentication changes, data-source migration, or visual rebrand.
- No dependency replacement solely for styling.
- No copying of GYSChordWeb's palette or inaccessible icon-only interaction model.
