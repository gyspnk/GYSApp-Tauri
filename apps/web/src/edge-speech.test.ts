import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./diagnostics.js", () => ({ recordDiagnostic: vi.fn() }));

describe("Edge speech retry availability", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("stays available after a transient request failure", async () => {
    vi.stubEnv("VITE_EDGE_TTS_URL", "https://speech.example.test/edge");
    vi.stubGlobal("window", {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("offline")));
    const { EdgeSpeechProvider } = await import("./edge-speech.js");
    const provider = new EdgeSpeechProvider();

    await expect(provider.speak("Uji", {})).rejects.toThrow("offline");
    await expect(provider.status()).resolves.toMatchObject({ available: true });
  });
});
