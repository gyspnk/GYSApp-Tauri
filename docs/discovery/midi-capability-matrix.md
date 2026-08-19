# MIDI capability matrix

| Capability | Required behavior                                              | Verification                    |
| ---------- | -------------------------------------------------------------- | ------------------------------- |
| Transport  | play/pause/resume/stop/seek, duration and position             | Golden + browser behavior tests |
| Sound      | volume/mute, tempo 30–220, transpose, 128 GM programs          | Parser/audio contract tests     |
| Assets     | GeneralUser installed on demand and verified before activation | Cache/network proof             |
| Session    | preloading, previous/next, playlist CRUD/import/export/reorder | Component + integration tests   |
| Modes      | loop, shuffle, auto-next                                       | State-machine tests             |
| Platform   | Media Session, wake lock, mobile bridge                        | Capability tests/adapters       |
| Boundary   | Web Audio clock, external position store ~4 Hz                 | Performance fixture             |

Track mute/solo is not part of the canonical behavior and will not be added.
