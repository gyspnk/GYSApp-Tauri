# ADR 0007 — Platform boundary

Status: accepted

Features depend on `PlatformServices`, not browser/Tauri globals. Adapters
provide capability detection, key/value, database, atomic blobs, secret store,
notifications, dialogs/share, external links, speech, deep links, and lifecycle.
The same contract suite runs against web and native implementations.

The web adapter provides IndexedDB/Cache Storage, browser notifications,
sharing, file dialogs, deep-link/lifecycle events, and detected speech. Its
secret interface is explicitly ephemeral and is not a credential store. The
Tauri adapter provides native app-data persistence and WebView lifecycle,
notification, and sharing; it reports file-dialog, deep-link, and secure
secret capabilities as unavailable until their native bridges are wired.
Stronghold/OS credentials, SQLite-backed repositories, and mobile file/deep-
link bridges remain release blockers rather than silently falling back to
browser storage.
