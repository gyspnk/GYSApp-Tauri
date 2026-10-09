# Mobile scroll boundaries and Kidung controls

Android WebView now uses `View.OVER_SCROLL_NEVER`, disabling native edge stretch.
The document and body use `overscroll-behavior: none`; ordinary scrolling and
reader zoom/pan handlers remain intact. Kotlin ARM64 release compilation and the
Android generated-shell installation check pass. Physical-device overscroll
acceptance remains separate from desktop browser checks.

At widths up to 1100px the Kidung catalog toolbar uses three equal navigation
tracks, an intrinsic-width category selector and a 44px mode button at the end.
Labels appear only when the navigation container has room for them, including
when system text is enlarged. Legacy desktop grid placement and the selector
minimum width are reset inside this field. The responsive layer loads after
shared theme rules so its widths are retained.
Playlist counts sit inside their button rather than widening its column.

Browser regressions cover 320–1100px across phone and tablet breakpoints, 1.5× root text size, queue
counts, category changes, touch targets, overflow and top/bottom scroll clamping.
