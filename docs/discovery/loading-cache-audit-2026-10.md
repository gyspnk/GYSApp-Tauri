# Loading, cache, and interaction audit — October 2026

The audit covers shared web/Tauri storage, chord synchronization, public BFF
content, route preloading, PDF/MIDI assets, service-worker behavior, and the main
reading and settings surfaces. Account endpoints retain their private storage
and network semantics.

## Changes

| Area               | Finding                                                                                              | Result                                                                                                                                                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chord startup      | Every cached song was read, hashed, parsed, and its full index rewritten on every launch.            | Compare verified metadata; fetch only missing/changed files. Reuse identical canonical hashes across commits. Verify disk bytes when opened.                                                                                 |
| Chord reads        | Concurrent/repeated readers repeated disk work.                                                      | Share in-flight reads and keep parsed documents in a 32-entry/1 MiB LRU. Batch advisory access-order writes.                                                                                                                 |
| Chord writes       | The previous blob was deleted before its replacement pointer was durable.                            | Serialize mutations, persist the pointer first, and retain the previous chord on failed commits. Skip no-op GC writes.                                                                                                       |
| Manifest/network   | The fallback lock was fetched separately; current upstream files unnecessarily tried the pinned BFF. | Reuse the validated music lock, avoid unchanged manifest writes, and route newer commits directly to their immutable upstream. Bound request waits.                                                                          |
| First navigation   | Importing modules alone left their first React Suspense reveal delay intact.                         | Share preloadable components with the router; warm the Bible header and actual hymn catalog component. Preserve the chosen component type for each mount, so theme/locale changes retain local state.                        |
| Faith              | Data was requested/parsed again on each visit.                                                       | Share one validated build-pinned payload and initialize the page from preloaded data.                                                                                                                                        |
| Background preload | Busy pages could indefinitely postpone idle work; Suara/Sauh modules were omitted.                   | Add an idle deadline and warm their shared module. Keep PDF and optional collection downloads on demand; respect data-saving connections.                                                                                    |
| Initial bundle     | Core shell preferences and speech imported the general storage adapter.                              | Move the existing preference accessor and browser speech provider to their focused modules; preserve compatibility exports.                                                                                                  |
| MIDI/PDF cache     | Reading MIDI also scanned the entire PDF cache.                                                      | Prune PDFs on PDF writes, retain the 16 MiB insertion budget, and index immutable asset lookup by kind/path/name/number. Retry failed bundled-manifest probes.                                                               |
| Public BFF content | Expired entries blocked readers on an upstream refill.                                               | Bound caches and concurrent fills, share refreshes, and serve usable stale content through Worker `waitUntil`. Keep retry backoff and stale expiry. Sauh caches include the Jakarta day and still filter to today's reading. |
| Public validators  | Count/first-item/timestamp validators missed same-size edits or invalidated unchanged articles.      | Hash actual content; exclude article fetch timestamps. Keep valid weak ETags on the collection routes.                                                                                                                       |
| Immutable proxy    | Repeated asset requests depended on the upstream's short cache policy.                               | Configure Worker edge caching for successful immutable music, fork-PDF, and hymn-index responses; retain range forwarding and integrity checks.                                                                              |
| PWA snapshots      | Network-first editorial reads delayed already stored content.                                        | Paint cached snapshots immediately; deduplicate background refreshes. API reads bypass public shell storage, and private responses are not cached. Warm cover reads no longer prune the media cache.                         |
| Interaction        | Dropdown focus could move the page; zoom interleaved per-row style writes and layout measurements.   | Restore focus without scrolling, throttle popup positioning to one frame, and batch Bible zoom measurements before applying row animations.                                                                                  |

## Measurements

Chromium production preview at localhost; optional external requests blocked.
These are local application measurements, not deployed-network guarantees.

- A 400-song cache with one changed song across two startup checks needs one
  index read, one payload read, one pointer write, and one download. Unchanged
  songs perform no payload reads or downloads. Advisory access-order persistence
  is deferred; it is not part of this immediate count.
- First visits after preload, measured from link activation to the next content
  frame, improved from 328–656 ms to 21–133 ms at 390, 768, and 1440 px. These
  measurements exclude Playwright's click actionability wait.
- Initial JavaScript is 179.4 KiB gzip across 20 files, below the unchanged
  180 KiB budget. No dependency was added.
