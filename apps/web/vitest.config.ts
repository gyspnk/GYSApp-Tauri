import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    pool: "threads",
    ...(process.env.CI ? { maxWorkers: 4 } : {}),
    css: false,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["e2e/**", "node_modules/**"],
    // Unit tests assert contract boundaries, so they must not inherit a
    // developer's local deployment configuration from `.env.local`.
    env: {
      VITE_ASSET_MANIFEST_URL: "",
      VITE_BFF_BASE_URL: "",
      VITE_EDGE_TTS_DEFAULT_VOICE: "",
      VITE_EDGE_TTS_URL: "",
      VITE_EDGE_TTS_VOICES_URL: "",
      VITE_EGYS_GOOGLE_CLIENT_ID: "",
    },
  },
});
