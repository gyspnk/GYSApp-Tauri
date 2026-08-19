# Asset inventory

The canonical source currently contains 533 PDFs (~7.22 MB), 533 MIDI files
(~4.19 MB), 144 chord files (~0.22 MB), TimGM (~5.72 MB), and GeneralUser
(~30.82 MB). Original GYS logo assets are available at
`docs/assets/logo/tjc_logo_indonesia_{color,black,white}.png` in the source
checkout and are copied only through an explicit, provenance-preserving asset
sync step.

The fresh-install pack includes TB Bible data plus its browser reader index,
the KR/core hymn catalog, and ten faith topics. Optional hymn catalogs, PDFs,
MIDI, chord files, TimGM, and GeneralUser are not part of initial packing.
GeneralUser is installed through Asset Management. The web MIDI path vendors only the
small js-synthesizer runtime plus FluidSynth glue under
`apps/web/public/vendor/js-synthesizer/`; the worker is lazy until the first
play gesture, and the corresponding MIT/FluidSynth license texts ship beside
the files. This keeps the initial JavaScript chunk small while making the
playback engine same-origin; playback becomes available after its SoundFont is
installed.
