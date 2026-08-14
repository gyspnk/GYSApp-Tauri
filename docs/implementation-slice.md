# Initial implementation slice

Commit `675a5f2` is the clean-room bootstrap. This branch keeps the first
Preview slice reviewable and deployable:

- public MIT monorepo with explicit package builds and a generated lockfile;
- Zod contracts for upstream locks, chords, Bible/catalog/content, profiles,
  errors, backups, and platform services;
- TDD-backed memory chord cache/repository integrity checks, MIDI normalization,
  Bible search state, AES-GCM backup/legacy import boundary, speech fallback,
  media coordinator, and memory platform contract fixture;
- Quiet Sanctuary responsive shell with five routes, id/en/zh, light/dark/system,
  offline status, PWA shell, local GYS logo, persistent media surface, and
  accessible focus/44px controls;
- Browser TB reader/search projection generated from the canonical 66-book,
  31,172-verse SQLite pack, a 533-item hymn catalog with ordered search,
  transpose/lyrics/PDF entry points, ten multilingual faith topics with
  notes/share, and local pack integrity manifests;
- PDF.js is lazy-loaded with a local worker; MIDI transport now renders through
  a same-origin FluidSynth WASM worker using the offline TimGM pack (with an
  explicit Web Audio compatibility backend), and the minimized shell player
  exposes seek/volume/mute/tempo/transpose, Media Session, and wake-lock
  controls. MIDI transport, render cache, and playlist state machines remain
  covered by domain tests; the BFF serves a generated 140-entry chord manifest
  with sanitization and typed report input;
- Hono Worker route skeleton with origin/CORS/CSRF posture, CSP, rate limiting,
  ETags/cache headers, schema validation, structured errors, auth/profile/report
  boundaries;
- Tauri 2.11 native shell that passes Windows `cargo check`;
- generated 533-item hymn catalog, 1,208-entry immutable music lock, TB/TimGM
  offline binaries, and Playwright smoke coverage.

The feature-parity matrix remains explicit about the next Beta work: real
Web-Audio/FluidSynth MIDI output and benchmarks, chord content fetch/pinning
diagnostics, TTS range presentation/provider adapters, Bible pericopes/split
versions, account OAuth, and cross-platform artifact pipelines.
