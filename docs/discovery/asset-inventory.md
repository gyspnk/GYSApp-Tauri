# Asset inventory

As of 2026-09-26, the immutable canonical source
`gyspnk/gyschordweb@e8e7efe1189b5746a2bb542348e221844091c8d1` contains 533 PDFs
(~7.22 MiB), 533 MIDI files (~4.19 MiB), 161 chord files (255.4 KiB), and two
SoundFonts (~36.54 MiB total). Original GYS logo assets are available at
`docs/assets/logo/tjc_logo_indonesia_{color,black,white}.png` in the source
checkout and are copied only through an explicit, provenance-preserving asset
sync step.

The fresh-install pack includes TB Bible data plus its browser reader index,
the 533-entry KR/core lyrics catalog, the full hash-locked music inventory,
and ten faith topics. One canonical PDF is seeded locally; the remaining PDFs,
all MIDI/chord binaries, and both SoundFonts are downloaded or installed on
demand. GeneralUser is installed through Asset Management. The web MIDI path
vendors only the small js-synthesizer runtime plus FluidSynth glue under
`apps/web/public/vendor/js-synthesizer/`; the worker is lazy until the first
play gesture, and the corresponding MIT/FluidSynth license texts ship beside
the files. This keeps the initial JavaScript chunk small while making the
playback engine same-origin; playback becomes available after its SoundFont is
installed.
