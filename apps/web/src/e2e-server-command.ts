const PREVIEW_COMMAND = "pnpm exec vite preview --host 127.0.0.1 --port 4173";

export function resolveE2eServerCommand(
  env: Readonly<Record<string, string | undefined>>,
): string {
  if (env.GYS_E2E_DEV === "1") {
    if (env.CI || env.GYS_E2E_PREBUILT === "1")
      throw new Error(
        "Dev browser tests cannot replace CI or prebuilt verification",
      );
    return "pnpm --dir ../.. build:test-deps && pnpm exec vite --host 127.0.0.1 --port 4173 --strictPort --base /GYSApp-Tauri/";
  }
  return env.GYS_E2E_PREBUILT === "1"
    ? PREVIEW_COMMAND
    : `pnpm --dir ../.. build && ${PREVIEW_COMMAND}`;
}
