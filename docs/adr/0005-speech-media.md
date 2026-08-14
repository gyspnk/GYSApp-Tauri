# ADR 0005 — Speech and global media

Status: accepted

`MediaCoordinator` permits one audible session. Starting TTS pauses MIDI and
starting MIDI pauses TTS; the previous session does not auto-resume. Edge
compatibility speech is online-only and must fall back to a detected local
provider.
