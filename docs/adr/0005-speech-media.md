# ADR 0005 — Speech and global media

Status: accepted

`MediaCoordinator` permits one audible session. Starting TTS pauses MIDI and
starting MIDI pauses TTS; the previous session does not auto-resume. Edge
compatibility speech is online-only and must fall back to a detected local
provider. The web adapter exposes a configured Edge-compatible audio gateway
through `POST /api/v1/tts/edge` (no client key) and detected browser/system
voices; `auto` tries Edge first and falls back when the gateway is unavailable
or rejects a request. The gateway binding is optional and protected. Native OS
voice bridges remain platform work. The web reader only lists Edge voices when
the optional validated `GET /api/v1/tts/edge/voices` catalog is available; the
configured default voice remains a transport concern. Reader rate, pitch, and
volume preferences persist locally without leaving the device.
