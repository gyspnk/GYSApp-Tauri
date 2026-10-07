# Native shell

Reviewed 2026-10-07; see [the documentation index](../../docs/README.md).

This package owns the Tauri 2.11 shell and platform adapters. The feature
domain stays in the shared packages; native commands are kept narrow so the
same platform contract suite can run against web and native implementations.

The package scripts execute real Rust checks (`cargo check`, `cargo test`,
`cargo fmt`, and `cargo clippy`). Builds requiring Android/iOS toolchains or
signing material remain platform CI responsibilities; this boundary does not
claim store readiness until those artifacts are produced and verified.

The Tauri bridge owns the binary/blob boundary used by the shared platform
services. Typed key-value records and chord/media blobs are stored below the
platform app-data directory; writes use a unique temporary file followed by an
atomic rename, and keys are hex-encoded so user input cannot escape that
directory. The checked-in `capabilities/default.json` grants only dialog,
deep-link, app-scoped filesystem, notification, shell-open, and core access to
the main window; it deliberately does not expose the keyring plugin's raw
frontend commands. OS credentials use the keyring plugin (Windows Credential Manager,
macOS/iOS Keychain, Linux Secret Service, or Android Keystore), while native
dialogs/filesystem access, notifications, lifecycle events, and deep-link
registration are wired through Tauri plugins. External links are restricted to
`http`/`https` and handed to the OS through the allowlisted shell opener. The
webview enables the Tauri global invoke bridge so the frontend selects this
adapter automatically instead of falling back to browser storage.

## Shared UI, offline startup and account boundary

The packaged shell uses the same responsive Bible picker, PDF fit/zoom/pan,
compact persistent MIDI and Church-blue theme as the browser application.
TimGM and local synthesis/PDF assets ship with the verified frontend; GeneralUser
remains optional. `verify:native-assets` checks the actual package set.

Native deliberately skips browser PWA registration and retires only its own
legacy workers, avoiding blank/stale shell startup. Packaged first paint, actual
OS audio focus and signed installation/upgrade remain separate test scopes.

Google/WhatsApp/Apple controls invoke the allowlisted official e-GYS v1 login
WebView. Only the official origin and three logged-in commands with a valid
opaque token may reach keyring storage; profile normalization uses the BFF.
Browser direct callbacks/HttpOnly cookies are a different adapter path. The v2
contract snapshot is discovery-only. See [account integration](../../docs/egys-integration.md)
and [operations](../../docs/operations.md) for protected prerequisites.
