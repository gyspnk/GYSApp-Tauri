# Native shell

Reviewed 2026-10-08; see [the documentation index](../../docs/README.md).

This package owns the Tauri 2.11 shell and platform adapters. The feature
domain stays in the shared packages; native commands are kept narrow so the
same platform contract suite can run against web and native implementations.

The package scripts execute real Rust checks (`cargo check`, `cargo test`,
`cargo fmt`, and `cargo clippy`). Builds requiring Android/iOS toolchains or
signing material remain platform CI responsibilities; this boundary does not
claim store readiness until those artifacts are produced and verified.

## Compact release builds

Windows and Android share the Rust release profile: size-oriented optimization
(`opt-level = "z"`), whole-program LTO, one code-generation unit and stripped
symbols. Panic unwinding and all plugins remain enabled. LTO increases build
time; it does not add runtime loading work. NSIS retains solid LZMA with a
64 MiB compression dictionary through a small installer hook. The dictionary
affects installer compression/extraction memory, not running-app memory.

Run `pnpm --filter @gys/native tauri android init --ci` before the first Android
bundle, then `pnpm --filter @gys/native bundle:android`. The preview preparation
script augments the generated Gradle project without replacing Tauri's ProGuard
or plugin consumer rules. Release builds enable R8/resource shrinking and use
the Android debug identity only for preview signing. They are non-debuggable;
the workflow verifies that flag and the APK signature. This identity is not a
stable production upgrade key. For production, use the owner's protected
keystore with the normal release command, without the preview preparation step.

Preview JNI libraries use DEFLATE instead of being stored uncompressed in the
APK. Android extracts the byte-identical library once at installation; the
smaller download uses additional installed disk space compared with mapping an
uncompressed library directly from the APK. ARM64 ELF segments are aligned for
both 4 KiB and 16 KiB devices. No executable packer or startup self-extraction is
introduced.

Both packaging workflows verify offline assets after building and record exact
installer/APK bytes in provenance. Bible data, ten faith PDFs, local TimGM,
fonts, MIDI/PDF engines and offline catalogs remain packaged. Do not remove
these to reach a smaller download number.

The published `v0.1.0-preview.20261008` baseline is 224,979,531 bytes for ARM64
Android and 37,749,587 bytes for Windows NSIS. Its Android native library alone
is 217,064,992 bytes; removing only debug/symbol metadata in a local audit makes
it 63,141,624 bytes, with allocated section bytes unchanged. This is an isolated
library comparison, not a rebuilt or signed APK result. Final release-profile
sizes and platform acceptance still require the platform packaging/QA jobs.

The subsequent local audit produced a signed, non-debuggable ARM64 APK of
36,273,975 bytes and a cross-built Windows NSIS installer of 33,621,057 bytes.
These are local size/structural evidence, not published artifacts or physical
device acceptance. See [the repeated size audit](../../docs/performance/2026-10-08-native-size.md)
for candidate comparisons, asset parity and remaining native QA.

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
