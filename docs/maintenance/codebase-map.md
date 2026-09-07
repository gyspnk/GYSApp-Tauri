# Codebase simplification map

This is the local replacement for a wayfinder root issue. It is the single
low-resolution index for the multi-session simplification effort.

## Destination

An offline-first GYSApp-Tauri codebase with smaller responsibility surfaces,
stable adapters, faster verified paths, explicit deletion evidence, and
compact agent context. Existing behavior and source-of-truth parity remain
more important than line-count reduction.

## Working rules

- One frontier decision per session.
- Resolve a decision with a test, runtime probe, or bounded audit before
  graduating the next frontier.
- Keep uncertain future work under `Not yet specified`.
- e-GYS v2 WIP is protected and remains discovery-only at runtime.

## Decisions so far

- `2026-09-07 / CF-054`: run the due maintenance-skill review and fix the
  documentation verifier's day-threshold comparison; no agent rule changes
  were needed. Canonical data and e-GYS v2 evidence are protected.

- `2026-09-07 / CF-053`: make the Kidung viewer accent token follow the main
  theme accent (`--accent` from Lainnya > Penampilan) with sacred gold as the
  fallback; chord/PDF surfaces already subscribe to the same source.
  Canonical data and shared MIDI state are protected.

- `2026-09-07 / CF-052`: restyle the committed Kidung Teks/PDF viewer toggle
  to hymnal paper/gold instead of the generic blue glow; the app shell keeps
  its own tokens. Canonical data and shared MIDI state are protected.

- `2026-09-05 / CF-051`: preserve the existing Kidung Teks/PDF navigation; use
  normal grid flow for the title, two header rows below 900px, and viewport-
  bounded reader menus. Canonical data and shared MIDI state are protected.

- `2026-09-03 / CF-001`: establish repository-local context and documentation
  guardrails before structural refactors; `App.tsx` shell composition is the
  first deepening candidate because it has strong leverage and a stable route
  seam.
- `2026-09-03 / CF-001`: isolate the route-independent navigation surface in
  `apps/web/src/app-navigation.tsx` and share Bible warming through
  `apps/web/src/bible-prefetch.ts`; keep route composition, media, and feature
  controllers in `App.tsx` until a later seam is proven.
- `2026-09-03 / CF-002`: the Edge speech path must expose actual gateway
  voices only, select by Bible language, label browser fallback honestly, and
  retain e-GYS v2 boundaries; verified in the prior speech-focused slice.
- `2026-09-03 / CF-003`: no unconfigured Edge gateway is treated as real Edge
  audio; protected `EDGE_TTS_URL` remains a deployment prerequisite.
- `2026-09-03 / CF-006`: remove only the unreferenced PDF probes, duplicate
  `scripts/serve.py`, and generated Python bytecode; retain the root localhost
  wrapper and `.codex/stabilization-*` archives pending a separate archive
  decision.
- `2026-09-03 / CF-007`: keep the 99-flow browser suite as the release gate,
  parallelize the five independent package unit suites, and make changed-file
  E2E selection skip documentation and unit-test-only edits. Four local
  workers is the measured stable setting; eight workers produced resource
  contention and two failures, so it is not the default.
- `2026-09-03 / CF-004`: move Bible local persistence and highlight parsing to
  `apps/web/src/bible-storage.ts`; preserve every existing storage key and
  keep the reader render/controller boundary in `bible.tsx` for the next
  decision.
- `2026-09-03 / CF-005`: move Kidung catalog validation, lyric parsing cache,
  deduplication, and display-neutral formatters to
  `apps/web/src/kidung-catalog.ts`; leave PDF/MIDI resources and viewer state
  in `kidung.tsx` pending a separate proof.
- `2026-09-03 / CF-008`: remove the unused `@tanstack/react-query` dependency
  and its transitively unused `@tanstack/query-core` package after a
  repository-wide import/reference audit; no runtime caller or behavior was
  removed.
- `2026-09-03 / CF-009`: keep a configured BFF as the first online-content
  candidate across localhost port boundaries, allow the actual `5173` and
  `5174` preview origins in the BFF CORS boundary, and give the BFF path a
  longer bounded wait than the direct WordPress fallback. This fixes the
  preview path without weakening the exact-origin allowlist.
- `2026-09-03 / CF-010`: keep Bible annotation transforms beside the versioned
  storage rules; notes append per verse, note deletion removes one entry, and
  highlight updates validate preset or custom colors before returning a new
  immutable state.
- `2026-09-03 / CF-011`: resolve a single verified Kidung PDF identity for the
  viewer and note-aligned chord geometry, preserving Fork, distributed, and
  canonical fallback order while leaving MIDI and viewer state in the page.
- `2026-09-03 / CF-012`: share lock-verified MIDI bytes, source hash, URL, and
  normalized parser input between foreground playback and adjacent-track
  preload through `kidung-resources.ts`; keep generation guards and
  viewer/session state in `kidung.tsx`.
- `2026-09-03 / CF-013`: remove CSS rules and grouped selector members whose
  required class tokens have no runtime source reference; retain active rules
  and the single stylesheet until a measured ownership split is proven.
- `2026-09-03 / CF-014`: subscribe the Kidung catalog directly to the durable
  MIDI playlist external store; remove its manual render tick so queue badges
  cannot remain stale after an add or restore.
- `2026-09-03 / CF-015`: make streamed distributed packages and optional
  hymnal indexes enforce the manifest's exact byte count even when an upstream
  omits `content-length`; keep the stream bounded and fail on truncation.
- `2026-09-03 / CF-016`: move Bible markup decoding, semantic verse segments,
  and query highlighting to `bible-text.tsx`; keep the reader and search
  controllers in `bible.tsx` while sharing one text-rendering seam.
