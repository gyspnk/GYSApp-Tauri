# Repeatable performance baseline

Current guidance, reviewed 2026-10-07. The latest local production build records
**178.5 KiB initial JavaScript gzip**, including `startup.js`, below the unchanged
180 KiB gate. This is a build-size result, not a deployed latency measurement.

The application improves first usable paint through saved-theme bootstrap,
verified cached snapshots, route-intent/idle warming, metadata-before-lyrics,
lazy Bible search/PDF/synthesis, and incremental chord sync. Text-only entry
keeps optional audio/PDF work dormant. Setting-aware PCM cache checks avoid
buffer copies; shared PDF leases avoid duplicate loading.

## Reproducible measurements

Use the same browser/runtime, immutable song/document, SoundFont, host/network
throttle and hardware for canonical versus rewrite comparisons. Record cold and
warm samples and median/p95 for usable viewer, first audible sample, seek, CPU
and memory. Use 30 samples/one worker for dedicated performance profiling;
ordinary navigation smoke uses five. A synthetic/local fixture cannot stand in
for an actual publisher or device first-audio result.

The relative release requirement remains p50 no slower than canonical, with
p95/CPU/memory no worse than 10% absent an approved architectural decision.
Historical initial observations (~2.15 s viewer, ~1.14 s position, ~0.42 s seek,
~167 MB heap) are provisional discovery data and must be rerun before a parity
claim. The local 8 s shell sanity threshold and duplicate-module assertion are
independent of this canonical comparison.

Commands: `pnpm test:performance`, `pnpm test:performance:browser-roadmap`,
`pnpm test:performance:native`, `pnpm verify:bundle`. Dated JSON reports in
`docs/performance/` keep their measured revision/runtime. The
[October audit](loading-cache-audit-2026-10.md) records individual cache/navigation
probes; [release readiness](../release-readiness.md) names remaining platform gates.
