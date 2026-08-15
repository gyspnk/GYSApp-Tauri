# Native shell

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
directory. External links are restricted to `http`/`https` and handed to the
OS through the allowlisted shell opener. The webview enables the Tauri global
invoke bridge so the frontend selects this adapter automatically instead of
falling back to browser storage.
