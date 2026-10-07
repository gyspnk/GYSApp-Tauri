# Testing and maintenance

Reviewed 2026-10-07. Use the smallest checks that cover the affected boundary;
full CI/release verification remains available. Never count mocked provider
success, a skipped deployment or an old screenshot as new production evidence.

## Verification ladder

| Work                         | Required local checks                                                                                                       |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Documentation                | Format changed prose, `pnpm verify:docs`, validate relative links and current facts against source/manifests.               |
| Pure/domain/backend behavior | Relevant Vitest/Node tests, workspace typecheck; generated/contract changes also require provenance.                        |
| Reader/player/UI behavior    | Production build, affected browser/keyboard/touch/Axe contracts and inspected screenshots.                                  |
| Loading/cache/PDF/audio      | Real immutable fixtures, warm/cold or duplicate-request assertions, cancellation/retry/offline scenarios and bundle budget. |
| Native boundary              | Rust format/check/test/clippy, packaged asset verification and available platform smoke.                                    |
| Release                      | `pnpm verify:release`, full browser/native gates and explicit protected provider/signing/device evidence.                   |

No new test is needed merely to restate reversible CSS. Behavioral tests should
prove a meaningful invariant: tap versus drag, explicit draft application,
actual transpose, source identity, stale result cancellation, one scrub commit,
last-good cache or reachable controls.

## Commands

```sh
pnpm build:test-deps
pnpm typecheck
pnpm test
pnpm build
pnpm verify:generated
pnpm verify:docs
pnpm verify:native-assets
pnpm verify:bundle
pnpm format:check
```

`pnpm test` includes contracts/domain/testkit/BFF/web units, policy and root
script regressions. `pnpm lint` is the package lint/type boundary. The initial
JS gzip budget is 180 KiB, including `startup.js`; the individual main application
chunk ceiling is 250 KiB. PDF.js/search/WASM/synth engines remain lazy/on demand.

For behavior after a verified build:

```sh
GYS_E2E_PREBUILT=1 pnpm test:e2e bible-picker-mobile.spec.ts midi-edge.spec.ts midi-player-design.spec.ts --fully-parallel --workers=2 --retries=0
GYS_E2E_PREBUILT=1 pnpm test:e2e literature-loading.spec.ts pdf-shared-viewer.spec.ts egys-v1.spec.ts --fully-parallel --workers=2 --retries=0
pnpm test:e2e:changed
```

The common Playwright server is production preview on 4173. Service workers are
blocked in ordinary UI contexts to avoid mid-test activation reloads; actual
service-worker lifecycle is verified separately. Do not build while browser
checks/captures run against hashed assets. `--fully-parallel` isolates independent
cases; use a bounded worker count when audio/PDF allocation shares a host.
Use retries for known upstream fixture transport instability, never to declare
a deterministic behavior fixed without an isolated passing result.

For quick HMR iteration:

```sh
pnpm dev:native
pnpm test:watch
pnpm test:e2e:dev smoke.spec.ts --workers=1
pnpm test:e2e:dev --ui
```

The dev wrapper builds small dependencies and starts Vite; stop production
preview first. It is rejected in CI and with the prebuilt production flag.
Resource budgets, offline artifact checks and performance use production mode.

## Regression map

