import { recordDiagnostic } from "./diagnostics.js";
import { clearPlatformStorage } from "./platform.js";

export async function clearAppData() {
  await import("./chords.js").then((module) =>
    module.stopChordSynchronization(),
  );
  let resetError: unknown;
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("gys-")) localStorage.removeItem(key);
    }
  } catch (error) {
    resetError = error;
    recordDiagnostic("warn", "storage.reset.local", error);
  }
  try {
    await clearPlatformStorage();
  } catch (error) {
    // A private browser or a native storage permission failure must be
    // surfaced to the action handler instead of being reported as success.
    resetError ??= error;
    recordDiagnostic("warn", "storage.reset", error);
  }
  if (resetError) throw resetError;
}
