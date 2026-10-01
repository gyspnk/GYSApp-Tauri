# Roadmap validation — 2026-10-01

This continues PR #9 against `gyspnk/gyschordweb` at
`e8e7efe1189b5746a2bb542348e221844091c8d1`. Measurements describe the stated
runtime and condition; the reference-device targets remain release gates.

## Implementation coverage

| Roadmap area                | Implemented and available verification                                                                                                                                                                                                              | Remaining acceptance                                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Startup and content latency | Rendered-frame shell, greeting, catalog, Bible chapter/search and PDF markers; four 30-sample browser conditions; 30 packaged Windows process relaunches and process-tree memory in native CI                                                       | Cold OS/filesystem cache, reference hardware, first signed installation, physical audio first sample                       |
| Module boundaries           | Shell route frames; separate catalog/playlist/settings and MIDI progress; Bible chapter/text, search panel, notes popup and legacy persistence; memoized note lookup                                                                                | Further extraction follows measured coupling or rendering cost                                                             |
| Data loading                | 533-song metadata projection, shared retryable parsed core payloads, deferred lyric corpus, lazy Bible worker/index/clone; installed catalogs reread on asset changes with generation guards                                                        | Per-book/chapter packs require evidence of a win over the measured current format                                          |
| CSS and UI                  | Six ordered base layers with ownership notes; existing cascade preserved; 90 independent width/locale/theme cases with 200% text, 44px primary navigation, focus and reduced motion; runtime accent and PDF touch contracts                         | Physical touch and assistive-technology acceptance; historical cross-layer selectors remain documented                     |
| Audio and observers         | Reader position ticks isolated in transport; stable external-store selector; PDF observer/listeners/HUD timers scoped to component lifetime                                                                                                         | Hardware first-sample latency and OS media panel                                                                           |
| Offline updates             | Explicit activation, reader/editor/audio protection, previous active build registry, release hash namespaces, exact emitted code and core integrity, interrupted/mixed deployment rejection, owned HTML retention, bounded verified local PDF reuse | Signed in-place installation/upgrade; storage eviction never implies guaranteed recovery without network or packaged bytes |
| Native efficiency           | Short startup/storage/media/assets command separate from full soak/live Edge; 30 SQLite/IPC and 30 one-MiB atomic blob roundtrips with malformed-write rejection                                                                                    | Connection pooling or binary IPC changes require measured bottleneck/win; boundaries remain unchanged                      |
| Upstream parity             | Immutable source-byte audit of 533 entries, ordering/variants/verses/MIDI/PDF paths, 161 chord references and metadata; existing search/defaults/transport/playlist differential and packaged soak retained                                         | Native file picker, physical device and Windows media panel; signed upgrade                                                |
| Live sources                | Official Literature live parser returned 300 items, all IDs already bundled; official Faith PDF returned valid HTTP 206 bytes                                                                                                                       | PDF publisher omits CORS; configured/deployed BFF, native PDF progress and protected authentication remain separate gates  |
| Verification speed          | Conservative full browser selection for unknown shared changes; extracted-module migration/loading/offline coverage; affected accent, flat-row and PDF navigation source assertions replaced with browser checks                                    | Structural import-ownership checks remain explicit                                                                         |

## Local receipts

- Source-byte parity audit: 533 songs and 161 chord references match the pinned
  upstream. The source lyric file SHA-256 is
  `1b97233984e61db36d003800b4011f6a6fc1afee9ad5f08b268cc7c66173a670`.
- Metadata: 179,002 bytes / 24,376 gzip bytes versus full lyrics catalog
  917,610 bytes / 138,299 gzip bytes. This reduces the initial catalog JSON
  by 80.5% raw and 82.4% compressed; lyrics stay available through deferred search.
- Packaged startup uses the standard `index.html` document URL, normalized
  to the Home route. Native
  benchmark readiness failures log the URL, DOM state and observed markers;
  process-start samples never substitute a test-triggered navigation.
- Security follow-up: BFF Hono is pinned to 4.13.11 after
  GHSA-hxh3-vqpv-xpqv appeared during final CI. BFF typecheck and 51 tests
  pass; the production audit reports no known vulnerabilities.
- Initial JavaScript graph: 177.2 KiB gzip, within the unchanged 180 KiB budget.
- The 90-case UI matrix passes locally without retries. Widths are
  320/390/768/1024/1440/1920, locales ID/EN/ZH, themes light/dark/system/AMOLED/sepia.
  Route coverage is pairwise, not the full route × width × locale × theme product.
