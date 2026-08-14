# Native shell

This package owns the Tauri 2.11 shell and platform adapters. The feature
domain stays in the shared packages; native commands are kept narrow so the
same platform contract suite can run against web and native implementations.

The package scripts execute real Rust checks (`cargo check`, `cargo test`,
`cargo fmt`, and `cargo clippy`). Builds requiring Android/iOS toolchains or
signing material remain platform CI responsibilities; this boundary does not
claim store readiness until those artifacts are produced and verified.
