import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./diagnostics.js", () => ({ recordDiagnostic: vi.fn() }));
const edgeTransport = vi.hoisted(() => ({
  canUseNativeEdgeTransport: vi.fn(),
  synthesizeEdgeDirect: vi.fn(),
}));
vi.mock("./edge-direct-safe.js", () => edgeTransport);

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
    edgeTransport.canUseNativeEdgeTransport.mockReturnValue(true);

    const { EdgeSpeechProvider, isEdgeSpeechConfigured } =
      await import("./edge-speech.js");
    const provider = new EdgeSpeechProvider();

    expect(isEdgeSpeechConfigured()).toBe(true);
    await expect(provider.status()).resolves.toEqual({
      available: true,
      offline: false,
    });
  });

  it("does not advertise Edge voices when no Edge transport exists", async () => {
    vi.stubEnv("VITE_EDGE_TTS_URL", "");
    vi.stubEnv("VITE_BFF_BASE_URL", "");
    vi.stubGlobal("window", {});
    edgeTransport.canUseNativeEdgeTransport.mockReturnValue(false);

    const { EdgeSpeechProvider } = await import("./edge-speech.js");
    await expect(new EdgeSpeechProvider().voices()).resolves.toEqual([]);
  });

  it("keeps synthesis paused when pause arrives before audio is ready", async () => {
    let resolveAudio!: (blob: Blob) => void;
    const audioReady = new Promise<Blob>((resolve) => {
      resolveAudio = resolve;
    });
    const play = vi.fn(async () => undefined);
    class TestAudio {
      public static instance: TestAudio | undefined;
      public onended: (() => void) | null = null;
      public onerror: (() => void) | null = null;
      public preload = "";
      public volume = 1;
      public playbackRate = 1;
      public play = play;
      public pause = vi.fn();
      public removeAttribute = vi.fn();

      public constructor() {
        TestAudio.instance = this;
      }
    }
    class TestUrl extends URL {}
    TestUrl.createObjectURL = () => "blob:test-edge-audio";
    TestUrl.revokeObjectURL = () => undefined;
    edgeTransport.canUseNativeEdgeTransport.mockReturnValue(true);
    edgeTransport.synthesizeEdgeDirect.mockReturnValue(audioReady);
    vi.stubEnv("VITE_EDGE_TTS_URL", "");
    vi.stubEnv("VITE_BFF_BASE_URL", "");
    vi.stubGlobal("window", {});
    vi.stubGlobal("Audio", TestAudio);
    vi.stubGlobal("URL", TestUrl);

    const { EdgeSpeechProvider } = await import("./edge-speech.js");
    const provider = new EdgeSpeechProvider();
    const playback = provider.speak("Uji", {});
    await vi.waitFor(() =>
      expect(edgeTransport.synthesizeEdgeDirect).toHaveBeenCalledOnce(),
    );

    await provider.pause();
    resolveAudio(new Blob(["audio"], { type: "audio/mpeg" }));
    await vi.waitFor(() => expect(TestAudio.instance).toBeDefined());

    expect(play).not.toHaveBeenCalled();
    await provider.resume();
    expect(play).toHaveBeenCalledOnce();
    const audio = TestAudio.instance;
    if (!audio) throw new Error("Edge audio element was not created");
    audio.onended?.();
    await expect(playback).resolves.toBeUndefined();
  });
});