- `2026-09-03 / CF-017`: make selective local E2E reuse a timestamp-validated
  production build through `scripts/ensure-e2e-build.mjs`; the complete
  `pnpm test:e2e` path always rebuilds. Replace only positive sleeps that wait
  for state with bounded assertions; retain waits that prove dwell thresholds.
- `2026-09-03 / CF-018`: keep the Kidung PDF metadata promise and its settled
  value as separate cache views, so tempo/key detection reaches synchronous
  MIDI consumers after warm-up; treat Chromium's sub-pixel `dvh` rounding as
  one CSS-pixel tolerance in the mobile geometry proof.
- `2026-09-03 / CF-019`: bound configured Edge speech responses at the BFF
  stream boundary, validate an advertised byte count when present, and keep
  chunked responses from bypassing the 10 MB media limit; broader route
  extraction remains deferred because middleware, bindings, and cache/error
  state are still shared by the application factory.
- `2026-09-03 / CF-020`: retain the tracked native icon set, including
  byte-identical iOS files with different target names; the filenames are
  platform packaging inputs, so an apparent duplicate is not a safe deletion
  without a platform bundle regeneration proof.
- `2026-09-03 / CF-021`: move the cached-first Home route into `home.tsx` and
  map that module to its Sauh, Suara, and literature browser flows; keep route
  composition and `Shell` orchestration in `App.tsx` until their remaining
  coupling is measured.
- `2026-09-03 / CF-023`: allow only Tauri v2 Windows production's exact
  `http://tauri.localhost` origin through the e-GYS BFF CORS boundary so the
  keyring-backed bearer profile request can complete after native login.
- `2026-09-03 / CF-024`: keep Bible intent prefetch lazy and encode the TB
  reader wire pack as numeric verse tuples; normalize at the contracts boundary
  so the reader and search callers retain the existing rich verse shape.
- `2026-09-03 / CF-025`: keep Kidung parity on the canonical 533-item identity
  list, resolve PDF tempo from each song's mapped master-PDF page, and keep
  SoundFont identity in the shared MIDI render/cache key. The PDF viewer uses
  a pointer-anchored preview with a debounced PDF.js commit and lets zoomed
  canvases grow inside the stage; responsive control placement is verified by
  viewport geometry rather than by weakening the controls.
- `2026-09-03 / CF-026`: detect browser Google e-GYS accounts through the
  reviewed live-v1 callback adapter, store only the opaque session in an
  HttpOnly BFF cookie, and keep Apple/WhatsApp browser handoff as an explicit
  official-portal fallback because e-GYS exposes no safe cross-origin signal.
- `2026-09-03 / CF-027`: detect an already active e-GYS session only inside
  the same origin-allowlisted Tauri WebView through a minimal profile probe;
  validate and strip the profile at the native and web IPC boundaries, while
  keeping Chrome tab sessions out of scope.
- `2026-09-04 / CF-028`: make documentation a required delivery artifact;
  every maintenance slice records its changed fact, proof, protected
  prerequisite, and next frontier, while the maintenance skill is reviewed on
  a bounded cadence enforced by `pnpm verify:docs`.
- `2026-09-04 / CF-029`: use the administrator-confirmed live v1 Apple
  callback and WhatsApp challenge/WebSocket contract for explicit browser
  login, exchanging only opaque sessions through the BFF; passive detection of
  an unrelated Chrome e-GYS tab remains out of scope.
- `2026-09-04 / CF-030`: recover Sauh's featured image from the official
  `wp-image-{featured_media}` content tag when WordPress omits `_embedded`,
  validate the image against the existing TJC/S3 allowlist, and keep the live
  feed to the two newest records plus required fields; reserve the initial GYS
  loading shell dimensions in HTML before the app bundle runs.
- `2026-09-04 / CF-031`: preserve the live v1 WhatsApp challenge session in a
  short-lived, path-scoped HttpOnly BFF cookie, forward it only as upstream
  `connect.sid` for the WebSocket and OTP confirmation, and keep the browser
  socket behind the trusted e-GYS-origin relay; defer Apple browser UI until a
  later administrator-approved smoke test.
- `2026-09-04 / CF-032`: prefer the highest valid official Sauh `srcset`
  candidate, invalidate cached missing/low-resolution thumbnails before reuse,
  and initialize shared `LazyImage` state from an already-complete DOM image so
  Home-to-detail navigation cannot leave a loaded image under a skeleton.
- `2026-09-04 / CF-033`: treat a WhatsApp WebSocket close/error after a valid
  OTP frame as completion of the delivery channel, not as a failed login;
  preserve the OTP confirmation path while still reporting disconnects that
  happen before any OTP arrives.
- `2026-09-04 / CF-034`: keep Kidung text mode on one selected verse, remove
  the unsupported all-verses scope and its dead selectors, and retain the
  compact verse/song footer while resolving chords for the active verse.
- `2026-09-04 / CF-035`: model browser WhatsApp login as a No. Ref approval
  flow; keep e-GYS's internal WebSocket confirmation code inside the existing
  BFF exchange with the mobile response marker, remove the user-facing OTP
  controls, and finish profile detection automatically after approval while
  keeping Apple deferred.
- `2026-09-04 / CF-038`: keep the BFF as the authoritative e-GYS WhatsApp
  socket relay by requiring the short-lived challenge session, normalizing
  numeric/string approval frames, and allowing the final frame to flush before
  upstream close/error handling; do not add a ref-polling route without an
  e-GYS status API.
