# Fresh-install offline pack

The initial web pack includes:

- TB SQLite database derived from `ThenGB/GYSAPP-Fork@4f0d39b`;
- a browser TB reader/search projection (66 books, 31,172 verses) generated
  from that SQLite database;
- the 533-entry KR/core hymn catalog derived from
  `gyspnk/gyschordweb@e8e7efe1189b5746a2bb542348e221844091c8d1`, including the
  six A/B variants and 161 source-locked chord references;
- the complete 1,229-entry PDF/MIDI/chord/SoundFont integrity lock for
  on-demand, hash-checked retrieval;
- ten faith topics in id/en/zh derived from the functional source.

The generated [`pack-manifest.json`](../../apps/web/public/offline/pack-manifest.json)
records byte size and SHA-256 for the pack metadata and data. One canonical
PDF is seeded locally; the remaining PDFs, MIDI/chord binaries, and both
SoundFonts stay outside the initial binary pack. The pack is intentionally
kept separate from the source repositories and is refreshed only by reviewed
generation scripts.
