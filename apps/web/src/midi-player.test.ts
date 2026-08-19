import { describe, expect, it, vi } from "vitest";
import {
  BrowserMidiPlayer,
  MidiOperationGate,
  MidiPreloadQueue,
  midiRenderKey,
} from "./midi-player.js";

class FakeWorker extends EventTarget {
  public terminated = false;

  public postMessage(message: unknown): void {
    if ((message as { type?: string }).type === "init") {
      queueMicrotask(() => {
        if (!this.terminated)
          this.dispatchEvent(
            new MessageEvent("message", { data: { type: "ready" } }),
          );
      });
    }
  }

  public terminate(): void {
    this.terminated = true;
  }
}

describe("MIDI operation generation", () => {
  it("invalidates late work when a newer operation starts", () => {
    const gate = new MidiOperationGate();
    const first = gate.next();
    const second = gate.next();

    expect(gate.isCurrent(first)).toBe(false);
    expect(gate.isCurrent(second)).toBe(true);
  });

  it("keeps a generation stable while an operation is still active", () => {
    const gate = new MidiOperationGate();
    const generation = gate.next();

    expect(gate.isCurrent(generation)).toBe(true);
    expect(gate.isCurrent(generation + 1)).toBe(false);
  });
});

describe("MIDI worker lifecycle", () => {
  it("requires an installed distributed SoundFont", async () => {
    const player = new BrowserMidiPlayer(async () => undefined);
    const internal = player as unknown as {
      ensureSoundfont: (worker: Worker) => Promise<void>;
    };

    await expect(
      internal.ensureSoundfont(new FakeWorker() as unknown as Worker),
    ).rejects.toThrow("GeneralUser-GS");
  });

  it("discards and terminates a crashed worker before the next render", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    vi.stubGlobal("window", {
      location: { href: "http://localhost/" },
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
    });
    try {
      const player = new BrowserMidiPlayer();
      const internal = player as unknown as {
        ensureWorker: () => Promise<Worker>;
        worker?: FakeWorker;
      };
      const pending = internal.ensureWorker();
      const first = internal.worker!;
      first.dispatchEvent(new Event("error"));

      await expect(pending).rejects.toThrow("MIDI worker crashed");
      expect(internal.worker).toBeUndefined();
      expect((first as unknown as FakeWorker).terminated).toBe(true);

      const second = await internal.ensureWorker();
      expect(second).not.toBe(first);
      player.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("MIDI render preload", () => {
  it("separates cache entries by every audible setting", () => {
    const base = midiRenderKey("abc", 100, 0, -1, 44_100);

    expect(midiRenderKey("abc", 110, 0, -1, 44_100)).not.toBe(base);
    expect(midiRenderKey("abc", 100, 1, -1, 44_100)).not.toBe(base);
    expect(midiRenderKey("abc", 100, 0, 0, 44_100)).not.toBe(base);
    expect(midiRenderKey("abc", 100, 0, -1, 48_000)).not.toBe(base);
    expect(midiRenderKey("def", 100, 0, -1, 44_100)).not.toBe(base);
  });

  it("deduplicates a neighbour and keeps rendering serial", async () => {
    const queue = new MidiPreloadQueue();
    let active = 0;
    let maxActive = 0;
    let runs = 0;
    const work = async () => {
      runs += 1;
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
      return true;
    };

    const first = queue.enqueue("next", work);
    const duplicate = queue.enqueue("next", work);
    const second = queue.enqueue("following", work);

    await expect(Promise.all([first, duplicate, second])).resolves.toEqual([
      true,
      true,
      true,
    ]);
    expect(runs).toBe(2);
    expect(maxActive).toBe(1);
    expect(queue.stats()).toEqual({ queued: 0, inFlight: 0 });
  });

  it("drops queued neighbours when the foreground song changes", async () => {
    const queue = new MidiPreloadQueue();
    let release: (() => void) | undefined;
    const active = new Promise<boolean>((resolve) => {
      release = () => resolve(true);
    });
    const first = queue.enqueue("active", () => active);
    const queued = queue.enqueue("queued", async () => true);
    queue.clear();
    release?.();

    await expect(first).resolves.toBe(true);
    await expect(queued).resolves.toBe(false);
  });
});
