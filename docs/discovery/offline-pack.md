# Fresh-install offline pack

The initial web pack includes:

- TB SQLite database derived from `ThenGB/GYSAPP-Fork@4f0d39b`;
- a browser TB reader/search projection (66 books, 31,172 verses) generated
  from that SQLite database;
- the KR/core hymn catalog derived from `gyspnk/gyschordweb@a3d1ea7`;
- ten faith topics in id/en/zh derived from the functional source.

The generated [`pack-manifest.json`](../../apps/web/public/offline/pack-manifest.json)
records byte size and SHA-256 for the binary pack. Optional hymn catalogs,
PDFs, MIDI, chord documents, TimGM, and GeneralUser stay outside initial
packing. The pack is intentionally kept
separate from the source repositories and is refreshed only by reviewed
generation scripts.