- The five-sample shell benchmark records a final median of 362.4 ms and p95
  of 460.5 ms (baseline: 387.6/471.9 ms), without duplicate module requests.
  The larger gains above concern cached first navigation and repeated storage work.

## Verification

Coverage includes all workspace unit tests, component-preload retry/deduplication,
real pinned canonical chord startup and offline reuse, corrupted or evicted
chord recovery, failed pointer commits, PDF cache bounds, stale backend refresh,
stable/change-sensitive ETags, service-worker migration and cache clearing,
first preloaded navigation without a Suspense delay, theme state/scroll retention,
Ctrl+wheel/pinch limits, reduced motion, and offline literature reopening.

Visual checks cover 11 surfaces × 3 widths × 2 themes: no horizontal overflow,
no runtime errors, and no contrast/button-name/label violations in the checked
areas. Mobile/tablet/desktop screenshots use the actual app and pinned canonical
chord bytes. Packaged-device latency and production CDN cache hits were not
measured here; Rust/native authentication logic was not changed.

## Kidung viewer and persistent player follow-up

- Text-only entry previously fetched neighbouring PDFs and prepared the
  soundfont/PCM cache while MIDI was off. Neighbour warming now runs in idle
  time, fetches scores only in score mode, and warms neighbouring audio only
  after actual playback starts. Saved preload counts and data-saving preferences remain
  effective. Opening MIDI no longer awaits an unused soundfont cache probe.
- Render-cache presence checks previously cloned and decoded the entire PCM
  payload. Metadata checks now preserve LRU recency without copying channel
  buffers; synchronous checks can find completed neighbour renders. Cancelling
  preload while its soundfont is pending prevents later queue resurrection.
  A local Node probe with twenty checks of an 8 MiB entry took 0.03 ms for
  metadata versus 105 ms for copied reads, avoiding 160 MiB of copied data.
  This isolates cache-check cost; it is not a full playback latency benchmark.
- Audio position updates now render the seek/time fragments independently
  from the persistent player's settings, fullscreen lyrics, and PDF music
  controls. Instrument options and chord layout no longer rerender on every
  250 ms playback tick.
- MIDI-ready/PDF-open toasts and duplicate chord/PDF failure toasts were
  removed. Chord loading uses a fixed-size control indicator; MIDI rendering
  uses a thin progress track. Existing inline errors and retry controls remain.
- The expanded player reserves measured space above the verse navigation,
  keeping lyrics clear of its dock. Settings group volume/stop/mute in one row
  and compact key/transpose, tempo/instrument, and queue controls. Touch targets,
  bounded scroll, icon centering, and both themes were checked.
- Key selection retains the previous transpose and uses the cached source key.
  It shares the app's animated, keyboard-accessible Select. Escape closes the
  inner list first, then its parent menu; outside clicks dismiss contextual
  menus. Keyboard selections scroll only their list, without moving the page.
  The shared selector now exposes the correct combobox semantics and a
  keyboard-reachable scrollable list.
- A browser smooth scroll initiated by dropdown focus could continue beneath
  theme snapshots and move the page by hundreds of pixels. Theme changes stop
  that pending scroll before the fade, retaining the current position. A
  deterministic browser regression reproduces the original 398 px movement.
- Unused notification translations were deleted in all three locales.
  Final initial JavaScript is 179.3 KiB gzip across 20 files, with no new
  dependency and the original 180 KiB budget.

## MIDI rendering and lifecycle follow-up

- Enabling MIDI prepares the current track silently while its controls remain
  usable. Text-only reading prepares neither MIDI binaries nor the soundfont.
  Foreground playback and background warming share a render, and reopening or
  returning to a previously rendered key reuses its playable AudioBuffer.
- One 128 MiB LRU stores worker-owned PCM or the materialized AudioBuffer for
  each key. Presence checks and internal reads avoid copying large channels;
  public reads and writes retain defensive copies. The active buffer is pinned
  until another render replaces it or the session closes. An active render
  exceeding the budget is retained until released; the limit is a cache budget,
  not a bound on total browser/worker memory or transient crossfade decks.
- Worker startup/request timers are cleared on transfer failure, crash, timeout,
  and close. Superseded worker failures cannot discard a replacement worker.
  Closing terminates idle workers, suspends the AudioContext, cancels background
  work, and retains the bounded render cache for reopening.
