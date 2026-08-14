import { describe, expect, it } from "vitest";
import type { SpeechProvider } from "@gys/contracts";
import { SpeechOrchestrator } from "./speech.js";

function provider(
  id: string,
  offline: boolean,
  speak: SpeechProvider["speak"],
): SpeechProvider {
  return {
    id,
    status: async () => ({ available: true, offline }),
    voices: async () => [
      { id: `${id}-voice`, name: id, language: "id-ID", local: offline },
    ],
    speak,
    pause: async () => undefined,
    resume: async () => undefined,
    stop: async () => undefined,
  };
}

describe("SpeechOrchestrator", () => {
  it("falls back from Edge compatibility speech to a local provider", async () => {
    const calls: string[] = [];
    const edge = provider("edge", false, async () => {
      calls.push("edge");
      throw new Error("timeout");
    });
    const local = provider("system", true, async () => {
      calls.push("system");
    });
    const orchestrator = new SpeechOrchestrator([edge, local]);
    await expect(orchestrator.speak("Firman-Mu", {})).resolves.toMatchObject({
      providerId: "system",
      offline: true,
    });
    expect(calls).toEqual(["edge", "system"]);
  });

  it("does not claim offline support when no local provider is available", async () => {
    const edge = provider("edge", false, async () => undefined);
    const orchestrator = new SpeechOrchestrator([edge]);
    await expect(orchestrator.offlineStatus()).resolves.toBe(false);
  });

  it("routes pause and resume to the provider during an active utterance", async () => {
    let finish: (() => void) | undefined;
    let paused = 0;
    let resumed = 0;
    const active = provider("system", true, async () => {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    });
    active.pause = async () => {
      paused += 1;
    };
    active.resume = async () => {
      resumed += 1;
    };
    const orchestrator = new SpeechOrchestrator([active]);
    const speaking = orchestrator.speak("Panjang", {});
    await Promise.resolve();
    await orchestrator.pause();
    await orchestrator.resume();
    finish?.();
    await speaking;
    expect(paused).toBe(1);
    expect(resumed).toBe(1);
  });
});
