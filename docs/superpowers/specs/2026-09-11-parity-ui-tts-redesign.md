# GYSApp parity, TTS, media, and shell redesign

## Purpose

Bring `GYSApp-Tauri` to current behavioral parity with the parts of `gyspnk/gyschordweb` it intentionally consumes, repair Edge-compatible TTS so it has a useful no-key path, and redesign the application shell/media controls so they feel deliberate on desktop and mobile without replacing the product with a generic dashboard skin.

## Product direction

**Concept:** a quiet, instrument-like worship reader: content is primary, controls feel like precise hardware controls, and navigation recedes when it is not needed.

The product is a Bible, hymn, chord, MIDI, and church-reading application. Its main users read, sing, rehearse, or present content rather than manage abstract dashboard data. The UI therefore prioritizes legibility, reliable transport controls, fast route changes, and compact contextual actions.

### Visual language

- Keep the existing user-selectable light, dark, AMOLED, sepia, and accent themes.
- Use flatter surfaces, restrained borders, and small-radius control groups. Avoid generic bento-card composition, decorative gradients, glass-on-everything, oversized pills, and oversized empty hero regions.
- Reserve the configured accent for active/primary state. Do not use a second competing blue visual system when a user accent already exists.
- Use the existing system/body typography and hymn display typography where already established; do not add a new font dependency just for redesign.
- Favor 8–14 px radii for controls and panels; reserve larger radius only for a genuinely floating media surface.
- Keep readable touch targets at 44 px minimum on touch/mobile surfaces.

### Motion language

- Motion explains state: sidebar width, active-navigation position, player expand/collapse, popover appearance, and route-context handoff.
- Default state transitions are 160–240 ms using a non-bouncy ease-out curve.
- Prefer `transform` and `opacity`; avoid decorative continuous motion and layout thrash.
- `prefers-reduced-motion: reduce` removes nonessential transitions/animations and keeps state changes immediate.

## 1. Upstream parity contract

The parity source for this work is `gyspnk/gyschordweb@a9bf3219105dca3dde1b286328f46a0eede3287e` (2026-09-05).

Parity is behavioral and data-contract parity, not pixel cloning. GYSApp may retain stronger architecture or controls where it already exceeds the reference.

The latest source changes after the previously documented `728c93cc` include new note-aligned chord assets for hymn 271 and hymns 108, 196, and 492 plus regenerated upstream manifests. The GYSApp music/chord lock must include these canonical resources and must no longer describe `728c93cc` as current.

A parity claim is valid only when:

1. canonical source commit is recorded;
2. generated lock/manifest includes all current canonical chord files;
3. the chord audit has no missing, orphaned, or invalid canonical mappings;
4. affected Kidung behavior is exercised by unit/E2E tests;
5. the parity matrix distinguishes verified behavior from device-only evidence still unavailable in CI.

Do not claim that every possible device-specific behavior is bug-free when it has not been exercised.

## 2. Edge-compatible TTS

### Current root cause

`EdgeSpeechProvider` currently has no execution path without `VITE_EDGE_TTS_URL`, a custom endpoint, or a configured same-origin BFF endpoint. The BFF itself also returns `UPSTREAM_UNAVAILABLE` when its Edge upstream is absent. The Tauri shell has no native TTS command. Therefore the current UI may advertise Edge-compatible voices while no no-key synthesis transport exists.

### Required behavior

- Keep the configured custom/BFF gateway as the preferred, stable transport when present.
- Add a no-API-key **direct Edge-compatible online transport** that is used only when no configured gateway exists and the runtime supports the required WebSocket primitives.
- Direct mode is explicitly online-only (`offline: false`). Never label it offline or local.
- No API key, account credential, or app secret is required or stored for direct mode.
- Speech text is sent to the remote Microsoft Edge read-aloud compatibility service for synthesis. The app must communicate this accurately in settings/help copy.
- Direct transport must be isolated in a focused module with injectable clock/socket dependencies so framing and error handling are unit-testable without live service access.
- A transient Edge service/protocol failure must not poison future attempts. The speech orchestrator may fall back to detected system speech when available.
- Abort/stop must close the active transport and release audio object URLs exactly once.
- Existing configured-gateway behavior remains backward compatible.

Because the Edge read-aloud endpoint is an undocumented compatibility surface, live-service failure must produce a recoverable message rather than a permanent unsupported state.