- `2026-09-04 / CF-039`: initialize Google Identity Services once per page,
  share overlapping React StrictMode render leases, and decode text or binary
  WhatsApp socket frames before the existing approval exchange; keep the
  Google Cloud JavaScript-origin allowlist as an external deployment
  prerequisite.
- `2026-09-04 / CF-046`: treat a browser profile probe with no session as an
  expected empty state (`200 { profile: null }`), while retaining `401` when a
  present session is rejected by e-GYS; keep provider access decisions on the
  Google/WhatsApp login routes.

Validation for CF-006: the reference audit returned no operational matches;
`pnpm verify:generated`, `pnpm verify:docs`, `pnpm format:check`, `pnpm test`,
`pnpm typecheck`, `pnpm build`, `pnpm verify:native-assets`,
`pnpm verify:bundle`, and `pnpm lint` pass. The final browser gate is 99/99
with a 37-flow smoke suite after the one-flow deduplication.

## Documentation and skill cadence

- Last maintenance skill review: 2026-09-07
- Skill review frontier: CF-054
- Review triggers: 30 calendar days or 10 new resolved frontier decisions,
  whichever comes first.
- Review scope: compare the maintenance skill, `AGENTS.md`, `CONTEXT.md`,
  `scripts/verify-documentation.mjs`, the active spec, and this map; update
  every affected pointer and retain proof, protected prerequisites, and the
  next frontier.

## Frontier

### Resolved: CF-001 — shell composition locality

Evidence: `apps/web/src/App.tsx` owns route composition, loading, online
status, settings, and feature wiring, while the 100-line route-independent
navigation responsibility now lives in `apps/web/src/app-navigation.tsx`.
`apps/web/src/app-shell-surfaces.tsx` owns the shared Header and MediaSurface;
`apps/web/src/bible-prefetch.ts` is the single prefetch entry point for both
intent and shell warm-up.

Validation: the existing canonical destination test, web unit tests (57 files,
251 tests), shell/media smoke flows (4), visual flows (19), and workspace
typecheck/build all pass. No route, accessibility name, or media behavior was
changed.

Test-speed validation for CF-007: parallel package units completed in 7.6s
versus 10.6s sequentially; the final full browser suite passed 99/99 in 1.6m
with four workers. The selective resolver has three Node tests covering
docs/unit skips, Bible runtime mapping, and direct E2E-spec mapping.

Validation for CF-008: the dependency audit has no remaining source or
documentation references, the frozen offline install remains lockfile-clean,
and the workspace typecheck, unit, build, bundle, and lint gates pass.

Validation for CF-009: the new cross-port Sauh regression and BFF preflight
test pass; a local Worker returned `204` preflight and `200` JSON with
`Access-Control-Allow-Origin: http://127.0.0.1:5174`; the browser preview then
rendered the live `sbj260903` reflection through the BFF.

Validation for CF-010: `bible-storage.test.ts` first failed on the missing
transforms and then passed 3/3 after the move; the full web unit suite passed
57 files/251 tests and the Bible browser gate passed 24/24, including notes,
highlights, speech, accessibility, responsive, and visual flows.

Validation for CF-011: `kidung-resources.test.ts` first failed because the
resolver did not exist and then passed 3/3; Kidung nav passed 8/8, resource
media passed 3/3, and Kidung/PDF visual flows passed 4/4. The full web unit
suite passed 57 files/251 tests.

Validation for CF-012: the shared MIDI resource test first failed because the
helper was absent and then passed 4/4; Kidung nav passed 8/8, resource media
passed 3/3, and Kidung/PDF visual flows passed 4/4. The full web unit suite
passed 57 files/251 tests, the workspace build passed, and the bundle remained
under its existing budget.

Validation for CF-013: exact-token CSS audit removed 247 dead rule nodes (about
1,485 rule lines) and 79 dead grouped selector members; `styles.css` is now
11,026 lines. One malformed mechanical separator was caught by the visual gate
and corrected without refreshing snapshots. Final visual flows passed 19/19,
accessibility/navigation passed 19/19, `test:fast` passed 67/67, and the full
browser gate passed 99/99. The shell run reported median 310.0 ms and p95
452.2 ms; CSS gzip fell to 32.65 KiB while initial JS stayed 158.6 KiB.

Validation for CF-014: the Kidung web unit suite passed 57 files/251 tests;
the existing MIDI queue persistence flow passed 1/1, and a live `5174`
preview showed the first catalog control change from “Tambah” to “sudah di
antrean” immediately after the playlist store update. The test item was then
removed through the playlist UI so the preview state was restored.

Validation for CF-015: the BFF regression was red before implementation when
the chunked body was three bytes against a four-byte manifest, then passed
46/46 after the shared stream guard gained an exact-size flush check. The
normal package and hymnal-index streaming cases also pass, and no checksum,
URL allowlist, CORS, or e-GYS v2 boundary was changed.

Validation for CF-016: `bible-text.test.ts` passed 1/1 for entity decoding,
footnote removal, semantic styling, and line preservation; the web suite passed
58 files/252 tests, and the Bible-targeted browser gate passed 24/24, including
visual baselines at 390, 768, and 1440 pixels. The reader storage, route, and
speech contracts were unchanged.

Validation for CF-017: the build-stamp unit test passed 3/3; a missing-stamp
local build completed in 4.2s and the unchanged-input reuse check completed in
74ms. A Chromium smoke flow passed 1/1 through the cached preview path in
6.7s. The three 1.1s quick-nav sleeps now await `data-step` state with a 2s
bound; the six waits that validate dwell, negative behavior, or layout
settling remain. The full release command still uses the unconditional root
build path.

