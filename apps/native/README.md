# Native shell

This package owns the Tauri 2.11 shell and platform adapters. The feature
domain stays in the shared packages; native commands are kept narrow so the
same platform contract suite can run against web and native implementations.

Builds requiring Rust, Android, iOS, or signing material run in their platform
CI jobs. The Windows workspace keeps the configuration and command boundary
ready without claiming mobile/store readiness.
