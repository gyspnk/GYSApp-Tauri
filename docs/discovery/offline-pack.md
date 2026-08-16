# Fresh-install offline pack

The initial web pack includes:

- TB SQLite database derived from `ThenGB/GYSAPP-Fork@4f0d39b`;
- a browser TB reader/search projection (66 books, 31,172 verses) generated
  from that SQLite database;
- 533 hymn metadata/lyrics entries derived from
  `gyspnk/gyschordweb@a3d1ea7`;
- ten faith topics in id/en/zh derived from the functional source;
- TimGM6mb soundfont derived from `gyspnk/gyschordweb@a3d1ea7`.

The generated [`pack-manifest.json`](../../apps/web/public/offline/pack-manifest.json)
records byte size and SHA-256 for the binary pack. PDFs, MIDI, chord documents,
and GeneralUser remain on-demand or pin-only. The pack is intentionally kept
separate from the source repositories and is refreshed only by reviewed
generation scripts.
