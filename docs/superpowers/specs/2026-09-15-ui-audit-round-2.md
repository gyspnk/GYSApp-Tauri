# UI Audit Round 2

Approved direction: 2026-09-15.

## Goal

Run a second, evidence-driven UI refinement cycle on the current merged `main` state so GYSApp becomes more internally consistent across reading surfaces, preferences, themes, and responsive breakpoints without destabilizing the Kidung work that is already performing well.

This cycle is not a visual rewrite. It is a targeted normalization pass that treats Kidung as the strongest existing reference surface, fixes verified hierarchy and responsive inconsistencies elsewhere, and expands automated coverage around the parts of the product that currently have thinner visual protection.

## Current baseline

- The starting point is `main` after PR #6 (`Deep UI system cleanup: calm hierarchy + Kidung refinement`) was merged.
- The established visual direction remains **calm liturgical utility**: content-first, restrained, readable, touch-safe, and intentionally unlike a generic SaaS dashboard.
- The existing responsive shell contract already covers phone, tablet, desktop, and wide desktop breakpoints from 320px through 1920px.
- Kidung currently has the strongest responsive and reader-specific coverage and should be used as the primary quality reference rather than redesigned by default.
- Existing UI preferences support three density modes (`Nyaman`, `Standar`, `Ringkas`) and three font modes (`Otomatis`, `Himne`, `Sans modern`). A mobile screenshot that appeared to omit `Nyaman` was verified as a scroll-position artifact after the test selected `Ringkas`, not a missing-option bug.
- Existing appearance tests already protect preference persistence, navigation across routes, dark-theme compatibility, touch safety, horizontal overflow, focus restoration, and reduced-motion behavior.

## Non-goals

This cycle must not:

- Replace the existing navigation model or primary destination structure.
- Redesign Kidung simply for novelty when no verified usability problem exists.
- Remove user-facing features, density modes, theme modes, reader capabilities, PDF controls, account functions, or offline tools.
- Introduce a new UI framework, component library, font package, or runtime dependency merely to restyle existing surfaces.
- Convert every section into cards or add decorative shadows, gradients, glass effects, oversized radii, or motion for visual interest.
- Accept screenshot baselines automatically when a visual test fails.
- Add broad CSS overrides that hide the actual source of a cascade conflict.
- Pursue unrelated refactors that do not directly improve the audited UI surfaces or protect them from regression.

## Design principles

1. **Evidence before polish.** A change needs a concrete usability, hierarchy, responsive, accessibility, consistency, or maintainability reason.
2. **Kidung as reference, not template.** Other surfaces should inherit its discipline around hierarchy, target size, density, and restraint without becoming visually identical.
3. **Reading content dominates chrome.** Scripture, hymn text, literature content, faith material, and PDFs remain more visually important than toolbars and metadata.
4. **Whitespace is allowed.** Empty space is not a defect when it improves reading. The defect is space with no compositional purpose or alignment logic.
5. **Secondary controls stay available but quiet.** Progress, download, technical settings, metadata, and advanced actions should not compete with the primary reading task.
6. **Responsive behavior is semantic.** Breakpoints should reorganize information based on user task and available space, not just shrink desktop layouts.
7. **Themes are a product contract.** Light, dark, AMOLED, and sepia must preserve hierarchy and legibility rather than merely swap background colors.
8. **CSS ownership remains explicit.** Shared visual authority belongs to the cross-app layer; feature-specific behavior remains local to the feature.
9. **No baseline laundering.** A screenshot mismatch is an investigation trigger, not permission to overwrite expected images.
10. **Exact-head verification decides completion.** Final acceptance is based on the exact implementation head, not an earlier commit with similar results.

## Surface strategy

### Kidung

Kidung is a reference surface for this cycle.

- Keep search and song selection as the dominant catalog tasks.
- Keep lyrics as the dominant reader content.
- Preserve existing direct-manipulation behavior, toolbar compaction, progressive disclosure, playlist behavior, MIDI/PDF access, and 320px small-phone handling unless a test or visual review proves a regression.
- New shared styles must be checked against Kidung to ensure the normalization work does not accidentally reintroduce cards, shadows, motion, narrow titles, or toolbar overflow.
- Any Kidung modification requires a documented reason tied to a verified defect.

### Literatur and Iman: one reading family

Literatur and Iman should feel like two content domains inside the same application family, not unrelated mini-apps.

Normalize the following relationships while preserving each surface's domain-specific content:

- page title rhythm and introductory spacing;
- search/filter placement and visual priority;
- row height, dividers, metadata hierarchy, and selected/active states;
- spacing between catalog controls and results;
- catalog-to-detail transition hierarchy;
- reader entry and exit affordances;
- PDF chrome, progress, resume, and secondary action treatment;
- empty/loading/error states where they appear in the same task stage.

The result should not make Literatur and Iman identical. Literatur may remain more publication-oriented and Iman more doctrinal/scannable. The consistency target is shared interaction grammar, not identical visual composition.