Validation for CF-018: the new metadata regression was red before the cache
fix (`getHymnPdfMeta()` stayed `undefined` after `warmHymnPdfMeta()` resolved)
and passed after the settled-value map was added. The web suite passed 59
files/253 tests; the Kidung browser gate passed 25/25 after the mobile geometry
assertion was made aware of Chromium's fractional `dvh` rounding, and the same
flow passed 20 repeated times with four workers.

Validation for CF-019: the new chunked Edge speech regression was red before
the stream cap because an 11 MB body without `content-length` was returned in
full; it now rejects at the 10 MB boundary. The BFF suite passed 47/47, while
the existing content-type, HTTPS, schema, voice-catalog, and exact-size asset
checks remained green.

Validation for CF-020: the tracked native inventory contains 52 icon files
(425,565 bytes) and four duplicate hash groups, all under iOS target names.
`tauri.conf.json` targets all platforms and the native asset verifier plus
Cargo checks remain green, so no native packaging file met the deletion proof.

Validation for CF-021: `HomePage` moved to `apps/web/src/home.tsx`, reducing
`App.tsx` from 2,592 to 2,116 lines without changing route paths or the data
adapters. Web unit tests passed 59 files/253 tests; Home/Sauh/Suara/Literature
browser coverage passed 20/20. The selective resolver regression was red before
the mapping and passed 4/4 afterward, so future Home changes cannot silently
skip browser proof.

Decision CF-022: move the shared `Header`, `MediaSurface`, and duration
formatter into `apps/web/src/app-shell-surfaces.tsx`. Keep `App.tsx` focused on
settings, error recovery, route composition, and `Shell` orchestration after
the targeted shell and accessibility proof.

Validation for CF-022: the extraction reduced `App.tsx` from 2,116 to 421 lines;
the new import boundary typechecked. Shell/media smoke passed 4/4 and the
accessibility flow passed 6/6. An initial 404 was traced to a stale task-owned
docs server occupying port 4173; the exact process was stopped and the same
flows passed without a code change for that failure.

Validation for CF-023: the new BFF regression was red at the Tauri preflight
(`403`) before the allowlist change and passed after the exact origin was added
to the app fallback and Wrangler binding; the test also proves the bearer token
reaches live e-GYS profile forwarding. No wildcard origin or e-GYS v2 route was
introduced.

Validation for CF-024: the new compact-payload contract test was red before the
schema existed and passed after v2 normalization was added. The generated pack
contains 31,172 four-field verse tuples, is 5,949,914 bytes raw versus
7,939,120 before, and its generated provenance/hash gate passes. The bundle gate
keeps `global-bible-search` out of the initial graph; the Bible browser gate
passed 24/24, the performance smoke passed 1/1, and the full browser gate passed
99/99. No Kidung parity files were changed by this slice.

Validation for CF-025: the catalog UI shows both `hymn-051A` and `hymn-051B`
after searching Batu Zaman, while generated provenance still verifies 533
hymns. Focused Kidung/PDF/MIDI tests passed 7 files/36 tests; `pnpm test:fast`
passed all package units and 80 selective browser tests; the responsive proof
passed 7/7 at 320x720, 390x844, 768x1024, 1024x768, 1280x720, and 1440x900,
including the 800% PDF canvas overflow and debounced wheel preview. A live
`hymn-001` run exposed `76BPM` only after PDF metadata warm-up, with no tempo
default before detection. Final delivery gates passed: `pnpm test`,
`pnpm typecheck`, `pnpm build`, `pnpm format:check`, `pnpm lint`,
`pnpm verify:generated`, `pnpm verify:docs`, `pnpm verify:native-assets`,
`pnpm verify:bundle`, and `git diff --check`; fresh `pnpm test:e2e` passed
106/106. No canonical music lock or e-GYS v2 evidence was changed.

Validation for CF-026: the BFF exchange regression was red at the missing route
(`404`) and passed after the live-v1 adapter was added; the focused BFF index
boundary passed 39/39, the full BFF package passed 49/49, the web e-GYS unit
boundary passed 3/3, and the targeted browser suite passed 4/4 with a mocked
GIS callback and BFF. The browser test proves the
profile badge appears automatically, the dialog closes, and no auth token is
written to localStorage. Live Google sign-in still requires the configured
Google JavaScript origin and the protected `EGYS_API_BASE_URL` deployment
binding. No e-GYS v2 route or discovery evidence was changed.

Validation for CF-027: the native profile validator test passed after rejecting
the missing display-name case and stripping an injected token field; the web
IPC parser test passed for the minimal profile shape; native Cargo tests passed
7/7, web unit tests passed 60 files/267 tests, and the focused e-GYS browser
suite passed 5/5. `pnpm test:fast` passed all unit tests but its 106-flow
parallel browser run was 105/106 on two separate non-auth visual/read-aloud
flakes; each failed flow passed when rerun alone with one worker. No browser
cookie, e-GYS v2 route, or provider contract was changed.

Validation for CF-028: the verifier regression was red before cadence checks
were implemented and passes with the current review date and frontier anchor;
the documentation-only path is covered by the existing selective-test rule.

Validation for CF-029: Apple and WhatsApp BFF regressions were red at their
missing routes (`404`) and pass after the live v1 adapters were added; the BFF
suite passes 53/53 and the web suite passes 268/268. The targeted provider
browser flows pass 7/7 with mocked Apple authorization and WebSocket OTP
messages, while `pnpm test:fast` passes the 112-flow selective browser gate.
Live deployment preflight accepts the localhost origin for both new routes;
no live WhatsApp challenge or Apple credential was generated during testing.
No e-GYS v2 discovery route was promoted to runtime.

