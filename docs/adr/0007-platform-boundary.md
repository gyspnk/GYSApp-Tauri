# ADR 0007 — Platform boundary

Status: accepted

Features depend on `PlatformServices`, not browser/Tauri globals. Adapters
provide capability detection, key/value, database, atomic blobs, secret store,
notifications, dialogs/share, external links, speech, deep links, and lifecycle.
The same contract suite runs against web and native implementations.

The web Preview provides localStorage/Cache Storage adapters and a browser
speech provider with capability detection. Native persistence, Stronghold/OS
credentials, and mobile bridges remain in the Tauri hardening milestone.
