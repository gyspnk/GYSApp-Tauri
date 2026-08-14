# Fresh-install offline pack

The initial web pack includes:

- TB SQLite database derived from `ThenGB/GYSAPP-Fork@4f0d39b`;
- 533 hymn metadata/lyrics entries derived from
  `gyspnk/gyschordweb@cbc7d386`;
- TimGM6mb soundfont derived from `gyspnk/gyschordweb@cbc7d386`.

The generated [`pack-manifest.json`](../../apps/web/public/offline/pack-manifest.json)
records byte size and SHA-256 for the binary pack. PDFs, MIDI, chord documents,
and GeneralUser remain on-demand or pin-only. The pack is intentionally kept
separate from the source repositories and is refreshed only by reviewed
generation scripts.
