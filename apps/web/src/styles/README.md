# Base stylesheet ownership

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
