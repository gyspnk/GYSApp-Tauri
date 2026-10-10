# MIDI capability matrix

Reviewed 2026-10-10; current player is `media-surface.tsx` with musical controls
in `midi-music-controls.tsx` and final styling in `midi-player.css`.

| Capability       | Implemented contract                                                                                                     | Verification / remaining gate                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Transport        | Play/pause/resume/stop, seek/time and previous/next song; one scrub update on release.                                   | Player/transport units, real MIDI and scrub browser tests.                             |
| Musical state    | 128 GM programs from the active SoundFont, default piano (0), key, −24…+24 transpose, reset, volume/mute, tempo 30–220.  | Keyboard selection and actual transpose/render identity; device audio quality remains. |
| Bank             | Packaged TimGM default; GeneralUser downloaded/verified on demand.                                                       | SoundFont lock/native asset checks and cache tests.                                    |
| Raw/model/render | Shared immutable loader, parsed model, setting-aware PCM/AudioBuffer LRU (128 MiB default).                              | Cache/reuse/stale generation tests; canonical hardware p50/p95 gate remains separate.  |
| Preload          | Neighbor renders only after active playback, with same tempo/transpose/instrument; foreground priority and cancellation. | Playback-cache/preload regressions; text-only entry asserts no binary/audio work.      |
| Expanded UI      | Two tablet/desktop rows, three phone rows; 36 px mouse/40 px touch, visible instrument/key/transpose.                    | 320/390/768/1440 px geometry, themes and Axe.                                          |
| Edge tab         | One half-circle flush left/right; tap restores, pointer/touch drag or keyboard moves; animated equalizer.                | Real touch tap/drag, fullscreen/cross-route/scroll persistence and reduced motion.     |
| Utility/queue    | Secondary menu, playlist CRUD/import/export/reorder, loop/shuffle/auto-next.                                             | State/playlist tests and cross-route preferences.                                      |
| Platform         | Web Audio clock, isolated ~4 Hz position store, Media Session/wake-lock and speech handoff.                              | Browser/native capability tests; physical OS media/audio-focus matrix remains.         |
| Compatibility    | SoundFont/FluidSynth required; missing/corrupt active bank or unavailable synthesis reports an error.                    | Real PCM and failure-state tests; physical device audio remains.                       |

Track mute/solo is outside the canonical behavior. Showing the player does not
start audio; the user's Play gesture authorizes playback. Minimize preserves the
active session; closing terminates it. See [ADR 0004](../adr/0004-midi.md) and
[the user guide](../user-guide.md).