### Preferences and overlays

Preferences should remain a centered dialog on larger screens and a bottom sheet on phones.

Required behavior:

- all density and font options remain available at every supported viewport;
- the header and close control remain reachable without layout jumps;
- section headings and current-state indicators are visually subordinate to the option choices but clearly scannable;
- the footer action remains reachable without obscuring the last option;
- opening, selecting an option, scrolling, closing, and reopening must not create accidental content hiding;
- focus trap, Escape close, focus restoration, reduced-motion behavior, and touch-target guarantees remain intact;
- current preference state should be understandable without relying on color alone.

The mobile implementation may use sticky header/footer behavior where it improves reachability, but it must not create a cramped viewport or trap users between sticky regions.

## Responsive design contract

### Phone: <600px

- Stable five-item bottom navigation remains intact.
- Primary content uses the full practical width with safe gutters.
- Secondary controls collapse into progressive disclosure before primary actions are hidden.
- No horizontal page overflow at 320px, 390px, 430px, or 599px.
- Text must wrap naturally rather than be shrunk below comfortable reading size solely to fit controls.
- Sheets and overlays must remain operable with short viewport heights as well as common tall phones.

### Tablet: 600-959px

- The labeled compact side rail remains the navigation model.
- Reading columns should use available width more deliberately than phone layouts without becoming desktop-wide walls of text.
- Toolbars may move beside or above content when that improves the task, but icon-only mystery controls are not acceptable for primary actions.
- Particular attention is required around 600px, 768px, and 959px because these are likely transition points for catalog and reader layouts.

### Desktop: >=960px

- The readable full sidebar remains the default model.
- Content width should be intentionally constrained for reading rather than expanded simply because screen space exists.
- Wide-screen whitespace is acceptable when it supports centered reading rhythm.
- Controls should align to the content grid instead of floating at arbitrary horizontal positions.
- 1024px landscape must be treated as a real desktop constraint, not assumed to behave like 1440px.

### Wide desktop: >=1440px

- Avoid oversized empty side zones caused by narrow fixed layouts with unrelated floating controls.
- Do not stretch long-form reading text beyond comfortable measure.
- Use wide space for alignment, supporting metadata, or stable control placement only when those additions do not compete with primary content.

## Theme contract

Representative states must be reviewed in light, dark, sepia, and AMOLED.

For every theme:

- active navigation remains distinguishable without depending only on hue;
- body text, muted text, dividers, controls, and focus rings retain clear hierarchy;
- selected preference choices remain visible;
- reader chrome does not become visually heavier than reading content;
- overlays and scrims remain separable from the underlying page;
- PDF canvases, surrounding chrome, and toolbar boundaries remain readable;
- no surface introduces theme-specific glow, excessive contrast, or washed-out secondary text.

The goal is perceptual equivalence, not exact color matching between themes.

## Typography and density

The three density modes are product behavior, not a cosmetic demo.

- `Nyaman` may increase breathing room and reading comfort but must not push essential controls beyond reach.
- `Standar` remains the balanced default.
- `Ringkas` may reduce nonessential whitespace, especially with fine pointers on desktop, but touch targets remain at least 44x44 CSS px on coarse-pointer and sub-960px contexts.
- Density changes must not alter information architecture, hide features, or change the order of primary actions.
- Font preferences must preserve semantic hierarchy; a display/hymnal heading font must not leak into long body copy where it reduces legibility.

## Accessibility contract

The existing accessibility direction remains mandatory and is extended to the newly audited states.

- Common actionable targets are at least 44x44 CSS px where touch interaction is expected.
- Keyboard focus remains visible in every theme.
- Modal/sheet focus is contained while open and restored to the logical opener when closed.
- Escape closes modal/sheet contexts where that behavior is already established.
- Reduced-motion mode removes nonessential animation without changing functionality.
- Primary actions do not require hover to discover.
- Selection and active state do not rely on color alone.
- UI and text enlargement must not cause horizontal page overflow or hide essential actions.
- Operational labels on mobile remain readable and are not reduced to tiny text to preserve a single-row layout.

## CSS architecture contract

The purpose of this cycle is to improve UI consistency without returning to cascade drift.

- `calm-liturgical.css` remains the final cross-app visual authority for shared concepts such as global spacing, calm elevation, navigation treatment, common content rhythm, and shared overrides that are intentionally universal.
- Feature-specific layout and interaction rules remain in their feature CSS files, such as Kidung, Preferences, Literatur, or Iman styles.
- A feature file may not reintroduce a visual pattern that the final shared layer intentionally removed unless the exception is explicit and documented.
- Avoid global selectors that happen to fix one route while silently altering another.
- Avoid blanket `!important`; use it only when preserving an established cascade contract that cannot reasonably be expressed through ownership/order, and document the reason near the rule.
- Duplicate selectors with contradictory declarations should be consolidated at their owning layer rather than counterpatched later in the import order.
- Shared tokens should be preferred for repeated spacing, control hit size, surface, line, typography, and elevation decisions.

