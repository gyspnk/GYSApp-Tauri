# Repeatable performance baseline

The release baseline is run by a fixture script on the same browser, soundfont,
throttle, and host for canonical and rewrite implementations. Each scenario has
cold and warm runs and reports median/p95 for viewer-ready, first position,
seek, CPU, and heap. The relative gate is p50 no slower than canonical and p95,
CPU, and memory no worse than 10% without an approved ADR.

The first discovery numbers are provisional: viewer-ready ~2.15 s, first
position ~1.14 s, seek ~0.42 s, heap ~167 MB, and GeneralUser ~29.2 MB. They
must be repeated before a parity or GA claim.
