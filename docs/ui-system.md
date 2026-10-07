# UI, sizing and motion system

Reviewed 2026-10-07 against the current browser implementation. The default
visual language is Church blue, clear icon actions, compact grouped controls
and readable content that uses the available page width.

## Ownership and layout

Global tokens live in `styles/00-tokens.css`; imported base layers retain their
reviewed order. Refinements follow in `main.tsx`, ending with `app-design.css`,
`menu-motion.css` and `midi-player.css`. Bible-picker CSS loads with its feature.
See [stylesheet ownership](../apps/web/src/styles/README.md).

Do not add a new outer card to a reader that already owns its content frame.
Article, Bible, Faith, lyric and score containers fill their adaptive field;
intentional reading limits belong to the text/column, not an unused nested box.
Reserved thumbnail ratios prevent initial oversized artwork. Catalog rows,
search fields and header controls share consistent corners, accent, icon
weight and focus treatment.

Navigation is a fixed sidebar/rail on desktop and a bottom bar on phones.
Collapsing the rail preserves icon/toggle positions while its label column clips
and fades. Kidung catalog, playlist and settings retain the same local-nav
positions. The floating player is viewport-positioned and independent of page
scroll; minimized MIDI consumes no sidebar content slot.

## Control contracts

| Surface           | Layout / target                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Main header       | Adaptive logo/account photo, search, locale and appearance/account actions; no connectivity badge.                                   |
| Kidung catalog    | Category, destination shortcuts and one icon-changing text/score mode action in the same field; search sits close to flat list rows. |
| Text/score viewer | Compact title/action row with consistent mode glyph/scale and contextual secondary menu; shared verse/song navigation.               |
| Expanded MIDI     | Two rows from 680 px, three below; 900 px maximum width; 36 px mouse or 40 px coarse-pointer/mobile controls.                        |
| MIDI musical row  | Instrument, 52 px key field and compact transpose/reset group in one row, including 320 px layouts.                                  |
| MIDI utilities    | One bounded scrollable popover; secondary buttons retain 44 px targets.                                                              |
| Minimized MIDI    | One 28 px visible half-circle, 56 px circle diameter, inside a 44 × 60 px hit area, flush left/right.                                |
| Bible picker      | Book/chapter/verse address row, shared dropdown, numeric keypad and explicit apply action; no automatic chapter jump on digit input. |
| Faith             | Full-width number/word search, full justified text, compact PDF/note actions at card lower right.                                    |
| Shared PDF        | Contextual icon tools, compact page/zoom/footer actions; separate page and hymn navigation names.                                    |

Targets are contextual rather than forced to one giant size. Keep icons centered
inside the actual hit rectangle. A visually half-hidden edge tab retains a full
reachable hit area; form labels and accessible names identify its actions.
Selected/disabled/busy states cannot rely solely on color or misleading text.

## Animation ownership

- `control-motion.ts` delegates press feedback once at document level using
  native Web Animations; avoid a per-button animation/listener framework.
- `menu-motion.css` animates native disclosures and retained floating menus.
  `use-menu-presence.ts` keeps React menus mounted through their exit; closing
  content becomes inert immediately. Rapid toggles reverse the same movement.
- `route-transitions.ts` and `reader-transition.ts` own content snapshots.
  The shell/player stay stable. Legacy entrance effects are suppressed on
  snapshot-capable browsers so lyrics do not animate twice.
- Theme transitions freeze pending smooth scrolling and retain state/position.
- Lyric/chord row spacing and score-overlay opacity animate their own content.
  Chord labels remain above notation while enabling/disabling.
- `pdf-zoom.ts` animates anchored preview geometry; `pdf-detail-layer.tsx`
  adds sharp visible-region detail after the correct page preview is ready.
- MIDI docking records the previous rectangle and animates position for 320 ms,
  preserving glyph sizes. Tab reveal uses a 220 ms transform; four equalizer
  bars animate with CSS only while playing, without a React clock loop.
- Images reserve dimensions, decode and fade; loading never begins at full
  intrinsic image size before shrinking.

Respect `prefers-reduced-motion` in every owner. Optional animation should become
immediate; it must not introduce a delayed unmount, invisible click shield or
surprise navigation. Do not apply both a snapshot transition and a legacy page
entrance to the same change.

## Gestures and focus

PDF accepts Ctrl+wheel/two-finger pinch with anchored 100–800% fitted zoom and
mouse/pen/single-touch panning when enlarged. Reader text has its own bounded
smooth scaling/preferences. Do not zoom the entire shell in a reader gesture.
The edge tab uses pointer capture and a 6 px drag threshold; touch release
restores only for a tap, avoiding omitted compatibility clicks after a drag.
Dragging/arrow-key movement preserves edge/vertical preference and playback.

Dropdown positioning is bounded/throttled. Focus restoration uses preventScroll;
keyboard list selection scrolls its own list, not the page. Escape closes an
inner dropdown before its parent dialog. Dialogs retain a focus loop and restore
the opener; the Bible picker makes the background inert while present. First
numeric input replaces the armed value; only explicit opening applies its draft.

The immersive interaction boundary suppresses browser context menu/selection/
copy events except necessary form editing. It does not replace accessible
buttons, keyboard navigation or runtime authorization. Data remains protected
by server/storage boundaries, not visual suppression.

## Validation

Use real rendered geometry, hit testing, keyboard/touch behavior and accessible
names rather than exact CSS source strings. Check 320/390/768/1440 px, short
landscape, representative themes and ID/EN/ZH. Use immutable real PDF/MIDI/chord
fixtures for musical/pan/key regressions. Axe is automated evidence for the
checked state, not a complete screen-reader/device certification.

Current player screenshots combine phone/tablet/desktop and expanded/minimized
states into one image; no repeated desktop/mobile prefix is needed. Keep capture
scripts/raw logs outside the repository unless deliberately publishing an audit
artifact. Dated screenshots describe their captured revision.
