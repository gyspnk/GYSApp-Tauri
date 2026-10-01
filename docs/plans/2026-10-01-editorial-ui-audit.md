# Warm editorial UI audit

The user authorized a full UI audit and implementation, and chose "Editorial
hangat seperti buku nyanyian". This replaces the previous pale blue appearance
with warm paper, strong reading typography and quiet index/list structure.
Visual changes are intentional; screenshot tolerances remain unchanged.

## Findings and changes

| Surface            | Observed issue                                                                                                | Implemented response                                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared shell       | Uniform blue panels and system typography flatten the hierarchy                                               | Paper/ink tokens, warm dark/system/sepia/AMOLED variants, locally bundled variable reading fonts, clearer headings and navigation indicators                        |
| Home               | An empty reading-history panel offers no starting action; image captions compete with gradients and blur      | Working Bible/hymn destinations on first visit; separate cover and caption, readable serif titles, remove shelf blur and hover translation                          |
| Bible              | Single-column paragraphs span too much of wide screens; verse chips/dividers feel like a table                | Cap single-column reading at 52rem while retaining the full split surface; quieter verse margins and dividers; retain bookmarks, highlights, notes and speech state |
| Cross references   | New type metrics expose a dangling reference star; the enlarged hit target depends on Indonesian aria text    | True inline semantic button with Enter/Space handling, joined verse ending, explicit focus outline, locale-independent 40px/44px hit area                           |
| Hymn catalog       | Main heading is visually hidden                                                                               | A visible index heading above the existing local navigation and search/filter controls                                                                              |
| Hymn reader/PDF    | Reading typography relies on a remote stylesheet                                                              | Local serif normal/italic faces; preserve stanza presentation, chord alignment, transport, PDF navigation and user font settings                                    |
| Faith              | The Notes column compresses long paragraphs on phones; numbered circles dominate the text                     | Place Notes below the paragraph at narrow widths; serif text and aligned margin numbers; retain independent PDF and Notes actions                                   |
| Literature         | Missing images become red error alarms, with nested/partly filled fallback covers; hovered rows move sideways | Full neutral book placeholders with visible initials/category and truthful accessible image state; stable row geometry                                              |
| Sauh/Suara         | Raw technical errors appear in the reading flow; unavailable Sauh lacks a page heading                        | Actionable retry/source copy, retain diagnostic recording, visible state heading and a compact unavailable-state surface                                            |
| Settings           | Dark primary actions have white text on a light accent; offline badge green fails sepia contrast              | Theme foreground/success tokens and a readable foreground for custom hex accents; audit all seven disclosures in five themes                                        |
| Localization       | Image-state labels and Home cover categories remain Indonesian                                                | ID/EN/ZH image-state copy and shared translated literature-category helper                                                                                          |
| Offline typography | Browser cache previously included code/CSS/WASM only                                                          | Include four WOFF2 faces in the hashed build manifest, verify bytes before shell activation, and verify identical assets in native packaging                        |

## Coverage and evidence

The visual inventory covers Home, Bible, hymn catalog, hymn reader, Faith,
Literature, Sauh, Suara, More, hymn settings and playlist at 390px and 1440px.
A further 50 captures cover Home/Bible/Faith/Literature/expanded Appearance
across light, dark, sepia, AMOLED and system-dark at both widths. These local
captures are inspected with external requests blocked, so missing previews are
reviewed rather than hidden. The checked-in before/after samples below expose
that condition explicitly.

The existing 90-case matrix covers 320/390/768/1024/1440/1920px, three locales,
five themes, 200% text, navigation targets, focus and reduced motion. Existing
browser suites exercise reader dialogs, notes/search/pickers, split mode,
PDF controls, media/playlist, offline data, unknown routes and recovery states.
New runtime regressions additionally cover five-theme reading accessibility,
all seven settings disclosures, custom-accent contrast, first reading actions,
column width, unavailable-reflection desktop breakpoints, non-moving rows,
localized keyboard references, and a real offline
reload into Chinese after installing all verified fonts. The visual suites
exercise 57 cases; all 54 changed PNG baselines were inspected. The local
editorial/visual run passes 77/77 without retries, including medium-gray and
yellow custom-accent contrast. Fourteen failures from the full audit pass after
correcting obsolete font/copy/card contracts, a genuine unavailable-reflection
breakpoint override, and external-fixture transport. Browser cases now reuse
real SHA-256-verified chord/master-PDF fixtures across contexts; the image
fixture covers both direct and proxied publisher URLs. The standalone
unavailable-reflection check passes at 960/1024/1199/1200/1440px.

The first redesigned-tree CI runs 472 browser cases: 467 pass, three are
explicit provider/environment skips, and two strict Kidung PNGs expose renderer
text rasterization differences (one and 207 pixels). Both retry results are
identical. The CI actual/expected/diff images were compared: layout and controls
are unchanged. These two baselines now come from the hosted Linux renderer,
retaining the exact existing thresholds. Other screenshots keep their reviewed
baselines; local three-worker reproduction passes six repeated cases against
the original local baselines. Final CI consumes the canonical CI images.