- Loading/update checks include metadata-before-lyrics, chapter-before-worker,
  delayed music-lock PDF fallback, unvisited offline sections, verified local PDF
  offline reload, and explicit update protection. Eight computed-style/touch
  cases cover accent, flat hover geometry and PDF lifecycle in ID/EN/ZH.
- Service-worker checks cover 19 contracts, including prepared-byte corruption,
  partial core payloads, interrupted downloads, mixed deployments, previous active
  cache retention and avoiding new HTML writes into the old offline shell.
- Live source receipts are in `2026-10-01-live-source-probes.json`. Source/parser
  success does not imply deployed BFF or authenticated-provider success.

Final commit CI and packaged-native outcomes are recorded on PR #9. The native
workflow uploads raw 30-sample metrics, retains the complete playback soak and
reports provider/device skips explicitly. No baseline or performance budget is
relaxed to make the refactor pass.

## Repeatable commands

```sh
pnpm verify:prepush
pnpm build
pnpm verify:bundle
pnpm verify:native-assets
pnpm verify:upstream-parity /path/to/immutable/gyschordweb
pnpm test:performance:browser-roadmap
pnpm test:native:quick
pnpm test:native:quick startup
pnpm test:native:quick storage
pnpm test:native:quick media
pnpm test:native:quick assets
pnpm test:performance:native
pnpm test:native:soak
```

Browser benchmark requires a production preview at `127.0.0.1:4173` and writes
raw JSON. Native commands require the built Windows executable and WebView2;
CI policy uses the runner default profile and labels it accurately. The quick
media suite checks reader/queue controls; synthesis and playback are owned by
the full soak. Remote providers are excluded from local-content benchmarks.

## Browser benchmark results

Raw 120-sample receipt: [2026-10-01-browser-roadmap.json](2026-10-01-browser-roadmap.json).
All times below are navigation-relative rendered frames in milliseconds on the Linux executor.
Remote providers are excluded; OS caches are not reset. Light local verification also ran on the executor during part of the collection. These are observations, not reference-device acceptance.

| Condition (30 samples each)       | Shell p95 | Greeting p95 | Catalog p95 | Chapter p95 | Indexed search p95 | Local PDF p95 |
| --------------------------------- | --------: | -----------: | ----------: | ----------: | -----------------: | ------------: |
| fresh-browser-process-and-profile |     335.4 |        581.1 |       682.5 |      1030.1 |               45.1 |        1062.3 |
| fresh-context-same-browser        |     275.6 |        634.9 |       847.8 |      1118.7 |               44.1 |        1199.5 |
| warm-same-profile                 |     326.9 |        584.4 |       600.9 |       869.5 |               45.1 |        1115.1 |
| prepared-offline-same-profile     |     325.7 |        603.8 |       633.5 |       856.3 |               45.7 |        1046.2 |

Warm shell and indexed search fall below the proposed 500/150 ms targets here.
Warm catalog/chapter/PDF exceed the proposed 500/700/1000 ms targets; those gates remain open pending reference-hardware calibration and further measured optimization. No instant-content claim is made.

### Parsing and cloning

Thirty in-page samples per payload, excluding fetch/body transfer and schema validation:

| Payload              | UTF-8 bytes | JSON parse median/p95 ms | structuredClone median/p95 ms |
| -------------------- | ----------: | -----------------------: | ----------------------------: |
| hymn-metadata.json   |     179,002 |              0.30 / 0.45 |                   0.50 / 0.75 |
| hymn-catalog.json    |     917,610 |              1.90 / 2.98 |                   1.40 / 2.89 |
| bible/tb-reader.json |   7,939,120 |            18.35 / 26.06 |                 46.40 / 79.01 |

The Bible whole-pack clone is a material synchronous cost; it now occurs only
for requested search. These measurements do not prove that duplicating the
offline pack into chapter files improves overall storage or latency. Renderer
heap is recorded in the raw receipt; Windows process-tree memory is separate.

A 30-pair catalog render experiment with CSS content visibility had median
496.4 ms for the baseline versus 514.0 ms for the candidate, and p95 649.1
versus 599.0 ms. The median regressed and improvement was not consistent;
the candidate is not adopted and the reviewed catalog geometry is retained.
Raw pairs are recorded in `2026-10-01-catalog-render-prototype.json`.
