# Compact UI and PDF viewer audit

The user requested a more compact warm editorial UI, a functional and efficient
PDF viewer, a button-position audit and appropriate animation. This extends the
[editorial audit](2026-10-01-editorial-ui-audit.md) without reducing 44px control
hit areas or reading text sizes.

## Findings and implementation

| Finding                                                          | Change                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Excess shared page margins                                       | Reduce normal page gutters from 22–56px to 18–40px and starting space from 34–52px to 24–36px; reader routes retain their dedicated layout                                                                                                |
| Repeated PDF layout choices, imperative initial collapse         | Remove the duplicated layout strip; React owns the initially collapsed options state                                                                                                                                                      |
| Mobile navigation spans multiple bulky grid rows                 | Use one primary navigation row and a separate expandable options surface; resume occupies its own row on small screens                                                                                                                    |
| Options/fullscreen icons use overlaid pseudo-element glyphs      | Use the shared SVG icon system, translated accessible names, visible focus and consistent 44px targets                                                                                                                                    |
| General Literature/Faith viewer exposes every option immediately | Share the same compact toolbar, explicit options, fullscreen, current-document download and keyboard reset as hymns                                                                                                                       |
| Typing page numbers renders intermediate pages                   | Draft input commits on Enter/blur; Escape cancels without closing the reader; hymn page windows use relative page numbers                                                                                                                 |
| Two-page fit calculates each page against the entire stage width | Divide available width between pages and account for gutter and stage height                                                                                                                                                              |
| Resizing/fullscreen leaves a stale bitmap                        | Observe actual stage dimensions with a debounced resize refresh                                                                                                                                                                           |
| High zoom multiplies canvas allocation without a ceiling         | Cap each bitmap at 4 million pixels and 8192px per side; preserve logical 100–800% zoom and limit device pixel ratio to 2                                                                                                                 |
| Rapid gestures/sliders restart rendering repeatedly              | Debounce raster zoom by 100ms while reporting requested zoom immediately                                                                                                                                                                  |
| Cancelled renders share a canvas with their successors           | Render into private buffers, commit only the active render and release buffers after completion/cancellation                                                                                                                              |
| Scroll observer uses the full pages container as its root        | Observe the actual scroll stage; separate preload visibility from active-page tracking and stabilize callbacks                                                                                                                            |
| Evicted pages collapse or can retain a stale ready flag          | Preserve page geometry, zero bitmap dimensions, reset status on cleanup and require nearby visibility for readiness                                                                                                                       |
| Continuous mode loses the selected page on layout changes        | Restore the selected page when a document/layout becomes available                                                                                                                                                                        |
| Keyboard and animation behavior differs across viewers           | Shared reset/PageUp/PageDown/Home/End navigation stays responsive during rendering, Escape returns options focus, zoomed arrow scrolling remains available, and reduced-motion disables PDF reveal/option animation and smooth page jumps |

Canvas quality trades off against memory at extreme zoom: logical scrolling
remains at the requested scale, while the raster budget limits sharpness.
The render buffer temporarily duplicates the bounded bitmap during rendering.
This is not a claim that a full master PDF or every cold start is instantaneous.
Normal PDF sources retain the existing HTTP range-loading policy.

## Verification

`pdf-reader-efficiency.spec.ts` uses valid 48-page PDF bytes to exercise actual
PDF.js behavior without relying on upstream CDN responses. It checks compact
320/360/390/768/1440px controls, page draft/commit/cancel, spread fit and resize,
800% raster budgets, offscreen bitmap eviction, reduced motion, accessible
options, focus return and current-document downloads. Existing hymn tests
continue to cover touch gestures, orientation, fullscreen, locale and progress.

The final 10-case PDF efficiency run (including 320px and tall-page scroll
tracking), 32-case focused reader/responsive run and 12 PDF visual rechecks pass
without retries. The deterministic pre-push gate, native asset boundary and
initial JavaScript budget also pass. PDF-only edits now select the focused
rendering suites automatically for faster local debugging.

The 57-case visual inventory was regenerated for intentional layout changes
at the existing thresholds; changed images were reviewed in five contact
sheets. The two unchanged strict hymn-text images retain their canonical CI
renderer baselines. The broader responsive/editorial/roadmap matrix exercises
six screen classes, three locales and five themes; CI runs the full browser
suite and packaged Windows smoke, relaunch and media checks on the pushed tree.
Physical-device audio and provider-specific prerequisites remain separate.
