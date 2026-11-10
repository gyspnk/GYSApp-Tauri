# GYSApp design specification

## Direction
Warm ivory and forest green frame a quiet editorial reading experience. Georgia and system sans provide local, network-free typography. Hairline borders and generous spacing separate shelves and reading surfaces.

## Structure
Five primary destinations: Beranda, Kidung, Alkitab, Iman, and Lainnya. Literatur and Suara live under Beranda and Lainnya. Desktop uses a catalogue/reader split; narrow screens stack the reader beneath the list. The player remains separate from navigation.

## Themes and interaction
Ivory, sepia, dark, and high contrast use semantic background, surface, text, border, and accent tokens. Theme and notes persist locally. Native dialogs support Escape and focus handling. Controls expose labels, visible focus, and 44px minimum height. Reduced motion is respected. Layout reflows at 768px and uses fluid sizing.

## Production handoff
This is a standalone design prototype, not the production React implementation. Catalogue entries, media, PDFs, account, search, and Bible content require real data integrations. The state controls demonstrate loading, empty, error, and offline copy; they do not simulate network behavior. Validate contrast, keyboard navigation, 200% zoom, and widths 320/390/768/1440 in the production app and CI.

