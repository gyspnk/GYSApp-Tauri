# GYSApp · Suara

Open **index.html** directly in a modern browser. It is self-contained: no dependencies, network requests, external assets, or font downloads.

## Scope and frames

One text-list page is presented in two embedded viewports: **1440 × 900** and **390 × 844**. The desktop viewport scales to fit the presentation board without changing its internal layout dimensions. The phone viewport stays at 390 × 844, except on narrower host windows where it fits the available width. Each frame scrolls independently. Board labels and the content disclaimer sit outside the product.

The supplied project did not contain `apps/web/src/online-content.tsx` or published content. This is a new design based on the supplied shipped-surface description, not a verified source-code reproduction. Six explicitly labeled layout fixtures demonstrate card rhythm. Bracketed titles, excerpts, dates, and the `— hasil` count are placeholders, not product records. No audio files, durations, playback states, authors, real publication dates, or article bodies were invented.

## Design decisions

- Calm, text-first hierarchy: category eyebrow, serif title, system-font excerpt, subdued date, and a distinct **Baca** link. Georgia is a local system serif; body copy uses the operating system font stack.
- The supplied brand palette is the light-theme baseline. Alternate theme colors are design assumptions, not user-confirmed existing GYSApp tokens. Warm grounds appear only in sepia.
- Restrained full-width separators replace heavy card frames. Cards use normal document flow and equal grid tracks. No artwork, audio controls, decorative illustrations, or additional product navigation.
- Spacing uses an 8 px rhythm. The phone has 24 px content gutters; desktop uses a centered 1248 px container with 32 px gutters.
- One column below 768 px, two from 768 to 1200 px, three above 1200 px. Filters wrap into a vertical sequence on phone; the sort control remains visible.
- One h1, **Suara**, in each independent page/frame. The board itself has no h1. Product copy is Indonesian; design-board notes are English.
- Category chips are pills with `aria-pressed`. Selection adds a checkmark, weight, border, and tint, so color is not the only cue. Interactive targets are at least 44 px; primary controls are 48 px tall. Keyboard focus uses a 3 px brand outline, offset by 3 px.
- Titles clamp to two lines and excerpts to three; **Baca** exposes their complete placeholder text in the reader. Date and action labels do not truncate. Body text is 16 px with comfortable line height.
- Motion is off for everyone: no animated skeletons, transitions, entrance effects, or smooth scrolling. Reduced-motion preferences are also explicitly respected.

## Interaction and content boundaries

Search matches the labeled fixture titles, excerpts, and categories. Chips filter these fixtures. A search with no match displays an explicit empty state; **Hapus filter** clears search and restores Semua.

The sort select retains Terbaru/Terlama. It deliberately does not reorder placeholders: no publication dates were supplied, so implementing chronological ordering would require real post data.

**Baca** opens a reader within the same frame, preserving filters and scroll position on return. The reader shows the full fixture text and explains that the original article is unavailable. It is not connected to a real GYSApp post route.

The retry action shows a static loading skeleton, then restores the fixture list when the browser reports online, or keeps the offline message when it reports offline. This demonstrates state transitions without making a content request; it is not a backend connectivity test. The initial loading state remains visible until reloaded with a different state parameter.

## Themes and states

Append these parameters to the file URL, or to the URL when served locally:

- `?theme=light`, `?theme=dark`, `?theme=sepia`, `?theme=amoled`
- `?state=list`, `?state=loading`, `?state=empty`, `?state=offline`
- Combine them, for example: `?theme=dark&state=offline`

Each theme is applied using `html[data-theme]` in both frames and the board. There are no extra theme or demo-state controls inside the product surface.

| Token | Light | Dark | Sepia | AMOLED |
| --- | --- | --- | --- | --- |
| `--brand` | `#00719c` | `#75cbed` | `#785028` | `#75cbed` |
| `--ink` | `#132018` | `#e6eee9` | `#33291f` | `#edf3ef` |
| `--surface` | `#ffffff` | `#17211e` | `#fff8e9` | `#000000` |
| `--line` | `#dce5ee` | `#364840` | `#d8cbb5` | `#303c36` |
| `--muted` | `#52616b` | `#acbcb4` | `#6d5c47` | `#b0beb6` |
| `--ground` | `#f5f8fa` | `#101815` | `#f2e8d4` | `#000000` |
| `--tint` | `#eaf4f8` | `#203b45` | `#eaddc4` | `#102b34` |

Shared product tokens: `--space: 8px`, `--body: 16px`, `--small: 14px`, `--title: 28px` (26 px phone), `--display: 64px` (48 px phone), `--radius: 8px`, `--pill: 999px`, `--target: 48px`, `--focus: 3px`, `--motion: 0s`. The pill radius expresses shape rather than spacing. One-pixel separators and the requested three-pixel focus ring are deliberate exceptions to the spacing rhythm.

Body and supporting text use the ink/muted tokens; line is a subtle separator, not a text color. Search and select boundaries use muted for stronger control contrast. Dark and AMOLED have their own explicit foreground, background, and accent colors rather than an automatic inversion.

## Editing and remaining integration

The shared frame source is embedded in the `app` text block in index.html and mounted into two same-origin `srcdoc` frames. Edit that block once to change both views. Product tokens are centralized in its style block; the board has a separate matching palette.

To connect this design to the shipped app, replace the `samples` layout fixtures with actual post data, derive the count, apply date sorting, and connect Baca to the real in-app reader. Keep the existing loading/empty/offline visibility contract. Published content and the existing application source remain the missing inputs.

No browser preview, screenshots, or post-write validation were performed as part of this delivery.
