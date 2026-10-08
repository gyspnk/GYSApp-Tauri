# Android insets and credential startup — 2026-10-08

Source: main baseline `5a32f6483065453a0070ae86cc7ddd7d22dce9e5` plus the
Android shell implementation in commit `03e80a66`. The follow-up authorizes commit/push to main and GitHub Actions validation.
Local runtime observations below remain distinct from the new accelerated
Android 17 smoke job.

## Investigation and implementation

The generated Activity enabled edge-to-edge without applying system-bar/cutout
insets to the native content host. The tracked Activity now applies the union of
visible system bars and display cutout, with the maximum of keyboard/navigation
bottom insets, and consumes the insets at the host.

Entering Lainnya requests the account profile. Native requests first invoke
`secret_get`. The Android keyring backend then calls
`ndk_context::android_context()`, whose getter panics when uninitialized. The
pinned Wry/Tao shell does not initialize that separate context. Initialize it
before Tauri starts using a retained application `GlobalRef`; Activity recreation
reuses the reference. Credential commands also reject an unavailable context
before entering the backend.

Install the tracked Activity and JNI keep rules through the existing Android
configuration step; generated Android files are ignored by Git. Original plugin
ProGuard rules and release optimizations are preserved.

## Verified locally

- ARM64 Android Rust check passed with NDK 27.2.12479018.
- Release Kotlin compilation passed.
- Full `tauri android build --apk --target aarch64 --ci` passed, including R8.
- JNI entry point exists in the optimized native library; the Activity class name
  is retained in the R8 mapping.
- APK signing verification passed. Packaging verifier passed: ARM64, compressed
  JNI, 16 KiB ELF alignment, 36,276,627 bytes.
- Configuration installation/idempotence and documentation tests: 5 passed.
- Packaging verifier tests: 3 passed.
- Browser regression selection (native shell startup, device data and e-GYS v1):
  21 passed, no retries. These use browser fixtures, not a native Android runtime.
- Formatting, documentation and diff checks passed.

## Native acceptance remains unverified

The available host has neither an attached Android device nor KVM. A software
emulator was installed with checksum-verified Android 17/API 37.0 Google APIs
x86_64 image revision 6, supporting ARM64 native translation. The system repeatedly
restarted before GYSApp could be installed. Logcat recorded:

```text
WATCHDOG KILLING SYSTEM PROCESS: Blocked in handler on main thread (main) for 62s
```

Increasing the emulator's watchdog timeout to 600000 ms did not produce a stable
runtime. Boot/install attempts and screenshots of the empty emulator are not app
acceptance evidence. Neither old-app crash reproduction, native inset geometry,
rotation, navigation mode changes nor native screenshots are claimed as passed.
No app performance conclusion can be drawn from this software-emulation attempt.
The built APK retains normal application configuration; the watchdog setting was
only an emulator setting.

On an Android 17 device or an accelerated emulator, verify cold Home startup,
opening/reopening Lainnya, Activity recreation, portrait/landscape, display
cutouts, gesture/three-button navigation and keyboard open/close. Confirm no
native panic/abort in logcat and no controls beneath system bars.

## GitHub Actions evidence

[CI run 37774500209](https://github.com/gyspnk/GYSApp-Tauri/actions/runs/37774500209)
passed build, unit/type/structural checks, native desktop compilation, secret scan
and all browser regression shards for the application patch.
[Android package run 37774659956](https://github.com/gyspnk/GYSApp-Tauri/actions/runs/37774659956)
built and verified a signed release-profile ARM64 preview APK: 36,277,727 bytes,
compressed JNI and 16 KiB ELF alignment. Its package job succeeded; its first
runtime job failed before app launch because the emulator could not find the AVD.

The reusable `android-runtime.yml` workflow can test that same APK artifact without
rebuilding it. Generated AVD paths are explicit, storage is sufficient, and the
user must be unlocked before resolving a credential-protected launcher. API 37
uses the current preview emulator. Android 16 is available as a comparison input.

Both Google images exposed a SurfaceFlinger/Goldfish mapper assertion before app
installation: `!rcEnc->featureInfo()->hasReadColorBufferDma`. Emulator feature
flags did not prevent it. The smoke harness disables `debug.sf.luma_sampling` and
restarts the disposable userdebug emulator framework before installing the app;
this is a test-environment workaround, never an APK configuration change. System
adaptive luminance sampling is therefore outside this test's acceptance scope.

[Android 17 runtime run 37782899001](https://github.com/gyspnk/GYSApp-Tauri/actions/runs/37782899001)
then opened Home and Lainnya, retained the app process after the account credential
read, and passed portrait, three-button, gesture and simulated-cutout safe-viewport
checks. That run remained red: the landscape UiAutomator dump was not valid XML.
The harness now uses unique dump paths and bounded retries for transient dump
failures so an old portrait snapshot cannot stand in for a landscape capture.
Rotation and cold restart acceptance still require a successful follow-up run.