Validation for CF-030: the web and BFF image-recovery regressions were red
before the parser fallback and pass at 22/22 and 53/53 focused package tests;
the full package unit gate passes 268 web tests, 53 BFF tests, 33 domain tests,
18 contract tests, and 2 testkit tests. A local BFF returned today's
`sbj260904` with the official S3 `200x200` image, and its image proxy returned
`200 image/jpeg` (11,556 bytes). The production shell build reserves the
2263x288 logo at `240x30.53px` before JavaScript/CSS module loading; the full
fresh Chromium gate passed 115/115. No canonical asset or e-GYS v2 evidence
was changed.

Validation for CF-031: the WhatsApp boundary regression was red before the BFF
received the upstream `connect.sid`, then passed after the cookie mapping and
socket relay were added; the focused BFF WhatsApp tests pass 2/2 and the
targeted provider browser suite passes 7/7. A live start response now returns
only the path-scoped BFF cookie name, and a live BFF WebSocket handshake opens
without exposing the upstream origin to the browser; Chrome opened the actual
WhatsApp host rather than `about:blank`. Protected prerequisites are a real
WhatsApp OTP for final end-to-end confirmation and the deferred Apple
administrator configuration; e-GYS v2 discovery evidence remains untouched.
Next frontier: perform one authorized real WhatsApp OTP smoke test, then review
the BFF route split only if route-level coupling warrants it.

Validation for CF-032: the high-resolution parser and cached-image regressions
were red before the `srcset` and cache guards, then the focused web tests pass
24/24 and the focused BFF tests pass 54/54. Chrome verified the local
`5174` -> `8787` flow: Home and Sauh detail both load the official image at
`2560x1708` with opacity 1, the detail skeleton is removed, and returning Home
leaves nonblank content; the browser console had no warnings or errors. The
broader `pnpm test:fast` gate remains blocked by unrelated dirty Kidung i18n
keys, and web typecheck remains blocked by the existing Kidung ref mismatch.
Production use still requires deploying the matching BFF image-selection code;
e-GYS v2 discovery evidence remains untouched.

Next frontier: deploy and smoke-test the matching BFF image proxy only when
production rollout is authorized; otherwise leave the verified local preview
as the acceptance target.

Validation for CF-033: the new WhatsApp close-after-OTP regression was red
before the guard and passes with the focused web test at 2/2; the provider
browser suite remains 7/7 and the native bridge unit suite passes 7/7. The
live Chrome preview keeps the real WhatsApp host open and shows the OTP field
after the BFF handshake. Protected prerequisites are one user-authorized real
OTP/profile smoke test and the deferred Apple administrator configuration;
e-GYS v2 discovery evidence remains untouched.

Next frontier: complete the real WhatsApp OTP smoke test when the user sends
the prepared message; do not enable Apple until its administrator contract is
approved.

Validation for CF-034: the RED Playwright regression first observed three
rendered `.lyrics-sheet` elements and no verse indicator; after the narrow
render/footer change, the focused Kidung navigation tests pass 5/5, the
focused i18n and chord tests pass 16/16, and `pnpm test:fast` passes 112/112
browser flows with 275 web unit tests. Fresh target/reference Playwright
captures at 390x844 and 1440x900 show one selected verse, no scope controls,
and healthy browser/page-error logs; reader snapshots were regenerated for
the selected-verse state. Typecheck, build, format, bundle, policy, and
`git diff --check` pass.

Protected prerequisites are canonical gyschordweb data/manifests and
integrity evidence, the e-GYS v2 discovery-only WIP, and the existing
SoundFont/PDF tempo gate; none were changed. Next frontier: complete the
already-recorded authorized WhatsApp OTP/profile smoke test; keep MIDI/PDF
resource behavior unchanged unless a separate parity decision is approved.

Validation for CF-035: the new browser unit regression was red while the
WebSocket approval code was still exposed as an `otp` event, then passes at
2/2 after the client auto-confirms it internally. The targeted WhatsApp
Playwright flow passes 1/1 and asserts that the dialog has no textbox or
confirmation button. The focused BFF WhatsApp suite passes 2/2, including the
`ismobile=1` response marker, and the full e-GYS provider flow passes 7/7 with
mocked protocol messages. The focused web typecheck and formatter pass, and no
provider secret, browser cookie, or e-GYS v2 route was changed.

Protected prerequisites are one user-authorized real WhatsApp message with
the generated No. Ref followed by bot/administrator approval, plus the
deferred Apple administrator configuration. Next frontier: run that live
approval/profile smoke test when the user explicitly starts the challenge;
keep the internal confirmation code out of UI and logs.

Validation for CF-036: the WhatsApp adapter now normalizes the live socket's
four-digit approval value whether the JSON payload encodes it as a string or a
number; the focused regression was red before the change and passes at 2/2
afterwards. Chrome reopened a fresh BFF-backed challenge and received the
initial WhatsApp handshake without console warnings; no OTP was shown or
logged. Protected prerequisites remain the user's fresh No. Ref message and
bot/administrator approval, plus the deferred Apple configuration. Next
frontier: verify the real approval reaches the profile auto-detection path.

Validation for CF-037: the fullscreen lyrics regression was red before the
drawer existed and passes with the one-row transport, mobile hamburger drawer,
Escape/backdrop/close behavior, and zero horizontal overflow at 390px and
320px. The chord verification toast regression passes, the foreground PDF
smoke opens its reader in 1.17s on the local preview with a 54px single-row
chrome and no horizontal overflow, and unit coverage proves verified MIDI
bytes are reused from the in-memory fast path. The web typecheck, production
build, focused navigation/media Playwright flows (5/5), and resource/cache
unit tests (8/8) pass.

