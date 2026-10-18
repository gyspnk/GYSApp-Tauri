# UI, sizing and motion system

Reviewed 2026-10-11 against the current browser implementation. The default
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

Use one clear label for each action. Omit repeated headings, instructions for
self-explanatory buttons, decorative help paragraphs and implementation details
from routine screens. Appearance choices use their labels and visual samples;
selected states remain visible and accessible. Keep concise information about
destructive actions, backup scope, network requirements, loading/recovery and
settings whose effects need explanation. Reading content and useful progress,
dates, download sizes and account status remain available in all three locales.

Sauh thumbnails clip loading and decoded media to the same rounded frame.
The Home card uses the page gutter once at every breakpoint; highlighted article
quotations fill their reading column with compact padding and show the complete
verse on phones.

Navigation is a fixed sidebar/rail on desktop and a bottom bar on phones.
Collapsing the rail preserves icon/toggle positions while its label column clips
and fades. Kidung local navigation contains the catalog and playlist; Kidung
preferences live in the application's main settings. The floating player is viewport-positioned and independent of page
scroll; minimized MIDI consumes no sidebar content slot.

Fullscreen lyrics uses one header row on wide screens and two on small screens,
with persistent verse navigation
at the bottom. Its optional music/text controls open in a bounded popover;
Escape closes that popover and restores focus to its toggle.

## Control contracts

| Surface           | Layout / target                                                                                                                                                              |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Main header       | Adaptive logo/account photo, search, locale and appearance/account actions; no connectivity badge.                                                                           |
| Kidung catalog    | Category, destination shortcuts and one icon-changing text/score mode action in the same field; search sits close to flat list rows.                                         |
| Text/score viewer | One compact title/action row; phone actions use distinct icons and accessible names; secondary actions and verse/scroll choices occupy two menu rows.                        |
| Expanded MIDI     | Two primary rows at every width; title/progress/dock actions above centred transport flanked by tempo and settings; 32 px mouse / 44 px touch targets; maximum width 900 px. |
| MIDI musical row  | A labelled Music group in the settings popover; full-width instrument selector above key and transpose controls.                                                             |
| MIDI utilities    | One bounded scrollable popover; secondary buttons use the same mouse/touch target sizes.                                                                                     |
| Minimized MIDI    | One 28 px visible half-circle, 56 px circle diameter, inside a 44 × 60 px hit area, flush left/right.                                                                        |
| Bible picker      | Book/chapter/verse address row, shared dropdown, numeric keypad and explicit apply action; no automatic chapter jump on digit input.                                         |
| Faith             | Full-width number/word search, full justified text, compact PDF/note actions at card lower right.                                                                            |
| Shared PDF        | Contextual icon tools, compact page/zoom/footer actions; separate page and hymn navigation names.                                                                            |

Targets are contextual rather than forced to one giant size. Keep icons centered
inside the actual hit rectangle. A visually half-hidden edge tab retains a full
reachable hit area; form labels and accessible names identify its actions.
Selected/disabled/busy states cannot rely solely on color or misleading text.
The inline Google SDK owns its branded icon/text control. Its subtree restores
default content-box sizing at zero specificity, letting provider styles retain
their own explicit dimensions instead of shrinking the compact logo to zero.

## Animation ownership

- `control-motion.ts` delegates press feedback once at document level using
  native Web Animations; avoid a per-button animation/listener framework.
- `menu-motion.css` animates native disclosures and retained floating menus.
  `use-menu-presence.ts` keeps React menus mounted through their exit; closing
  content becomes inert immediately. Rapid toggles reverse the same movement.
- `route-transitions.ts` and `reader-transition.ts` own content snapshots.
  The shell/player stay stable. Legacy entrance effects are suppressed on
  snapshot-capable browsers so lyrics do not animate twice.
  Navigation listeners remain installed across route changes and read the
  current router callback. History/programmatic navigation and browsers without
  native snapshots share the 260 ms incoming page fade/easing; fallback motion
  also suppresses the legacy entrance. Opacity avoids trapping fixed descendants.
  History/programmatic changes cancel earlier route-preload generations, and
  snapshot callbacks recheck the current generation before committing or scrolling.
- Theme transitions freeze pending smooth scrolling and retain state/position.
- `lyric-reflow.ts` moves stable word and chord boxes to their new positions
  over 340 ms after wrapping or font/spacing changes. Text layout and chord
  measurement use untransformed geometry. Pinch previews bypass this animation.
  Hidden chord lanes inherit lyric spacing; repeated toggles restore the same
  scale. Autofit measures an isolated preferred-size copy with per-reader history.
- `pdf-zoom.ts` animates anchored preview geometry; `pdf-detail-layer.tsx`
  adds sharp visible-region detail after the correct page preview is ready.
- MIDI minimize/restore fades out for 200 ms before changing geometry and fades
  in for 480 ms, retaining the reserved reader space through the entrance.
  Edge movement uses 340 ms and preserves glyph sizes; four equalizer
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

Reader chrome uses 32 px rows with a fine pointer and 44 px rows with a coarse
pointer. The main Kidung title and actions share one row, including at 320 px;
long titles truncate visually while their full text remains available to assistive
technology. MIDI settings use five tightly spaced control rows, with inline
instrument labels and accessible group headings that do not consume extra rows.

Reader settings, dock and fullscreen share the same instrument, key and transpose controls and
settings icon. Instrument menus offer only presets from the active SoundFont;
key changes wrap by an octave at the ±24 semitone limits, and both surfaces expose
reset. The shared BPM editor supports typing, ±2 buttons and the 30–220 bounds;
clearing its field preserves playback tempo until a valid value is entered.
The dock keeps its slider and places the editor in the existing tempo popover,
so primary controls remain within two rows. Settings changes persist when moving
between the dock and fullscreen.

Sharp/flat notation is one preference observed by text, PDF, dock and fullscreen,
including changes in another tab. Music steppers repeat while held, stop on
pointer cancellation/unmount and use the latest value instead of a stale render.
Reader transpose uses the same ±24 bounds as playback; capo still changes chord
shapes independently. Empty tempo drafts preserve playback; unchanged settings
avoid redundant player updates and preference writes.

Reader text and music sections open one at a time inside their existing popover,
keeping the selected section compact while preserving every adjustment.
PDF music and dock settings also open one at a time. On phones, the PDF music
sheet clears the dock's measured height and stays scrollable after resizing,
so playback controls cannot intercept its notation or key controls.