Font sources, licenses, original SHA-256 values, generated hashes and exact
regeneration tools are recorded in
[the font ownership guide](../../apps/web/src/assets/fonts/README.md).
The four fonts total 726,188 bytes. UI/Latin reading faces load when used; italic
and Chinese glyph faces load on demand. Offline shell installation also prepares
all four. This is an explicit packaging/cache cost, not a claim of zero-byte
instant startup. Initial JavaScript is 177.3 KiB gzip inside the existing 180 KiB budget.
Local pre-push passes formatting, documentation/provenance, workspace types,
360 web units, 51 BFF units, other package units, policy and 46 script checks.
The packaged asset boundary verifies 22 files / 32,607,926 bytes.

## Before and after

| Surface           | Before                                                          | After                                                          |
| ----------------- | --------------------------------------------------------------- | -------------------------------------------------------------- |
| Home, desktop     | [Capture](../ui/2026-10-01-editorial/home-1440-before.png)      | [Capture](../ui/2026-10-01-editorial/home-1440-after.png)      |
| Bible, desktop    | [Capture](../ui/2026-10-01-editorial/bible-1440-before.png)     | [Capture](../ui/2026-10-01-editorial/bible-1440-after.png)     |
| Faith, phone      | [Capture](../ui/2026-10-01-editorial/faith-390-before.png)      | [Capture](../ui/2026-10-01-editorial/faith-390-after.png)      |
| Literature, phone | [Capture](../ui/2026-10-01-editorial/literature-390-before.png) | [Capture](../ui/2026-10-01-editorial/literature-390-after.png) |

[The hymn index](../ui/2026-10-01-editorial/hymns-1440-after.png) shows the
visible title, aligned number/title rows and retained collection controls.

## Post-redesign browser measurement

[Raw 120-sample receipt](../performance/2026-10-01-editorial-browser-roadmap.json)
records four conditions × 30 samples against the emitted production shell.
The measurements are navigation-relative rendered-frame marks; browser launch,
cold OS caches, provider traffic and physical audio are excluded. Preparation
is excluded only from the prepared/warm cases, as recorded by the benchmark.

| Condition                     | Shell median / p95 | Home p95 | Catalog p95 | Chapter p95 | Indexed search p95 | PDF first page p95 |
| ----------------------------- | ------------------ | -------- | ----------- | ----------- | ------------------ | ------------------ |
| Fresh browser/process/profile | 207.5 / 312.4 ms   | 531.9 ms | 770.0 ms    | 935.3 ms    | 47.5 ms            | 1013.7 ms          |
| Fresh context, same browser   | 193.9 / 334.8 ms   | 628.9 ms | 636.6 ms    | 998.1 ms    | 38.5 ms            | 1098.1 ms          |
| Warm profile                  | 162.1 / 359.4 ms   | 574.0 ms | 664.3 ms    | 824.0 ms    | 45.0 ms            | 1010.2 ms          |
| Prepared offline profile      | 157.0 / 293.7 ms   | 520.7 ms | 659.5 ms    | 1023.6 ms   | 41.8 ms            | 1041.6 ms          |

Compared with the preceding run, warm chapter/PDF p95 decreases from
869.5/1115.1 ms to 824.0/1010.2 ms; warm shell/catalog p95 increases from
326.9/600.9 ms to 359.4/664.3 ms. These are separate executor runs, not a
controlled causal font experiment. Local content and PDF still exceed some
proposed reference-device targets; the budget is unchanged and complete
instant-content acceptance is not claimed. Renderer heap and parse/clone
samples remain in the receipt rather than being mistaken for native memory.

## Native startup and remaining gates

