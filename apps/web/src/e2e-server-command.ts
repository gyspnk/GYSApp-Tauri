const PREVIEW_COMMAND = "pnpm exec vite preview --host 127.0.0.1 --port 4173";

export function resolveE2eServerCommand(
  env: Readonly<Record<string, string | undefined>>,
): string {
  return env.GYS_E2E_PREBUILT === "1"
    ? PREVIEW_COMMAND
    : `pnpm --dir ../.. build && ${PREVIEW_COMMAND}`;
}