- Crossfade now follows live audio sources rather than the incoming song's
  temporary loading status. Both overlap decks stop immediately on close, and
  an old deck ending during a render releases its nodes without resetting the
  new song's loading state. Reapplying an unchanged instrument retains playback.
- The single-song dock presents play, minimize, and settings. Queue navigation
  appears when multiple songs are present; stop/mute and infrequent adjustments
  stay in settings. Mobile transport uses its actual width, and controls retain
  at least 44 px touch targets at phone and tablet widths. The settings popup
  anchors above the entire dock, leaving minimize and playback reachable across
  route changes.
- Three fresh local production-preview contexts playing pinned hymn 001 with
  the bundled Tim font recorded median start latency of 588 ms versus 1,799 ms
  before warming/cache changes. Returning to the previous key recorded 32 ms
  versus 1,139 ms, and two worker renders versus three. Measurements include
  Playwright click actionability; an uncached changed key still renders in
  approximately 1.25 seconds in this environment.
- Device reset now aborts chord synchronization and drains all active workers,
  pointer mutations, and advisory writes before clearing storage. A delayed
  startup import cannot repopulate the just-cleared cache; the next launch
  resumes startup synchronization.

## Scrubbing, recovery, and animation boundary checks

- Repeated Play requests now transfer ownership of the shared render to the
  current operation. Previously both requests could reject the same stale job
  and leave the player stuck loading. Each caller still validates its own
  generation before starting audio.
- Background renders check cancellation after worker startup, SoundFont loading,
  and rendering. A cancelled neighbour cannot start rendering after a delayed
  worker becomes ready. Foreground playback may take ownership of a useful
  warm render, retaining deduplication without reviving cancelled background work.
  Superseded SoundFont errors cannot clear a newer worker's request.
- Seek and tempo sliders preview pointer changes locally and commit once on
  release. Playback continues while seeking, and repeated native input/change
  events from one keyboard action do not restart the audio twice.
- Tempo adjustment expands inside the scrollable settings field. The former
  nested absolute popup was clipped in landscape and extended offscreen at
  320 px. Desktop and landscape transport now occupy one row while retaining
  44 px controls and space for the title and progress.
- Delayed IndexedDB playlist recovery no longer overwrites additions or other
  changes made while recovery is pending. Blocked localStorage reads/writes
  retain an in-memory queue and usable IndexedDB recovery.
- Expand/minimize animations retain the existing correct top-left transform
  origin. New frame-zero geometry checks verify both directions at phone and
  desktop widths, including the compact single-row dock.
- Sidebar tests verify that navigation remains visible and usable after long
  page scrolling, in both expanded and collapsed states.

Validation includes 406 web tests, 36 domain tests, workspace typechecking,
blocked-soundfont browser tests at 320/390/768/1440 px, dormant text-only binary
preload, playback on/off, left/right dragging and minimized-state persistence,
source-key/transpose selection, chord/verse/reduced-motion transitions, zoom
limits, localized fullscreen controls, and system controls for Bible speech.
Screenshots use real pinned chord/PDF bytes and the actual responsive app.

## Immersive score and literature follow-up

- The score header contains back, title/number, the `Aa` mode control and an
  icon-only music menu. Song navigation shares the bottom PDF dock for
  single-page songs; multi-page songs retain page navigation and expose song
  navigation in settings. Fullscreen joins download/zoom/layout in settings.
  The duplicate inline MIDI panel was removed; playback uses the persistent
  player. Literature uses the same compact icon controls and shared reader.
- PDF readers, chord geometry and song metadata lease a shared PDF.js
  document. Concurrent consumers reuse its in-flight parse/range requests.
  Active documents remain usable; up to two idle documents survive for
  30 seconds, with LRU eviction and worker destruction on expiry/failure.
  Offline literature reopening reuses the same validated byte buffer.
- PDF rendering paints into a temporary bounded canvas and replaces the
  visible bitmap only when ready. Subsequent page/zoom loading uses a slim
  progress strip instead of covering the previous page. Nearby page
  descriptors warm after paint; existing long-document bitmap virtualization
  and the four-million-pixel raster limit remain in force.
- Kidung mode queries preserve the mounted song reader and its chord/settings
  state. Module warming overlaps asset resolution and reader intent; warmed
  PDF components render synchronously without a first Suspense delay.
  Literature route warming includes its catalog; navigation and preload share
  a cold catalog request, while individual callers can cancel independently.
