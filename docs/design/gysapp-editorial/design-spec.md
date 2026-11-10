# GYSApp editorial prototype — design specification

## Scope and content
This standalone prototype proposes a warm ivory / forest green editorial treatment. All invented titles, lyrics, publication text, covers, offline states and document pages are labeled SAMPLE; they are not production content. Cover treatments are typographic specimens, not representations of actual publications. Audio playback and PDF rendering require production integrations.

## Navigation and route mapping
| Prototype surface | Production route | Production selector / component |
|---|---|---|
| Beranda / Sauh | `/`, `/sauh` | `HomePage`; `SauhPage`, `.page.online-content-page.sauh-page` |
| Kidung catalogue / reader | `/kidung`, `/kidung/:songId` | `KidungPage`; `hymnCollectionLabel` in `kidung-shared.ts` (`rohani` → `KR`, installed pack codes preserved) |
| Alkitab | `/bible` (`/alkitab` redirects) | `BiblePage` |
| Iman / PDF | `/iman` | `FaithPage` |
| Literatur / reader | `/literatur`, `/literatur/:itemId`, `/literatur/:itemId/read` | `LiteraturePage` and route-specific detail/reader |
| Suara Sejati / article | `/suara`, `/suara/:postId` | `SuaraPage` `.page.online-content-page.suara-page`; detail `.page.online-content-page.suara-detail-page`; body `.online-article-body.suara-article-body` |
| Lainnya | `/lainnya` (`/more` redirects) | More page; `.sidebar-collapse-toggle`, `.sidebar-media-anchor` in app shell |

The desktop sidebar and mobile bottom navigation keep five destinations. Literature and Suara remain reachable from Beranda and Lainnya. The media dock is separate from navigation. Home features Sauh, a verse, literature access and Suara access. Kidung includes collection, category, lyrics/chords, queue and MIDI examples. Literature includes 2:3 typographic covers and a paged reader. Suara is a publication catalogue with article reader and separate speech controls. Faith includes a doctrine reading and illustrative PDF frame. Settings expose appearance, text size, density, offline packs, backup and account examples.

## Prototype color tokens
Exact values below are the prototype's semantic CSS values, not claims about production's current palette. `--bg`, `--surface`, `--fg`, `--muted`, `--border`, `--accent`, `--on` correspond approximately to production `--canvas`, `--surface`, `--ink`, `--muted`, `--line`, `--accent-fill`, `--on-accent` respectively. Production must measure each pairing before adoption.

| Theme id | bg | surface | fg | muted | border | accent | on |
|---|---|---|---|---|---|---|---|
| light | `oklch(97% .012 95)` | `oklch(99% .006 95)` | `oklch(23% .025 155)` | `oklch(38% .025 155)` | `oklch(83% .018 95)` | `oklch(34% .075 155)` | `oklch(99% .005 95)` |
| dark | `oklch(20% .015 155)` | `oklch(25% .02 155)` | `oklch(94% .012 95)` | `oklch(80% .015 95)` | `oklch(52% .025 155)` | `oklch(80% .08 145)` | `oklch(20% .015 155)` |
| sepia | `oklch(92% .035 85)` | `oklch(96% .025 85)` | `oklch(24% .035 65)` | `oklch(36% .04 65)` | `oklch(75% .035 75)` | `oklch(35% .07 65)` | `oklch(99% .005 95)` |
| amoled | `#000` | `#0a0a0a` | `#fffcf5` | `#bbb1a1` | `#555` | `#a9d5b3` | `#101810` |

Production `00-tokens.css` currently uses a blue light theme and distinct dark, sepia and AMOLED values; this proposal intentionally differs for the requested forest-green direction. Do not copy prototype values into production without contrast verification.

## Type, layout and interaction
Production's 13 type steps are 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24 and 28 px. Radius roles are 6, 8, 10, 12, 16, 24 and 999 px. Use 2 px spacing increments and multiples of 4 above 24 px. Reading uses serif; controls use system sans. Inputs and buttons target at least 44 px. Focus is visible, dialogs are native, and reduced-motion preference is respected. Reflow is intended for 320, 390, 768 and 1440 px and 200% zoom.

## Handoff and limitations
The prototype illustrates loaded, loading, empty, error and offline states; it does not replace production behavior. Catalogue, search, PDF, MIDI, account, backup, offline downloads and content require real integrations. Theme and notes persist locally. Browser, assistive technology, viewport, contrast and zoom checks were not run; verify each in the production CI and accessibility review before implementation.