## 3. Persistent global media surface

The application already has one global MIDI/TTS media state. Preserve that architecture.

### Expanded state

- Present as a compact bottom-centered dock on desktop/tablet when no explicit user drag position is active; on phone it sits above bottom navigation and safe-area inset.
- Show source context first, then transport, then secondary controls. Do not make every control visually equal.
- Kidung retains seek, queue/auto-next, loop, instrument, transpose/key/accidental, tempo, volume/mute, and navigation back to the active hymn.
- Speech retains source context, play/pause/resume/stop, progress when available, rate/voice controls where already supported, and navigation back to the verse/source.
- Popovers open within viewport bounds and are not clipped by the dock.

### Minimized state

- Minimize is a first-class state, not merely `display:none`.
- The minimized dock contains source icon/context, short title, primary play/pause state, and a clear restore control.
- Replace raw text glyph controls such as `↗` and `−` with the existing SVG icon system or CSS-drawn semantic icons.
- Minimize state persists across routes and reloads using the existing preference key.
- Expanding/minimizing does not interrupt active audio.
- On mobile the minimized dock must not cover bottom navigation or essential reader controls.

### Dragging

Desktop dragging may remain, but the default placement must be deterministic. A persisted drag position is clamped to the current viewport on load/resize. Mobile does not require drag and should prioritize a stable bottom dock.

## 4. Desktop sidebar collapse

Add a user-controlled sidebar rail state for wide desktop viewports.

- Expanded width remains approximately the current desktop width.
- Collapsed width is an icon rail large enough for 44 px controls.
- A visible edge toggle remains reachable in both states and has `aria-expanded`, tooltip/title, keyboard focus, and an explicit accessible label.
- Collapse preference persists locally.
- Width, label opacity, active indicator, and toggle position animate as one coordinated state.
- At existing tablet/mobile breakpoints the product continues to use its automatic rail/bottom-nav compositions; the desktop preference must not break them.
- Navigation labels may visually disappear in collapsed state, but their accessible names remain.

## 5. Anti-AI-slop shell refinement

The redesign is not a blanket restyle. It targets repeated generated-UI symptoms:

- reduce excessive nested cards and shadows where a divider or whitespace is enough;
- make buttons use a small set of roles: primary, secondary, icon, destructive, segmented;
- normalize control heights and icon optical sizes;
- remove decorative hover lift from controls where it does not communicate state;
- keep content widths appropriate to reading rather than dashboard tiles;
- use density to expose more useful hymn/Bible content above the fold;
- ensure desktop and mobile are designed as distinct compositions rather than scaled copies.

The existing routes and feature semantics stay intact unless a parity/root-cause test requires a behavior change.

## 6. Efficiency and architecture

- Do not add a general animation library.
- Do not add a UI framework.
- Prefer one small shell state module/component and one focused direct-TTS transport module over expanding `App.tsx` further.
- Keep new CSS in a focused shell/media refinement stylesheet imported after the legacy stylesheet, then remove obsolete duplicate rules when safe rather than proliferating permanent overrides.
- Avoid JavaScript geometry calculations when CSS responsive layout can express the behavior.
- Do not eagerly load direct-TTS protocol code until speech uses it if code splitting remains straightforward.
- All new state subscriptions/listeners must be cleaned up.

## 7. Verification

Each behavioral change follows red-green-refactor.

Required automated gates:

- unit tests for direct TTS protocol framing, transport selection, abort, and transient failure;
- unit/component test for sidebar preference state where practical;
- Playwright desktop tests for expand/collapse geometry and keyboard accessibility;
- Playwright phone/tablet tests for bottom navigation plus media-dock non-overlap and minimize/restore;
- existing media/Kidung/navigation suites;
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, bundle budget, generated/docs verification;
- native `cargo check`, `cargo test`, formatting, and clippy via the existing Windows CI gate.

Visual review should cover at least 390×844, 768×1024, 1440×900, light and dark themes, expanded/minimized media, and expanded/collapsed desktop sidebar. CI screenshots are preferred where the existing Playwright setup supports them.

## Non-goals

- Pixel-for-pixel reproduction of gyschordweb.
- Replacing the existing domain/media architecture with upstream global JavaScript.
- Promising true offline Edge neural TTS; system/offline voices remain the offline path where a platform provides them.
- Redesigning church content itself or altering canonical hymn lyrics.
