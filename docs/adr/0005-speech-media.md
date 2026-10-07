# ADR 0005 — Speech and global media

Status: accepted

`MediaCoordinator` permits one audible session. Starting TTS pauses MIDI and
starting MIDI pauses TTS; the previous session does not auto-resume. Edge
compatibility speech is online-only and must fall back to a detected local
provider. The web adapter exposes a configured Edge-compatible audio gateway
through `POST /api/v1/tts/edge` (no client key) and detected browser/system
voices; `auto` tries Edge first and falls back when the gateway is unavailable
or rejects a request. The gateway binding is optional and protected. Native speech capabilities use their platform adapters and retain separate
device acceptance gates. The web reader only lists Edge voices when
the optional validated `GET /api/v1/tts/edge/voices` catalog is available; the
configured default voice remains a transport concern. Reader rate, pitch, and
volume preferences persist locally without leaving the device.

The shell-level media surface also owns source context. Bible queue items carry
an internal `/bible#bible-verse-*` location and hymn sessions resolve to the
internal Kidung route, so expanded source actions return to the active source without restarting
playback. TTS retains its bounded minimized title/progress summary; MIDI uses
a compact edge tab that restores controls; pointer positions are clamped to the current
viewport. Media Session callbacks read external-store refs rather than being
reinstalled on each 4 Hz position update.

## Implementation review — 2026-10-07

Browser gateway/system voices and native Edge/system transports are separate
capabilities. Native Edge compatibility has historical packaged smoke evidence;
current platform/voice/account availability must still be checked. The blanket
statement that native voice bridges are wholly future work no longer describes
the implemented adapters. [The runtime audit](../discovery/edge-tts-runtime-audit-2026-09.md)
retains the exact historical results.

MIDI minimize now leaves one half-circle that restores its controls, rather
than a title/progress summary. TTS retains its source-aware dock. Expanded
source navigation, speech/MIDI ownership, viewport bounds and external-store
Media Session callbacks remain accepted behavior. See [architecture](../architecture.md).