Protected prerequisites are canonical gyschordweb data/manifests and
integrity locks, the e-GYS v2 discovery-only WIP, and the PDF tempo gate; none
were weakened. Browser-plugin capture was unavailable, so validation used the
repository's Playwright runner and the local preview. Next frontier: repeat
the canonical-versus-rewrite cold/warm media benchmark on the authorized
device matrix before making a GA performance claim.

Validation for CF-038: the focused BFF suite passes 45/45, BFF typecheck,
Prettier, and `git diff --check` pass, and the final Worker deployment is
`68c651de-20a2-4517-b04b-617d434e9993`. Live tail evidence for refs
`7712468398` and `1140009277` shows the BFF connected upstream and received a
four-digit approval frame without logging its value; Chrome still reported a
disconnect before profile completion, so this receipt does not claim the live
smoke is green. Protected prerequisites are one fresh user-authorized message
for ref `5437151770` followed by the profile check, the deferred Apple
administrator configuration, and the untouched e-GYS v2 discovery evidence.
Next frontier: complete that one live approval/profile smoke and inspect the
`/confirm` response before considering a Durable Object or other server-side
completion store; a ref-only poll remains unsupported by the live v1 contract.

Validation for CF-039: the focused web e-GYS boundary passes 7/7, including
the overlapping-GIS initialization regression and a binary WhatsApp approval
frame; web typecheck, Prettier, and `git diff --check` pass. The targeted
provider Playwright suite passes 7/7 with Google and WhatsApp protocol mocks.
Worker version `af01f210-7192-4fba-a04d-09c4a6076588` is deployed, and its
live CORS preflight for `localhost:5174` returns 204 while the unauthenticated
profile probe correctly returns 401. Chrome now opens the Google account
chooser for GYS App without `origin_mismatch`; account selection and the live
e-GYS profile remain unverified. Protected prerequisites are one completed
Google selection, one fresh authorized WhatsApp approval/profile smoke, and
the untouched e-GYS v2 discovery evidence.
`pnpm test:fast` reaches BFF 56/56 and web 277/278 before stopping on the
pre-existing unused Kidung i18n keys; no Kidung file was changed for this auth
slice.

Next frontier: complete the Google account selection in the open Chrome popup,
capture the live `/auth/google` and `/account/profile` result, then repeat one
authorized WhatsApp challenge before considering a server-side completion store.

Validation for CF-040 (2026-09-04): Kidung text mode now renders its title,
mode switch, chord/MIDI, and secondary menus in one compact header row; the
upper song-chevron row, auto-scroll, duplicate PDF action, and fullscreen text
entrypoint are gone while the footer keeps verse/song navigation. Ctrl/Cmd
wheel is prevented from changing browser zoom and text mode applies it to the
reader font; PDF mode keeps cursor-anchored preview, 180ms easing, a clear
chord-to-note gap, and an unclipped title line. Proof: RED Playwright
regressions were observed at the old header/chord/title/wheel behavior, then
the focused navigation suite passed 23/23, Kidung placement/media passed
14/14, web typecheck and production build passed, and the control-zoom sample
showed canvas widths 529.5 → 614.6 → 661.4 px across the 180ms transition.
The refreshed reader visual baselines were regenerated for 390, 768, and
1440px. Protected prerequisites are canonical gyschordweb data/manifests,
integrity locks, the e-GYS v2 discovery-only WIP, and the PDF tempo/key gate;
none were weakened. Browser-plugin capture remained unavailable, so rendered
evidence uses the repository Playwright runner and local preview. Next
frontier: repeat the canonical-versus-rewrite cold/warm media benchmark on the
authorized device matrix before any GA performance claim.

Validation for CF-041 (2026-09-04): the newest browser log still shows Google
GIS returning 403 `origin not allowed` for `http://localhost:5174`; it contains
no `/api/v1/auth/egys/google` request, so that attempt stops before the BFF.
The same client opens the Google account chooser from `http://127.0.0.1:5174`,
and Chrome now keeps the detected e-GYS profile on the localhost page after a
refresh; current app logs contain only two browser-extension message-channel
errors. The local preview serves `same-origin-allow-popups`, so the remaining
prerequisite is the exact Google Cloud JavaScript-origin entry for the same
client (or consistently using the already-authorized loopback hostname), not a
new browser-side session detector. TTS 503, favicon 404, extension messages,
and COOP diagnostics remain outside the login boundary. Protected prerequisites
are the untouched e-GYS v2 discovery evidence and canonical release data. Next
frontier: have the administrator verify `http://localhost:5174` on client
`748303683851-46ea0qkq8ti4r6lh8ss5aivf60ct71u7.apps.googleusercontent.com`, then
repeat one fresh Google login after clearing the old console.

Validation for CF-042 (2026-09-04): direct Google Cloud Console inspection of
project `gysapp-tauri` confirms the exact web client used by the app has the
saved JavaScript origins `http://localhost:5174`, `http://127.0.0.1:5174`, and
`https://gyspnk.github.io`; the client has no redirect URI, as expected for the
GIS popup flow. A fresh localhost button attempt sends
`origin=http://localhost:5174` to the Google chooser, but the captured app log
still records the GIS 403/origin warning before account selection. The console
warns that origin changes can take minutes to hours to apply, so no browser or
BFF bypass was added and no Save action was repeated. Protected prerequisites
remain the untouched e-GYS v2 discovery evidence and canonical release data.
Next frontier: after propagation, retry from a newly loaded GIS button; if the
403 remains, have the administrator compare this exact client in the legacy
Credentials view and Google Auth Platform view before changing application
code.