| Spec / unit family                                            | Contract                                                                                                                      |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `bible-picker-mobile.spec.ts` / `bible-picker-number.test.ts` | Draft numeric replacement, second-tap dropdown, limits, explicit opening, keyboard and short screens.                         |
| `midi-edge.spec.ts`                                           | Both edges, pointer/touch drag versus restore, previous-position animation, cross-route persistence and fullscreen placement. |
| `midi-player-design.spec.ts`                                  | Instrument/key/transpose, real playback, compact sizes, reduce motion and Axe.                                                |
| `midi-scrub.spec.ts`, playback-cache/player units             | One update on release, setting-aware cache and stale render safety.                                                           |
| `kidung-player-refinement.spec.ts`                            | No binary/audio preload while text-only/MIDI off, reachable lyric/settings controls.                                          |
| `pdf-shared-viewer.spec.ts`, PDF reader/zoom/pan suites       | Maximal fit, sharp zoom, shared documents, page/hymn navigation and touch/mouse pan.                                          |
| `literature-loading.spec.ts`, source/lease units              | Trusted source discovery, large ranged PDFs, first frame, retry and offline reload.                                           |
| `egys-v1.spec.ts`, Google/Apple/BFF units                     | Direct providers, reference/sender-phone confirmation, retries/deadlines, inline GIS, SDK lifecycle and session detection.    |
| `menu-motion.spec.ts` / `use-menu-presence`                   | Exit motion, inert close state, focus, nested Escape and rapid reversal.                                                      |
| `page-transitions.spec.ts`, `reader-motion.spec.ts`           | One content transition, stable shell/player and restored scroll.                                                              |
| `ui-session-refinement.spec.ts`                               | Consistent section controls, media persistence, image/article geometry and responsive theme state.                            |
| Chord/asset/storage/SW suites                                 | Integrity, incremental sync, cold/warm reuse, failed pointer commits, reset and interrupted/mixed updates.                    |

`pinned-reader-fixtures.ts` uses immutable checked real assets; test downloads
are cached outside source. Synthetic PDFs in `pdf-fixtures.ts` cover layout or
failure contracts; do not call them real-publisher validation. Live source and
real account/device tests must name their runtime, configuration and outcome.

## CI browser and native contracts

Full CI uses three shards with three workers per shard against one verified
production build. Preserve failure traces, including cancelled jobs; diagnose
individual assertions before changing timeouts, retries or visual thresholds.
Refresh snapshots only after checking actual geometry, contrast and controls,
then rerun without snapshot updates. Immutable reader assets, frozen snapshot
clocks and blocked provider SDKs isolate visual/performance tests from upstream
availability; provider behavior remains covered by its own contracts.
Chromium disables LCD text rasterization so hosted and local glyph edges use
the same grayscale rendering.
The Bible filter screenshot permits one differing SVG edge pixel. Bundled
reading fonts include U+2212 so minus controls do not change width with the
host's fallback font; CDP checks the font actually used, not only CSS loading.

Closed animated/native disclosures can retain a box while their contents are
not interactive. Check visibility before auditing target sizes. Verse bookmark
pseudo-elements expand the hit area to 40 px; compact MIDI targets are 36 px for
mouse layouts and 40 px on phones, with 44 px utility controls. Check actual hit
testing and keyboard access, not only painted icon dimensions.

The shared native media helpers await mounted Stop controls and actual focus.
MIDI Stop opens its disclosure when needed; speech Stop does not use that menu.
Play dismisses advanced controls, so keyboard tempo edits reopen the disclosure
and tempo popover before focusing the range. The real FluidSynth cache browser
case covers Stop, replay, disclosure dismissal and the subsequent End edit.
Header language/theme selectors expose the combobox role; native preference
restore checks use their localized accessible names before and after restart.

Single-page PDF navigation changes hymns; multi-page scores expose both page
and hymn navigation. Continuous wheel zoom and computed typography do not have
the old discrete/inline-style values. Chord expectations include the PDF source
key and natural transpose. The Bible picker edits a draft and requires explicit
opening. Preload timing excludes intentional motion; motion tests separately
inspect actual keyframes or intermediate disclosure sizes. A longer test-only
native disclosure timeline allows sampling its intermediate size under load.
Chord spacing probes pause the real transition at creation and sample its
midpoint in both directions. Theme tests delay the lazy module to verify that
selection cancels pending focus scroll before loading, not after it completes.
PDF zoom caps delayed-frame steps; active-page tracking also samples after
placeholder rendering. The cold real-MIDI play assertion allows 15 seconds for
lazy WASM/PCM preparation within its existing 35-second test budget.
Shared PDF geometry checks also allow 15 seconds for initial worker/page paint;
the subsequent interaction and measured performance limits remain unchanged.
Full hosted CI distributes every browser case across three shards, each with
three workers, while retaining its 15-minute per-job limit.
Playback intent is published before AudioContext resume so simultaneous delayed
PDF tempo/transpose updates preserve playback. The speech fixture pauses its
utterance timer and resumes the remaining duration; a no-op pause would falsely
advance the queue during sidebar animation checks.

