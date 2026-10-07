# Asset inventory

Reviewed 2026-10-07 against generated locks, not a fresh upstream checkout.
Canonical source: `gyspnk/gyschordweb@e8e7efe1189b5746a2bb542348e221844091c8d1`.

| Locked kind        | Count |      Bytes |
| ------------------ | ----: | ---------: |
| PDF scores         |   533 |  7,569,676 |
| MIDI               |   533 |  4,394,730 |
| Chord documents    |   161 |    245,406 |
| SoundFonts         |     2 | 38,313,680 |
| All locked entries | 1,229 | 50,523,492 |

TimGM6mb is 5,994,284 bytes and is packaged at
`apps/web/public/assets/soundfont/TimGM6mb.sf2`. GeneralUser-GS is 32,319,396 bytes
and remains an optional verified asset-manager installation. Default playback
uses packaged TimGM with the local worker/FluidSynth runtime. The fresh pack
seeds one canonical PDF; the remaining canonical scores/MIDI/chord payloads
are requested/cached separately from compact metadata.

The independent Fork source is `ThenGB/GYSAPP-Fork@4f0d39b`.
`fork-hymnal-manifest.json` identifies its 649-page KR master, 4,770,376 bytes,
SHA-256 `5ea1d857cac8a8d52600052ef3a7b22214919ffaefe4f0f97c71d6f57f5f8805`.
Fork page ranges and canonical individual-score identities must not be mixed.

Other packaged assets include the TB SQLite/31,172-verse projection, hymn
metadata/full lyrics, distributed catalog, ID/EN/ZH ten-belief text, Sauh/Suara
snapshots, the 300-item literature snapshot, church logo/mark, local fonts,
startup bootstrap and audio worker/glue. The ten official Indonesian Faith PDFs
are local on-demand files with source/size/SHA entries in
`assets/faith/manifest.json`; they are excluded from startup precache.

## Provenance and licenses

Generated music/pack manifests record immutable source, size and SHA-256.
Publisher content remains attributed to Gereja Yesus Sejati / TJC. Font license
notices live beside the bundled fonts. TimGM and FluidSynth retain their
bundled GPL/LGPL-related notices; js-synthesizer retains its own license.
The application's MIT license does not replace upstream asset licenses.

Logo source paths and authorized copied artwork are recorded in their existing
provenance/asset manifests. Do not fetch or modify upstream source automatically
while committing UI/docs. Use reviewed generator/sync changes and
`pnpm verify:generated`; `pnpm verify:native-assets` checks the current packaged
runtime set rather than relying on a stale hard-coded asset count.
