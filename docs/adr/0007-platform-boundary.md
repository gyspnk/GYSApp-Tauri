# ADR 0007 — Platform boundary

Status: accepted

Features depend on `PlatformServices`, not browser/Tauri globals. Adapters
provide capability detection, key/value, database, atomic blobs, secret store,
notifications, dialogs/share, external links, speech, deep links, and lifecycle.
The same contract suite runs against web and native implementations.

The web adapter provides IndexedDB/Cache Storage, browser notifications,
sharing, file dialogs, deep-link/lifecycle events, and detected speech. Its
secret interface is explicitly ephemeral and is not a credential store. The
Tauri adapter provides native app-data persistence, SQLite, OS credentials
through the keyring plugin, native dialogs/filesystem access, notifications,
WebView lifecycle, and deep-link registration. A locked or unavailable OS
credential store remains an actionable runtime error; the adapter never falls
back to browser storage.

## Implementation review — 2026-10-07

Tauri ships the shared compact reader/player UI, local TimGM/PDF/audio assets,
and an official v1 login WebView/keyring boundary. Browser/PWA uses direct BFF
Google/Apple/WhatsApp callbacks and HttpOnly session. Native deliberately does
not register the browser PWA worker; legacy owned registrations are retired.
Physical OS media/audio-focus, signing and real-account tests remain explicit
platform gates. [Native shell](../../apps/native/README.md) documents ownership.
