import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["e2e/**", "node_modules/**"],
    // Unit tests assert contract boundaries, so they must not inherit a
    // developer's local deployment configuration from `.env.local`. Without
    // this, a checkout that points `VITE_BFF_BASE_URL` at the deployed Worker
    // (the documented way to exercise account/public APIs locally) fails the
    // "Worker is absent" contracts, the image-proxy fallbacks and the
    // raw-CDN music source. Each test that needs a deployment value opts in
    // with `vi.stubEnv`, so the pinned defaults stay observable and explicit.
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
