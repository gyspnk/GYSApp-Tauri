import { describe, expect, it } from "vitest";
import { resolveE2eServerCommand } from "./e2e-server-command.js";

describe("Playwright preview server command", () => {
  it("serves an already verified build without rebuilding in CI", () => {
    expect(resolveE2eServerCommand({ GYS_E2E_PREBUILT: "1" })).toBe(
      "pnpm exec vite preview --host 127.0.0.1 --port 4173",
    );
  });

  it("keeps a clean-checkout build fallback for local development", () => {
    expect(resolveE2eServerCommand({})).toBe(
      "pnpm --dir ../.. build && pnpm exec vite preview --host 127.0.0.1 --port 4173",
    );
  });

  it("treats any value other than the explicit prebuilt flag as local mode", () => {
    expect(resolveE2eServerCommand({ GYS_E2E_PREBUILT: "0" })).toContain(
      "pnpm --dir ../.. build",
    );
  });
});