Validation for CF-043 (2026-09-04): the authorized Chrome smoke now completes
Google login on `http://localhost:5174`; the popup closes and the account card
shows a refreshed e-GYS login timestamp after the profile check. The captured
console still contains the GIS button 403/origin diagnostic and two COOP
`window.closed`/`postMessage` warnings, but no application auth error remains;
the profile card is the runtime proof that credential callback, BFF session,
and profile detection completed. The separate Edge voices request still returns
503 and remains outside authentication. WhatsApp was intentionally not tested
in this slice. Protected prerequisites remain the untouched e-GYS v2
discovery evidence and canonical release data. Next frontier: investigate the
non-blocking GIS/COOP console noise only if it persists in a clean fresh-page
capture; handle Edge voices as a separate availability slice.

Validation for CF-044 (2026-09-04): the Google Cloud OAuth web client
`748303683851-46ea0qkq8ti4r6lh8ss5aivf60ct71u7.apps.googleusercontent.com` in
project `gysapp-tauri` now has the four authorized JavaScript origins
`http://localhost`, `http://localhost:5174`, `http://127.0.0.1:5174`, and
`https://gyspnk.github.io`; the console confirmed `OAuth client saved`, and a
fresh read of the client form retained the new bare `http://localhost` row.
No application or BFF change was needed because the existing popup callback
already completed Google login and the local response already serves the
required COOP policy. Protected prerequisites remain the untouched e-GYS v2
discovery evidence and canonical release data. Next frontier: after Google's
propagation window, capture one clean fresh-page GIS attempt; keep the TTS 503,
COOP diagnostics, and WhatsApp flow as separate slices.

Validation for CF-045 (2026-09-04): the browser WhatsApp listener now drains
pending text or binary frames before reporting a transport close/error; the
new regression was red with `[error, success]` before the patch and passes with
the focused web boundary at 3/3. Web typecheck passes, and the targeted e-GYS
Playwright provider suite passes 7/7, including automatic No. Ref approval and
profile detection. Chrome on `http://localhost:5174` reaches the live BFF
`start` response, a `101` WebSocket handshake, and the upstream `info` frame;
the current controlled challenge is waiting for the user's bot approval, so no
live profile completion is claimed yet. The generic asynchronous-listener
console error is not emitted by the app and remains unrelated extension
diagnostic noise. Protected prerequisites remain the untouched e-GYS v2
discovery evidence and canonical release data. Next frontier: complete one
fresh authorized WhatsApp approval/profile smoke and inspect its final BFF
confirmation response without deploying or changing the upstream contract.

Validation for CF-046: 2026-09-04 — the new BFF regression was red with a 401
before the route change and passes with `200 { profile: null }`; the full
focused BFF boundary passes 46/46. The browser provider mocks now model the
same empty-state contract, while the expired-session test retains a 401 gate.
Worker version `c2debcf8-a9ec-49ec-965a-014825d70f7f` is now deployed; its live
no-cookie probe from `http://localhost:5174` returns 200 with
`{ "profile": null }`, `cache-control: no-store`, and the exact allowlisted
CORS origin, while the preflight returns 204 with credentials enabled. The
provider tests and full selective browser gate remain green. Protected
prerequisites remain the untouched e-GYS v2 discovery evidence and canonical
release data. Next frontier: reload the localhost page in a clean tab and
capture one fresh successful Google profile probe.

Validation for CF-047: 2026-09-05 — a live browser challenge for ref
`0830757981` connected through the deployed Worker and received an upstream
`approval` frame with a string OTP after the WhatsApp bot accepted the
request. The smallest red regressions reproduced the exact-four-digit guard in
the BFF normalizer, confirm schema, and browser listener; the focused BFF
boundary now passes 57/57 and the browser WhatsApp boundary passes 3/3 with a
six-digit approval. The fix accepts 4–32 numeric digits, matching the official
portal's minimum-length validation while retaining a bounded trust boundary.
The live profile completion still requires a fresh post-deploy challenge;
protected prerequisites remain the untouched e-GYS v2 discovery evidence and
canonical release data. Next frontier: deploy this fix and capture the
resulting `/whatsapp/confirm` plus profile response in Chrome.

Validation for CF-048: 2026-09-05 — the fresh live ref `2453562088` reached
the Worker WebSocket approval frame and the browser issued `/whatsapp/confirm`,
but e-GYS returned 401. The focused red regression showed the adapter omitted
the official login request metadata; the BFF now sends the e-GYS origin,
login referer, and `X-Requested-With: XMLHttpRequest` on confirmation while
retaining the challenge session cookie. The focused BFF boundary passes 57/57
after the patch. Protected prerequisites remain the untouched e-GYS v2
discovery evidence and canonical release data. Next frontier: deploy this
adapter patch and verify a fresh WhatsApp approval returns an e-GYS session
cookie and profile in Chrome.

Validation for CF-049: 2026-09-05 — the existing Apple adapter is now wired
into the browser login dialog: the enabled Apple row loads Sign in with Apple
on demand, sends only its authorization `code` and `id_token` to the existing
BFF callback boundary, and reuses the normal HttpOnly-session/profile
completion path. The smallest red E2E regression observed the old disabled
button; after the wiring and assertion update, the Apple flow passes with the
local SDK stub and profile fixture, and the complete e-GYS provider E2E file
passes 7/7. Web typecheck passes. Live Apple verification remains dependent
on an Apple ID registered in e-GYS and administrator allowlisting of client
`id.or.gys.e.client` with redirect URI `https://e.gys.or.id/login`; protected
prerequisites remain the untouched e-GYS v2 discovery evidence and canonical
release data. Next frontier: run one authorized live Apple popup smoke test
when that account is available.