## Verification matrix

Existing shell and Kidung coverage should be retained. New work should concentrate on blind spots rather than duplicating already strong coverage.

### Structural responsive checks

Representative breakpoints:

- 320x720
- 390x844
- 430x932
- 599x900
- 600x900
- 768x1024
- 959x900
- 960x900
- 1024x768
- 1440x900
- 1920x1080

Required assertions include:

- no horizontal document overflow;
- navigation remains inside the viewport;
- primary content remains inside the viewport;
- target surfaces render their expected main component;
- breakpoint transitions do not hide primary actions;
- reader toolbar/content/footer geometry remains ordered where applicable.

### Preferences coverage

Add or strengthen tests for:

- phone open-state before any selection, proving all three density options remain reachable;
- narrow phone after selecting each density mode;
- 599/600 and 959/960 transitions where dialog/sheet or surrounding navigation mode changes;
- 1024 landscape and 1440 desktop alignment;
- light, dark, and one additional representative low-luminance or warm theme;
- keyboard traversal through every option and footer action;
- content reachability with enlarged text/UI settings.

### Literatur and Iman coverage

Extend visual and structural coverage beyond the current 390/768/1440 emphasis.

Required representative states:

- catalog at 320, 390, 600, 768, 960/1024, 1440, and 1920;
- reader/PDF state at 390, 600/768, 1024, and 1440;
- at least one dark-family theme and sepia for reading surfaces;
- long title, long metadata, and multi-line row content;
- loading/empty/error states if those states are user-visible and deterministic to test;
- direct reader entry as well as catalog-to-reader transition when both flows exist.

### Visual acceptance

- Screenshot failures must be inspected against the intended design before updating baselines.
- Baselines may be refreshed only when the actual render is intentionally better or the previous baseline is stale for a known reason.
- Any baseline refresh must be limited to the screenshots that genuinely changed.
- A baseline change alone is not evidence of correctness; structural and interaction assertions must still pass.

## Prioritization model

### P0 — correctness/accessibility

Fix first:

- clipped or hidden controls;
- horizontal overflow;
- unreachable options;
- broken focus behavior;
- insufficient touch targets;
- theme states where content becomes unreadable;
- reader geometry that overlaps or covers content.

### P1 — hierarchy/responsive consistency

Then fix:

- inconsistent search/filter prominence;
- mismatched row density and spacing across related reading surfaces;
- control placement that changes unpredictably at breakpoints;
- desktop/tablet layouts that use space poorly enough to harm comprehension;
- PDF/reader chrome that visually competes with content.

### P2 — visual polish

Only after P0/P1:

- small rhythm adjustments;
- border/elevation normalization;
- metadata alignment;
- typography refinements;
- theme-specific tonal tuning.

### P3 — maintainability refactor

Refactor only when necessary to prevent recurrence of a verified issue:

- consolidate contradictory selectors;
- move shared behavior into the correct shared layer;
- remove obsolete overrides;
- extract shared tokens when repeated values are causing drift.

P3 must not become an unrelated CSS cleanup project.

## Implementation sequence

The implementation plan should preserve this order:

1. Add or strengthen tests that expose each verified problem.
2. Capture current failure evidence before modifying behavior when practical.
3. Fix shared architecture only when the defect is genuinely cross-app.
4. Fix Literatur and Iman reading-family inconsistencies.
5. Fix Preferences/overlay blind spots and breakpoint behavior.
6. Check all shared changes against Kidung as a regression surface.
7. Review representative theme states.
8. Run focused browser tests during development.
9. Run the full responsive/visual/accessibility verification on the exact final head.
10. Inspect intentional screenshot differences before accepting any baseline updates.

## Acceptance gates

This cycle is complete only when all of the following are true:

- No P0 issue remains in the audited surfaces.
- Literatur and Iman use a recognizably shared interaction and hierarchy grammar while preserving their content-specific character.
- Preferences expose every option at every supported viewport and retain existing focus, persistence, touch, reduced-motion, and close behavior.
- Kidung shows no regression from shared style changes.
- Light, dark, sepia, and AMOLED representative states preserve readable hierarchy.
- Phone, tablet, desktop, and wide desktop states are verified at the defined breakpoint matrix without horizontal document overflow.
- Enlarged UI/text does not hide essential controls or force page-level horizontal scrolling.
- Visual baseline changes have been manually justified by the intended design rather than accepted automatically.
- CSS changes respect explicit layer ownership and do not recreate cascade drift.
- Focused tests pass during development and the required exact-head CI gates pass before merge.

## Review decision

Before implementation planning begins, review this spec for one question: **does this scope correctly prioritize consistency and verification without turning the second audit into another broad redesign?**

If approved, the next step is to create a concrete implementation plan that maps each acceptance requirement to specific files, tests, and verification commands.