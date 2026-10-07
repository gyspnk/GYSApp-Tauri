# Base stylesheet ownership

Reviewed 2026-10-07. [UI system](../../../../docs/ui-system.md) describes current
sizing, focus and motion contracts.

`../styles.css` imports these layers in their original order. The extraction
preserves the existing reviewed cascade; feature refinements imported by
`main.tsx` still follow it. Keep tokens in `00-tokens.css`, foundational layout
in `01-foundations-and-layout.css`, Bible/settings in `02-bible-and-settings.css`,
shell controls in `03-shell-controls.css`, reader/media in `04-reader-media.css`,
and responsive/final base adjustments in `05-responsive-refinements.css`.

Some historical selectors cross these boundaries. Move or deduplicate those
only with computed-style and rendered regression evidence: the filenames do
not establish new cascade precedence. Reading surfaces, Kidung UX, typography,
preferences and the final calm refinements retain their existing owners.

New behavior contracts live in `kidung-style-behavior.spec.ts` and the 90-case
`roadmap-ui-matrix.spec.ts`; source checks remain for structural import
ordering. Unknown shared CSS
changes select the full browser suite.

## Current final feature layers

`main.tsx` imports `persistent-media.css`, `app-design.css`, `menu-motion.css`
and `midi-player.css` in that order after existing reader/refinement layers.
`midi-player.css` owns compact expanded musical controls and the half-circle
edge tab; its geometry must override legacy sidebar/rail rules at equivalent
specificity. `menu-motion.css` owns exit as well as entrance behavior.
`bible-picker.css` loads with the address picker/Bible feature.

Default accent follows Church blue tokens; old warm editorial receipts are
historical, not a new palette requirement. Use target-specific sizing (36 px
mouse/40 px touch MIDI, 44 px secondary touch actions) and a full hit area for
half-visible controls. Keep one animation owner per transition, inert closing
menus and reduced-motion behavior. Computed styles and real hit testing catch
cascade/focus defects that source-string checks cannot.