The preceding native fix separates browser PWA workers from packaged assets
and retires the app's legacy workers during main-window page load. Windows
[run 36818004484](https://github.com/gyspnk/GYSApp-Tauri/actions/runs/36818004484)
passes startup/storage/media/assets, 30 process relaunches and the original full
media soak. [Raw native receipts](../performance/2026-10-01-packaged-native-validation.json)
include runner memory, local content and exact exclusions. Median process shell
is 785.8ms; p95 is 2905.5ms. Indexed search p95 is 30.9ms, catalog 533.6ms,
chapter 772.4ms and PDF first page 1089.5ms. These measurements precede the UI
redesign. The redesigned application also passes Windows
[run 36825985931](https://github.com/gyspnk/GYSApp-Tauri/actions/runs/36825985931):
four font assets are verified and all four faces load, short startup/storage/media
suites pass, 30 actual process relaunches pass, and the full media soak passes.
[Redesigned native receipts](../performance/2026-10-01-editorial-packaged-native-validation.json)
identify application commit `25f17fb` and emitted shell `7ac2f5f76b0d6e04`.
The closing commit only reconciles reviewed test images and evidence documents;
its application sources/assets are unchanged. Final canonical-image CI remains
a required PR #9 check.

A hosted Windows runner is not a physical-device or cold-OS benchmark. Signed
upgrades, physical audio first sample, device media panels/file pickers and
configured-BFF/native Faith PDF progress remain separate gates. External cover
availability depends on the publisher/network; the audit improves truthful
fallback behavior without fabricating publisher artwork. User content outside
the bundled Chinese UI subset uses available system glyph fonts.

## Persistent media and reading continuation

The shared MIDI/Bible session now starts in the sidebar on a fresh profile and
expands to a persistent bottom dock. A measured 320ms Web Animation moves the
same surface between positions; reduced motion skips it. Collapsed rails and
fullscreen scores keep play/expand controls available, while phones keep the
dock above navigation. Saved expanded/minimized preferences still apply. The
old drag position, pointer/keyboard dragging, and forced centered CSS are removed.

The Kidung list now offers a 44px PDF/text toggle, defaults to PDF, and sends the
selected mode in song URLs. PDF exit returns directly to the list; neighboring
songs retain the mode. Successful catalog snapshots remain in memory across
list/reader navigation, with installed collections refreshed in the background.
Core content no longer waits for that hydration. Faith displays all ten complete
statements inline, with official explanatory PDFs and personal notes available.

Validation of this continuation:

- Production build, workspace typecheck, formatting, documentation, generated
  provenance and all unit/policy/script suites pass, including 363 web units.
- The complete nonvisual browser run has 427 passes and three existing
  environment skips. Seven cases initially retained old player/navigation
  expectations or overlapped a rebuild; all seven pass on the final tree after
  correction. The final 15 media/reading guards also pass, including MIDI
  controls, persisted pauses, reduced motion, collapsed rail geometry, PDF
  neighbor navigation, direct return to the list, and complete Faith text.
- The 52-case visual baseline run has 50 passes. The two strict text-control
  baselines retain their original images and thresholds: this executor differs
  by 1 pixel (desktop More) and 207 pixels (phone settings). A clean worktree at
  the original PR head `b7414c7` reproduces both failures, and its actual PNGs
  have identical SHA-256 hashes to the final tree's actual PNGs. The ten
  intentionally changed list/Faith baselines were reviewed and updated.
- Initial JavaScript remains 177.2 KiB against the 180 KiB limit. Packaged assets
  still verify 22 files / 32,607,926 bytes; no runtime dependency was added.
- Native smoke fixtures explicitly request expanded transport controls and use
  an explicit text route when restoring typography. Windows execution and
  physical-device loading/audio measurements are not repeated locally. The
  earlier native receipt above belongs to the original PR head.

## Compact GYS blue UI revision

This continuation supersedes the warm default appearance above. The requested
UI now uses GYS blue (`#0079a8`) with neutral white/blue surfaces, and keeps
optional themes and explicit custom accents. The change includes composition,
not only palette replacement:

- Reduce the desktop sidebar from 256px to 208px, retain the 80px collapsed
  rail, and show icons with short destination labels without descriptions.
- Replace the home entry cards with three compact direct actions. Remove
  duplicate first-visit buttons from reading history. Place the daily reading
  first, use one readable column below 1200px, and follow it with full-width
  shelves. Reduce oversized headings and surrounding card/button spacing.
- Simplify catalog hierarchy and shared control silhouettes. Keep visible
  labels where they help discovery and accessible names on icon controls.
  Remove the visible literature introduction while retaining accessible copy.
- Render each Faith statement as a complete, always-open paragraph, separate
  from PDF and Notes buttons. Keep all ten actual bundled statements in the
  page without truncation, including the final sentence of statement 1.
- Preserve persistent MIDI/Bible playback, dock transitions, reduced motion,
  existing PDF controls and user reading preferences. No runtime dependency
  or external font request was introduced.

Validation: production build, workspace typecheck and workspace/script tests
pass, including 363 web unit tests. Initial JavaScript remains 177.2 KiB against
the unchanged 180 KiB gate. Generated provenance, documentation and native
assets verify. The broad affected browser run passes 137 cases; its sole old
sidebar-width expectation is revised to the new 208px composition and covered
by the final focused rechecks. The 40 focused scenarios are verified after
moving the local-serif assertion from the catalog to an actual reading page;
fonts now load only when a surface needs them. One final 320px text-route check
needed a retry while visual captures ran concurrently; a separate six-case
PDF/full-belief run then passes with retries disabled. Accessibility checks
include all five themes.
The 57-case visual suite is regenerated for the intentional GYS blue design
with unchanged thresholds; 42 changed images were visually reviewed. The two
previous strict text-control images now also require updates because their
panel colors intentionally change to the blue default. Earlier comparisons in
this document remain historical evidence for the preceding warm version.
Native Windows execution on this revision remains delegated to hosted CI;
instant loading or physical-device audio timing is not claimed.
