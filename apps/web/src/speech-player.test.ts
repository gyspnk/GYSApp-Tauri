import { SpeechOrchestrator } from "@gys/domain";
import type { SpeechProvider } from "@gys/contracts";
import { describe, expect, it, vi } from "vitest";
import { speechProvidersForEngine } from "./speech-player.js";

function createProvider(id: string) {
  const speak = vi.fn(async () => undefined);
  const provider: SpeechProvider = {
    id,
    status: async () => ({ available: true, offline: id === "local" }),
    voices: async () => [],
    speak,
    pause: async () => undefined,
    resume: async () => undefined,
    stop: async () => undefined,
  };
  return { provider, speak };
}

describe("speech engine routing", () => {
  it("falls back from Edge to system speech in automatic mode", async () => {
    const edge = createProvider("edge");
    edge.speak.mockRejectedValueOnce(new Error("network unavailable"));
    const system = createProvider("system");
    const local = createProvider("local");
    const orchestrator = new SpeechOrchestrator(
      speechProvidersForEngine(
        "auto",
        edge.provider,
        system.provider,
        local.provider,
      ),
    );

    await expect(orchestrator.speak("verse", {})).resolves.toMatchObject({
      providerId: "system",
    });
    expect(edge.speak).toHaveBeenCalledOnce();
    expect(system.speak).toHaveBeenCalledOnce();
    expect(local.speak).not.toHaveBeenCalled();
  });

  it("does not switch providers when Edge is explicitly selected", async () => {
    const edge = createProvider("edge");
    edge.speak.mockRejectedValueOnce(new Error("network unavailable"));
    const system = createProvider("system");
    const local = createProvider("local");
    const orchestrator = new SpeechOrchestrator(
      speechProvidersForEngine(
        "edge",
        edge.provider,
        system.provider,
        local.provider,
      ),
    );

    await expect(orchestrator.speak("verse", {})).rejects.toThrow(
      "network unavailable",
    );
    expect(edge.speak).toHaveBeenCalledOnce();
    expect(system.speak).not.toHaveBeenCalled();
    expect(local.speak).not.toHaveBeenCalled();
  });

  it("uses only the local provider in local mode", async () => {
    const edge = createProvider("edge");
    const system = createProvider("system");
    const local = createProvider("local");
    const orchestrator = new SpeechOrchestrator(
      speechProvidersForEngine(
        "local",
        edge.provider,
        system.provider,
        local.provider,
      ),
    );

    await expect(orchestrator.speak("verse", {})).resolves.toMatchObject({
      providerId: "local",
      offline: true,
    });
    expect(edge.speak).not.toHaveBeenCalled();
    expect(system.speak).not.toHaveBeenCalled();
    expect(local.speak).toHaveBeenCalledOnce();
  });
});