- KR neighbours warm mapped pages in the shared master instead of downloading
  separate canonical PDFs. Immutable source probes deduplicate by version,
  retry failure, have an eight-second timeout, and stop after the five-byte
  PDF header even when a server ignores Range. Optional page/asset warming
  respects Save Data, slow connections and the reader's preload setting.
- Song metadata previously extracted page 1 of the entire master. It now uses
  the mapped first song page, including suffixed hymn identities. For example,
  hymn 001 is E-flat on master page 5, with the existing natural-chord default
  of -1. Metadata arrival updates the player key reactively and preserves
  manual transpose preferences; failed extraction remains retryable.

Three local preview contexts with pinned real score bytes measured median first
score opening at 541 ms (previously 993 ms) and next-song display at 108 ms
(previously 492 ms). These are local browser measurements, not remote network
or packaged-device guarantees.

Validation: 412 web unit tests, web typechecking, production build and the
unchanged 180 KiB initial JavaScript budget (179.2 KiB measured). Browser checks
cover score/text state preservation, a single shared master worker/request,
late metadata with manual transpose, 320/390/768/1440 px control geometry and
light/dark contrast, PDF paging/spreads/resize/zoom/reduced motion, all ten
bundled doctrine PDFs, offline literature, dormant text-only preload and MIDI
playback/cache behavior. Screenshots use real pinned score bytes and the
catalog's actual Kitab Markus PDF. Remote first loads still depend on the
network and server range support; the document cache is session memory and
expires rather than permanently retaining workers.

### Continuous main surface follow-up

The main canvas now fills the workspace at every width, including screens
beyond the previous 1440 px cap. A single adaptive gutter replaces nested
page/card padding. Home, doctrine rows, hymn lists, literature entries,
articles and settings use flat sections with quiet separators; individual
inputs, actions and cover art retain their affordances. Bible and lyric
readers occupy the available field without outer negative margins or a
separate capped page.

PDF titles, stages and navigation share one background and full-width dock.
Only the actual document retains its paper aspect ratio and shadow; its wider
page wrapper has no shadow. Menu placement, touch targets, zoom bounds,
reduced-motion behavior and persistent media reservations remain intact.

Validation: 36 browser checks passed, followed by 16 reader checks after the
final PDF chrome refinement. An additional audit of 88 route/theme/viewport
combinations at 320, 768, 1440 and 2400 px found no horizontal overflow,
runtime errors or tested contrast/name/label violations; the main area's
right edge matched the workspace at every width. Checks cover page composition,
sidebar scrolling/collapse, icon centering, light/dark contrast, PDF controls,
paging, zoom and virtualization. This follow-up changes CSS only.

### Centered fit and sharp gesture zoom

Initial score fit now uses the stage's actual usable width and height, with
the paper centered in both axes. Removed legacy 500 px/viewport-height CSS
caps that could resize the canvas a second time. One-page songs use a single
page even when the saved preference requests a spread.

A native, non-passive Ctrl/Cmd-wheel and two-finger pinch controller consumes
browser zoom, animates logical geometry in one frame loop and preserves the
cursor/midpoint content anchor. Ordinary wheel scrolling pans the document;
zoomed dragging does not trigger page-swipe navigation. Fit-relative zoom
recalculates on viewport changes, stays within 100–800%, and applies instantly
when reduced motion is enabled.

Whole-page preview bitmaps retain their four-million-pixel cap. When that
preview is below screen density, the visible region is rendered again from
PDF vectors in 512 px tiles at up to 3x density. Each tile is at most 2.36
million pixels; offscreen tiles, cancelled tasks, timers and observers are
released. Long-document placeholders keep their geometry when offscreen
bitmaps are freed, preserving page jumps while avoiding blank zoom frames.

Browser verification includes initial maximal fit/centering at 320, 390, 768
and 1440 px, intermediate zoom frames and anchor stability, native Ctrl-wheel
and CDP touchscreen pinch without shell zoom, sharp 2x/3x tiles, 800% bounds,
reduced motion, spread preferences, PDF paging/resize/virtualization and
shared-document/chord state. Production initial JavaScript remains 179.2 KiB;
the rendering improvements load with the optional PDF reader.
