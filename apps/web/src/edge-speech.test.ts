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

  it("treats native Tauri as keyless Edge-capable without a gateway", async () => {
    vi.stubEnv("VITE_EDGE_TTS_URL", "");
    vi.stubEnv("VITE_BFF_BASE_URL", "");
    vi.stubGlobal("window", {});
    vi.stubGlobal("__TAURI_INTERNALS__", { invoke: vi.fn() });

    const { EdgeSpeechProvider, isEdgeSpeechConfigured } = await import(
      "./edge-speech.js"
    );
    const provider = new EdgeSpeechProvider();

    expect(isEdgeSpeechConfigured()).toBe(true);
    await expect(provider.status()).resolves.toEqual({
      available: true,
      offline: false,
    });
  });
});
