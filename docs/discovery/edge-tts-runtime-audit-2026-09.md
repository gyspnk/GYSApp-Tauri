# Edge TTS runtime audit — September 2026

> Historical plan/audit/receipt. Its dates, measurements and acceptance scope
> remain attached to the original revision. Current behavior and outstanding
> delivery gates were reviewed on 2026-10-07; use the [documentation index](../README.md)
> and [current feature matrix](feature-parity-matrix.md) for the present implementation.

**Audit date:** 2026-09-28
**Upstream application reference:**
`gyspnk/gyschordweb@e8e7efe1189b5746a2bb542348e221844091c8d1`

## Runtime and provider

| Runtime                                          | Provider/transport                                                                         | Result                                                                                                                                                                                                                                  |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows Tauri release executable (`--no-bundle`) | Direct keyless Edge-compatible WebSocket through `@tauri-apps/plugin-websocket`            | Isolated packaged smoke on 2026-09-28: Gadis receives/plays 33,984 bytes; abort, local Andika, pause/resume/stop/repeat pass. Home ready 64ms, Bible ready 844ms, broad search 441ms/1,500ms budget. Signed installer remains untested. |
| Node live protocol smoke                         | Test-only Node WebSocket transport calling the same synthesizer/protocol implementation    | Passed on 2026-09-28: 17,568 audio bytes in 746ms                                                                                                                                                                                       |
| Browser/PWA                                      | Configured gateway if present; otherwise system speech for Auto or an explicit local voice | Direct Edge is intentionally unavailable because a browser cannot set the compatibility headers used by the service                                                                                                                     |
| Signed Windows installer                         | Not exercised                                                                              | The `--no-bundle` release executable proves its packaged WebView runtime, not signed installer installation, upgrade, or signing behavior.                                                                                              |

The 2026-09-24 manual release run opened `/bible` with the optional gateway
blank, advanced chapter playback, exercised pause/resume/stop, and selected
Ardi. The WebView2 diagnostic journal recorded matching positive receive/play
records, including 52,128 bytes. On 2026-09-25, the packaged Playwright/CDP
smoke used an isolated WebView2 profile, started Ardi synthesis, stopped after
the receive diagnostic, and confirmed abort. It then changed the voice to
Gadis (`id-ID-GadisNeural`), verified the provider selection and matching
non-zero receive/play diagnostics (33,984 bytes), and exercised pause, resume,
stop, and a same-voice repeat request with new non-zero receive/play records.
Manual Computer Use on the Bible reader also confirmed pause and a return to
idle after Stop. The provider rejects zero-byte audio before playback. Neither
run establishes signed-installer installation or upgrade. On 2026-09-26, the
source worktree rebuilt `gysapp-native.exe` with `tauri build --no-bundle` and
reran `test:e2e:native-edge` in an isolated WebView2 profile. Direct Edge again
received and played 33,984 bytes with `id-ID-GadisNeural`; abort, pause/resume,
stop, and repeated synthesis passed. The packaged Bible search returned 40 then
80 results in 400ms, below the 1,500ms target. A new packaged run on
2026-09-27 verifies Home failure/retry/recovery and the same keyless TTS
behavior; Faith PDF page-progress was skipped because no BFF base was
configured. This does not prove signed installer installation or upgrade.

The 2026-09-28 full packaged Tauri/WebView2 run repeated keyless Edge synthesis
with `EDGE_TTS_URL` unset and passed abort, `id-ID-GadisNeural`, local
Microsoft Andika, 33,984 received and played bytes, pause/resume/stop, and
repeat synthesis. It also passed the Bible broad-search budget at 441ms
(40→80 results). The same isolated executable completed offline shell/content
checks and the full FluidSynth queue and restart smoke. Faith PDF page-progress
was skipped because no BFF base was configured. No signed installer or real
installed-OS-voice matrix was exercised.

## Connection and handshake