The native Stop regression accepts current-request cancellation or nonempty
completed synthesis followed by an idle reader. `edge-stop-evidence.test.mjs`
rejects stale, empty and error diagnostics; packaged Windows execution remains
necessary to prove the whole native flow.
The shared native transport helper opens MIDI's advanced disclosure before
using Stop and restores the previous disclosure afterward.
It first waits for the media surface and restores a minimized player; speech
controls never take the MIDI disclosure path. Responsive browser contracts
verify both providers stop correctly and preserve playable MIDI caches.
Render-cancellation checks expose Stop before Play so menu motion cannot consume the cancellation
window. Its browser contract checks real FluidSynth Stop, position and PCM reuse.
Disclosure inert state also updates after click default action, independently
of delayed native toggle delivery. Native range actions await actual focus
before sending a key and await the committed value afterward. The delayed-toggle
browser regression preserves keyboard focus and prevents closed-menu input.
PDF toolbar size assertions sample after button release motion settles, keeping
the 44 px requirement. Continuous PDF preload margins track half the viewer's
width/height and are refreshed on resize; offscreen bitmap limits remain strict.
Cache smoke tests wait for rendered chord markers and the completed loading
state, then verify stored bytes. Their
mutable manifest endpoint is pinned to the immutable corruption/upgrade bytes;
the previous manifest and cache state are restored afterward. Live incremental
manifest updates remain covered separately by startup/repository contracts.
Failed automatic chord refreshes back off for 60 seconds per immutable source
fingerprint. Cached legacy chords remain usable offline; explicit song retries
and changed commits/hashes/sizes bypass the cooldown. Reopening a reader after
a failed startup refresh does not issue another redundant offline request.
The native Home fixture survives document reloads through session state until
explicit cleanup. Its browser regression forces reloads before and after
recovery and verifies monotonic requests, preserved availability and cleanup.

## Hooks and delivery

`pnpm install` configures `.githooks`. Pre-commit validates formatted staged text
and relevant docs/generated metadata; it does not rewrite work or fetch upstream.
Pre-push runs formatting, documentation, generated provenance, types and all unit/
policy/script checks. It omits expensive network/native/browser rebuilds for
ordinary iteration; those remain explicit local and CI gates.

`pnpm verify:release` adds authenticated local e-GYS source checks, strict chord
audit, native checks, build/packaged assets, budget and full production browser
verification. Keep ignored upstream snapshots out of Git. CI never clones the
private e-GYS source; generated metadata is reviewed locally.

Push only after explicit user authorization. For delivery directly to `main`,
fetch/check the remote first, preserve any remote changes, use a normal
fast-forward push and verify remote SHA equality afterward. Do not claim Pages/
Worker completion from the Git push alone.

## Evidence and documentation

Current guides live in [docs/README.md](README.md). Dated audits/plans preserve
historical results; add a new dated receipt instead of rewriting old timings,
platform outcomes or source revisions. Source inventories come from generated
JSON and strict verification. Current maintenance owners belong in the codebase
map, with a validated new frontier and unchanged cadence policy unless actually
reviewed.

Use a combined ordered screenshot when reporting several layouts; screenshots
must come from the tested final build. Keep scratch scripts, full logs and image
capture intermediates outside Git. Evidence must distinguish local mocked
provider tests, live public PDFs, hosted workflows and actual signed/device runs.
