# Current feature and verification matrix

Reviewed 2026-10-07. Canonical reference:
`gyspnk/gyschordweb@e8e7efe1189b5746a2bb542348e221844091c8d1`.
`IMPLEMENTED` describes checked code; it does not imply all device/provider/GA
acceptance. Historical differential receipts remain in the
[September matrix](feature-parity-matrix-2026-09.md).

| Area            | Current implementation                                                                                                                  | Evidence / open gate                                                                                              |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Shell           | Church-blue responsive header/nav, profile avatar, fixed rail, compact grouped actions and reduced-motion theme/route/menu transitions. | Responsive/keyboard/Axe/state browser checks; physical screen-reader/device sweep remains.                        |
| Startup/preload | Saved-theme logo/bootstrap, cached first paint, route intent/idle warming, lazy worker/PDF/synth and bounded navigation wait.           | Build budget, module/preload/offline tests; cold deployed-network speed remains external.                         |
| Catalog         | 533 canonical core entries with A/B variants, six definitions, number/title/lyrics search and consistent sibling nav.                   | Source-byte catalog/lock and search/browser tests; installed optional collections require their packages.         |
| Text lyrics     | Responsive initial scale, stored override, bounded wheel/pinch, readable overflow, smooth chord/verse changes.                          | Typography/overflow/reader-motion tests and screenshots.                                                          |
| Chords          | 161 immutable documents, incremental launch sync, verified bounded caches, same-PDF geometry and score-key offset.                      | 3,738 strict mapped positions, zero orphan/invalid; cache/race and actual hymn key tests.                         |
| MIDI            | Packaged TimGM, optional GeneralUser, full transport/instrument/key/transpose/tempo/queue, setting-aware cache.                         | Real MIDI, scrub/preload/cancel tests; canonical first-audio and physical long-session profile remain.            |
| Dock            | Compact expanded controls and half-circle left/right tab, touch/keyboard move, persistent playback/scroll/route state.                  | 320–1440 px geometry, real touch drag/tap, fullscreen position and reduced motion.                                |
| Shared PDF      | Maximal centered fit, 100–800% sharp anchored zoom, pointer/touch pan, page/song controls, source/download/fullscreen/resume.           | Synthetic and real pinned PDF/zoom/pan/shared-viewer tests; publisher-network/deployed Worker acceptance remains. |
| Bible           | 66-book/31,172-verse TB pack, lazy search, split, annotations/voice and draft keypad address picker.                                    | Locale/limits/draft/focus/touch tests; additional installed versions need their data.                             |
| TTS             | Detected browser/system/gateway or native transport, queue preferences and one-audible-session coordination.                            | Provider/orchestrator and historical packaged smoke; actual voice/device availability remains.                    |
| Iman            | Full ten-belief text in ID/EN/ZH, full-width search/justify, notes and local official PDFs.                                             | Pack/schema/faith/PDF/browser checks; translations and asset provenance retained.                                 |
| Literature      | 300-entry packaged catalog, covers/history/favorites, sanitized article/PDF, validated link cache and range proxy.                      | Source/lease/first-frame/retry/offline tests and local real-publisher receipt; current hosted Worker must deploy. |
| Sauh/Suara      | Publisher daily selection, cached snapshots, stable decoded thumbnails, adaptive theme-aware internal articles.                         | Source/date/outage/image/article browser/unit checks; publisher uptime/freshness is external.                     |
| Account web     | Direct Google/Apple/WhatsApp BFF login, HttpOnly profile detection, no app login overlay or typed OTP.                                  | Provider/relay/BFF/SDK/deadline regression tests; real-account acceptance remains.                                |
| Account Tauri   | Official allowlisted v1 login WebView, opaque bridge token in keyring and BFF profile.                                                  | Native bridge/origin/command checks; installed account smoke remains.                                             |
| Backup/data     | Versioned encrypted export, legacy import, verified atomic pack updates and drained scoped reset.                                       | Domain/platform/migration/reset tests; file-picker/device recovery acceptance remains.                            |
| Delivery        | Deterministic hooks, generated docs/provenance, shared verified CI build, Pages/Worker/native workflows.                                | Local gates and remote SHA verification; credentials/signing/store workflows are separate.                        |

## Intentional distinctions

Text and score are two presentations; chord is an optional shared layer, not a
third presentation. The minimized MIDI tab restores controls rather than adding
three always-visible edge buttons. TTS preserves its distinct source context.
No track mute/solo is added beyond canonical scope. App copy/context suppression
is an immersive interaction, not content/credential access control.

The e-GYS v2 generated snapshot is discovery-only. Do not restore its polling/
exchange routes into the active v1 adapter. Official provider/messaging windows
are expected; an application login overlay, manual WhatsApp OTP or extra send
button is not part of the current browser flow.

GA remains gated on actual signed/platform/device/provider evidence and the
canonical performance comparison. See [release readiness](../release-readiness.md),
[cache reference](../cache-and-preload.md) and [testing](../testing-and-maintenance.md).