| Item                    | Current implementation                                                                                                                  | Evidence/limit                                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Endpoint                | `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1`                                                           | `apps/web/src/edge-direct.ts`                                                                                |
| Authentication          | No user API key; public Edge-compatible trusted-client token and time-window `Sec-MS-GEC` value are sent in the URL                     | No gateway secret is required for the direct Tauri path. The service protocol is undocumented and may drift. |
| Version                 | Current configured `Sec-MS-GEC-Version` is `1-143.0.3650.75`                                                                            | Accepted by the live Node smoke on the audit date; this value is not treated as permanent.                   |
| Request identity        | 32-hex request and connection IDs; uppercase MUID cookie value                                                                          | Generated per synthesis request                                                                              |
| Compatibility headers   | Edge-like User-Agent, Accept-Language/Encoding, cache directives, Origin, and `Cookie: MUID=…`                                          | Supplied through the Tauri plugin connection config; never exposed as an API key                             |
| Transport message types | Explicitly maps plugin `Text`, `Binary`, `Ping`, `Pong`, and `Close`; send/disconnect failures become typed errors                      | `TauriEdgeSocketAdapter`; avoids casting the plugin API to browser `WebSocket`                               |
| Audio frame             | Two-byte big-endian header length, text headers containing `Path:audio`, then MP3 payload                                               | `parseEdgeAudioFrame` ignores non-audio frames and rejects malformed/empty payloads                          |
| Synthesis config        | `audio-24khz-48kbitrate-mono-mp3`; sentence/word boundary metadata disabled                                                             | `buildEdgeSpeechConfig`                                                                                      |
| SSML                    | W3C synthesis namespace, escaped text/voice, language from voice ID, rate/pitch/volume prosody, request ID, UTC timestamp ending in `Z` | `buildEdgeSsml`; synthetic/unit tests cover framing and escaping                                             |

## Failure, root cause, and fix

The native Tauri plugin exposes a typed message union and its own async send,
connect, and disconnect methods. The previous direct transport assumed the
browser `WebSocket` event/data shape, used an unsafe cast, and did not map the
plugin frames into the synthesizer's expected text/binary protocol. Protocol
compatibility also depends on the Edge SSML namespace and timestamp format.

The implementation now uses an explicit plugin adapter; constructs the
current Edge request headers, time token, SSML and binary frame; checks aborts
after token generation and connection; records stage diagnostics; and rejects
empty audio before playback. The adapter remains small and specific to the one
installed Tauri WebSocket plugin.

## Audio and fallback behavior

- `edge-speech.ts` requires `blob.size > 0`, creates/cleans an object URL, and
  starts an `HTMLAudioElement` only after synthesis succeeds.
- `auto` tries Edge, then falls back to available system speech on transient
  failure. Explicit Edge reports the error rather than silently changing the
  selected engine. Explicit local TTS does not use the Edge network path.
- Browser/PWA Auto uses system speech because the direct Edge request needs
  headers unavailable to web pages. A configured same-origin gateway remains
  available where an operator supplies it.
- Provider, socket, framing, fallback, and local-only behavior have focused
  unit coverage in `edge-direct.test.ts`, `platform.test.ts`,
  `speech-player.test.ts`, and `speech-settings.test.ts`.

## Monitoring and remaining proof

`.github/workflows/edge-tts-live.yml` runs the keyless Node protocol smoke;
`.github/workflows/edge-tts-native.yml` adds the packaged WebView2 smoke on a
daily schedule, manually, and on relevant pull requests. Both scheduled runs
start only after their workflows are present on the default branch. The native
smoke passed locally; the scheduled workflow has not yet run from the default
branch.

The browser E2E matrix now covers the fallback boundary with deterministic
Web Speech voices: Auto selects the available system voice when direct Edge is
unavailable, while explicit Local selects only a local voice. It also caught
and fixed a dock label that reported the browser provider's aggregate offline
capability instead of the active voice. This does not replace a matrix against
real OS-installed voices. Signed installer installation/upgrade and that live
voice matrix remain open. There is no in-app diagnostic export; byte counts are
read from the local WebView2 diagnostic journal. No API key or user credential
is needed for the direct Tauri path.