Validation for CF-050: 2026-09-05 — Chrome reproduced the Apple authorization
page's provider-side failure before any `/api/v1/auth/egys/apple` request, while
the browser stayed at `Memeriksa akun e-GYS…` because the adapter waited only
for an unresolved SDK Promise. The smallest red regression reproduced an
`AppleIDSignInOnSuccess` event with that Promise left pending; the adapter now
accepts the SDK Promise or its success/failure document event, cleans up both
listeners, and times out a missing response. Apple success and failure browser
regressions pass 2/2, web typecheck passes, and the live provider still requires
the Apple Services ID/client and redirect configuration to accept the app's
authorized origin. Protected prerequisites remain the untouched e-GYS v2
discovery evidence and canonical release data. Next frontier: retry one live
Apple authorization after the provider-side configuration is confirmed.

### Ready after CF-001

- CF-004 — Bible reader state locality (`bible.tsx`, 2,600 lines), with local
  persistence and annotation transforms now isolated and verified.
- CF-005 — Kidung presentation/resource locality (`kidung.tsx`, 3,858 lines),
  with catalog, verified PDF identity, and shared MIDI resource seams isolated;
  viewer/session state is the remaining measured frontier.

## Not yet specified

- remaining `Shell` online/search/wake-lock extraction boundary after runtime tracing;
- stylesheet split order after selector ownership and visual coverage;
- BFF route split after route-level error/security coupling is measured;
- whether duplicate localhost tooling should consolidate into the root wrapper;

## Out of scope

- removing e-GYS v2 WIP, its pinned checkout, generated contract evidence, or
  discovery documentation;
- changing canonical gyschordweb data or weakening integrity/provenance gates;
- adding cloud credentials, deploying protected services, or claiming GA;
- broad dependency replacement without a measured bundle/runtime win.

## Evidence pointers

- Architecture candidates: external report
  `architecture-review-gysapp-20260903.html` in the OS temp directory.
- Acceptance scope: `docs/maintenance/codebase-simplification-spec.md`.
- Agent procedure: `.codex/skills/gysapp-maintenance/SKILL.md`.
- Baseline commands: `CONTEXT.md` and ADR `docs/adr/0008-testing-and-delivery.md`.

Validation for CF-051: 2026-09-05 — focused 320px regressions first failed
on title truncation and action-group menu width. The responsive viewer suite
now passes 8/8, including seven viewports and PDF zoom. Exact command outcomes
are recorded in the Kidung parity spec. No new viewer mode, canonical asset,
or MIDI contract is introduced. Protected prerequisites remain canonical music
provenance and e-GYS v2 evidence. Next frontier: user review on phone and tablet.

Validation for CF-052: 2026-09-07 — the new `kidung-design-tokens` regression
was red before the edit (blue mode glow) and passes after the Teks/PDF
active state became paper/gold. Proof: design tokens 3/3, full web unit 63
files/283 tests, web typecheck green, and `git diff --check` clean. The
committed change is deliberately viewer-scoped: the pujian-list catalog
restyle lives in the uncommitted redesign and travels with its own slice, so
the shipped snapshot cannot drift committed baselines. Protected
prerequisites remain canonical music provenance, integrity locks, the e-GYS v2
discovery-only WIP, and the PDF tempo/MIDI gate; none were changed. Next
frontier: user review of the gold viewer treatment on phone and tablet.

Validation for CF-053: 2026-09-07 — the token regression was red before the
fix (viewer accent ignored the theme preset); `--kidung-accent` on
`.hymn-detail-page` is now `var(--accent, #8d6e3f)` with the reference
80%-mix for dark/amoled, and the mode toggle reads the shared token, so
picking e.g. Zamrud recolors the viewer accent instantly via CSS inheritance
with no JS subscription (the same source chord/PDF surfaces subscribe to). A
web typecheck failure on the new test's `node:fs` import was fixed by reading
the stylesheet with a file-local `@ts-nocheck` (the package is DOM-typed; no
new dependency or tsconfig change). Proof: design tokens 3/3, full web unit
63 files/283 tests, web typecheck green, `git diff --check` clean. Protected
prerequisites remain canonical music provenance, integrity locks, the e-GYS v2
discovery-only WIP, and the PDF tempo/MIDI gate; none were changed. Next
frontier: user review of the gold default and a custom-accent pass on phone
and tablet.

Validation for CF-054: 2026-09-07 — the maintenance-skill review was due
after 11 new frontier decisions, and the commit/push gates were blocked by
the verifier comparing a millisecond day-difference against `30`. The review
compared the skill, `AGENTS.md`, `CONTEXT.md`,
`scripts/verify-documentation.mjs`, the Kidung parity spec/plan, and this
map: agent guardrails, the verification ladder, and the spec pointers show
no drift, so no rule text changed. The one real defect was the verifier
threshold, now `>= 30 * 86400000`, proven by new 29-day (pass) and 30-day
(fail) boundary regressions that were red before the fix. The CF-052/053
receipt dates were corrected to the actual run date. `CONTEXT.md` baseline
counts predate dirty-tree test additions and are left for a release slice
rather than refreshed mid-tree. Proof: `verify-documentation.test.mjs`
4/4, `pnpm verify:docs` green, Prettier check on the touched map and
scripts green. Protected prerequisites remain canonical music provenance,
integrity locks, and the e-GYS v2 discovery-only WIP; none were changed.
Delivery follow-up in the same slice: the first commit accidentally carried
the full uncommitted stylesheet snapshot, and a clean-tree measurement
(origin DOM + that snapshot) failed all three `reader` visuals with 8-10k
differing pixels, so the commit was rebuilt slim (origin stylesheet plus only
the viewer token/toggle hunks) and the catalog restyle stayed in the working
tree for its own slice. Next frontier: resume the Kidung phone/tablet user
review from CF-053.
