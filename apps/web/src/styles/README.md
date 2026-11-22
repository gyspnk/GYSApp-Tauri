# Stylesheet Architecture (Sanctuary Editorial)

All global styles live in one ordered 6-layer cascade imported from `../styles.css` in `main.tsx`:

1. `00-tokens.css` — `@font-face`, 5-theme semantic palette tokens (`light`, `dark`, `amoled`, `sepia`, `system`), contrast boost (`prefers-contrast: more`), radius/type/spacing/shadow/motion/z-index scales.
2. `01-foundations-and-layout.css` — reset, frosted topbar, desktop/tablet/mobile/landscape navigation shell, shared accessible 3:1 controls, account menu, welcome screen, global search, confirm dialog, loading/error/recovery states, toast, update banner, image fallbacks.
3. `02-bible-and-settings.css` — Bible reader toolbar/drawer, split-view divider, verse list/cross-refs/highlights/notes/selection bar, quick-nav overlay; More/Settings single balanced column, e-GYS login parity, appearance swatches, density/font preferences, offline packs, backup & diagnostics.
4. `03-home-and-catalogs.css` — Home bento hero, Daily Sauh card + compact offline state, continue activity, Suara Sejati shelves/library/reader, Faith 10 beliefs + modals, Literature shelves/rows/detail/reader.
5. `04-kidung-and-media.css` — Kidung catalog toolbar, content-visibility grid, playlist queue & saved playlists, settings, split reader rail, lyrics & interlinear chords, fullscreen presentation panel, PDF overlay & persistent/edge media dock.
6. `05-motion-and-print.css` — safe `translate3d`+`opacity` entrance waves, `@starting-style` menus, View Transitions, full `prefers-reduced-motion: reduce` support, landscape Bible overrides, and `@media print`.

Feature-lazy `bible-picker.css` loads only with `bible-picker.tsx`, and `startup.css` loads synchronously inside `index.html` for zero-FOUC boot splash styling.
