import { describe, expect, it, vi } from "vitest";
import type { NormalizedMidi } from "@gys/domain";
import {
  BrowserMidiPlayer,
  MidiOperationGate,
  MidiPreloadQueue,
  midiRenderKey,
} from "./midi-player.js";

describe("MIDI song tempo defaults", () => {
  it("uses the new song's PDF tempo when no manual override exists", async () => {
    const player = new BrowserMidiPlayer(async () => undefined);
    const midi: NormalizedMidi = { ppq: 480, tempo: 100, events: [] };

    await player.load("hymn-001", "First hymn", midi, { tempo: 76 });
    await player.load("hymn-002", "Next hymn", midi, { tempo: 84 });

    expect(player.snapshot().tempo).toBe(84);
  });

  it("keeps a manually selected global tempo when loading another song", async () => {
    const player = new BrowserMidiPlayer(async () => undefined);
    const midi: NormalizedMidi = { ppq: 480, tempo: 100, events: [] };
    const setItem = vi.fn();
    vi.stubGlobal("window", { localStorage: { setItem } });

    try {
      await player.setTempo(150);
      await player.load("hymn-002", "Next hymn", midi, { tempo: 84 });

      expect(player.snapshot().tempo).toBe(150);
      expect(JSON.parse(setItem.mock.calls.at(-1)![1])).toMatchObject({
        tempo: 150,
        tempoOverride: true,
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("uses each new song's explicit PDF transpose target", async () => {
    const player = new BrowserMidiPlayer(async () => undefined);
    const midi: NormalizedMidi = { ppq: 480, tempo: 100, events: [] };

    await player.load("hymn-001", "First hymn", midi, { transpose: 2 });
    expect(player.snapshot().transpose).toBe(2);

    await player.load("hymn-002", "Next hymn", midi, { transpose: -1 });
    expect(player.snapshot().transpose).toBe(-1);

    await player.load("hymn-003", "Following hymn", midi, { transpose: 0 });
    expect(player.snapshot().transpose).toBe(0);
  });

  it("keeps a user-selected transpose when loading another song", async () => {
    const player = new BrowserMidiPlayer(async () => undefined);
    const midi: NormalizedMidi = { ppq: 480, tempo: 100, events: [] };

    await player.setTranspose(-2);
    await player.load("hymn-001", "First hymn", midi, { transpose: 0 });

    expect(player.snapshot().transpose).toBe(-2);
  });

  it("keeps metadata defaults separate from a user transpose preference", async () => {
    const player = new BrowserMidiPlayer(async () => undefined);

    await player.setTranspose(-1, { userOverride: false });
    expect(player.hasTransposePreference()).toBe(false);

    await player.setTranspose(-2);
    await player.setTranspose(0, { userOverride: false });

    expect(player.snapshot().transpose).toBe(-2);
  });
});

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

class FakeGainNode {
  public gain = {
    value: 1,
    cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
  };
  public connect = vi.fn(() => this);
  public disconnect = vi.fn();
}

class FakeBufferSourceNode {
  public buffer: AudioBuffer | null = null;
  public onended: (() => void) | null = null;
  public connect = vi.fn(() => this);
  public disconnect = vi.fn();
  public start = vi.fn();
  public stop = vi.fn();
}

describe("MIDI operation generation", () => {
  it("does not cancel an active render when a setting is reapplied unchanged", async () => {
    const worker = new FakeWorker();
    const player = new BrowserMidiPlayer();
    const internal = player as unknown as {
      state: ReturnType<typeof player.snapshot>;
      tempoOverride: boolean;
      worker?: Worker;
      pending: Map<
        number,
        {
          kind: "render" | "other";
          resolve: (message: unknown) => void;
          reject: (error: Error) => void;
          timer: number;
        }
      >;
    };
    const pending = new Map();
    pending.set(1, {
      kind: "render",
      resolve: vi.fn(),
      reject: vi.fn(),
      timer: 1,
    });
    internal.worker = worker as unknown as Worker;
    internal.pending = pending;
    internal.tempoOverride = false;
    internal.state = {
      ...player.snapshot(),
      status: "loading",
      songId: "hymn-001",
      title: "Pujilah Allah Yang Maha Esa",
    };
    const play = vi.spyOn(player, "play").mockResolvedValue();
    vi.stubGlobal("window", {
      clearTimeout: vi.fn(),
      clearInterval: vi.fn(),
    });

    try {
      await player.setTempo(player.snapshot().tempo, { userOverride: false });
      await player.setTranspose(player.snapshot().transpose);

      expect(worker.terminated).toBe(false);
      expect(pending.size).toBe(1);
      expect(player.snapshot().status).toBe("loading");
      expect(play).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

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

  it("does not resume playback when stop supersedes an in-flight render", async () => {
    vi.stubGlobal("Worker", class {});
    try {
      const player = new BrowserMidiPlayer();
      const internal = player as unknown as {
        current: unknown;
        rawMidi?: Uint8Array;
        sourceHash: string;
        state: ReturnType<typeof player.snapshot>;
        ensureAudio: () => AudioContext;
        ensureRendered: () => Promise<{ key: string; buffer: AudioBuffer }>;
        startBuffer: ReturnType<typeof vi.fn>;
        startTimer: ReturnType<typeof vi.fn>;
        stopAudio: ReturnType<typeof vi.fn>;
      };
      const audio = { resume: vi.fn(async () => undefined) };
      internal.current = { tempo: 100 };
      internal.rawMidi = new Uint8Array([1]);
      internal.sourceHash = "a".repeat(64);
      internal.state = {
        ...player.snapshot(),
        status: "ready",
        songId: "hymn-001",
        title: "Pujilah Allah Yang Maha Esa",
        duration: 10,
      };
      internal.ensureAudio = () => audio as unknown as AudioContext;
      internal.startBuffer = vi.fn();
      internal.startTimer = vi.fn();
      internal.stopAudio = vi.fn(async () => undefined);

      let resolveRender: (value: {
        key: string;
        buffer: AudioBuffer;
      }) => void = () => undefined;
      let markRenderStarted: () => void = () => undefined;
      const renderStarted = new Promise<void>((resolve) => {
        markRenderStarted = resolve;
      });
      const render = new Promise<{ key: string; buffer: AudioBuffer }>(
        (resolve) => {
          resolveRender = resolve;
        },
      );
      internal.ensureRendered = () => {
        markRenderStarted();
        return render;
      };

      const playback = player.play();
      await renderStarted;
      await player.stop();
      resolveRender({ key: "late-render", buffer: {} as AudioBuffer });
      await playback;

      expect(player.snapshot()).toMatchObject({
        status: "stopped",
        position: 0,
      });
      expect(internal.startBuffer).not.toHaveBeenCalled();
      expect(internal.startTimer).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("terminates the FluidSynth worker when stop cancels its active render", async () => {
    const clearTimeout = vi.fn();
    vi.stubGlobal("window", { clearTimeout });
    try {
      const player = new BrowserMidiPlayer();
      const worker = new FakeWorker();
      const rejectRender = vi.fn();
      const internal = player as unknown as {
        pending: Map<
          number,
          {
            kind: "render" | "other";
            resolve: (message: unknown) => void;
            reject: (error: Error) => void;
            timer: number;
          }
        >;
        state: ReturnType<typeof player.snapshot>;
        stopAudio: ReturnType<typeof vi.fn>;
        worker?: Worker;
      };
      internal.state = {
        ...player.snapshot(),
        status: "loading",
        songId: "hymn-001",
      };
      internal.stopAudio = vi.fn(async () => undefined);
      internal.worker = worker as unknown as Worker;
      internal.pending.set(1, {
        kind: "render",
        resolve: vi.fn(),
        reject: rejectRender,
        timer: 0,
      });

      await player.stop();

      expect(worker.terminated).toBe(true);
      expect(internal.worker).toBeUndefined();
      expect(internal.pending.size).toBe(0);
      expect(clearTimeout).toHaveBeenCalledWith(0);
      expect(rejectRender).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "MIDI operation was superseded",
        }),
      );
      expect(player.snapshot().status).toBe("stopped");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("MIDI worker lifecycle", () => {
  it("closing clears the session and prevents playback until reopened", async () => {
    const player = new BrowserMidiPlayer(async () => undefined);
    await player.load("hymn-001", "First hymn", {
      ppq: 480,
      tempo: 100,
      events: [],
    });
    await player.close();
    expect(player.snapshot()).toMatchObject({
      status: "idle",
      songId: undefined,
      position: 0,
      duration: 0,
    });
    await expect(player.play()).rejects.toThrow("MIDI is not loaded");
    await player.load("hymn-001", "First hymn", {
      ppq: 480,
      tempo: 100,
      events: [],
    });
    expect(player.snapshot().status).toBe("ready");
  });
  it("rejects missing SoundFont bytes from a custom loader", async () => {
    const player = new BrowserMidiPlayer(async () => undefined);
    const internal = player as unknown as {
      ensureSoundfont: (worker: Worker) => Promise<void>;
    };

    await expect(
      internal.ensureSoundfont(new FakeWorker() as unknown as Worker),
    ).rejects.toThrow("SoundFont is incomplete");
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

describe("MIDI audio node lifecycle", () => {
  function preparePlayer(
    player: BrowserMidiPlayer,
    source: FakeBufferSourceNode,
    gain: FakeGainNode,
    master = new FakeGainNode(),
  ) {
    const internal = player as unknown as {
      audio: AudioContext;
      master: GainNode;
      masterConnected: boolean;
      state: ReturnType<BrowserMidiPlayer["snapshot"]>;
      bufferSource?: AudioBufferSourceNode;
      sourceGain?: GainNode;
      crossfadeMs: number;
      startBuffer: (buffer: AudioBuffer, position: number) => void;
    };
    internal.audio = {
      currentTime: 5,
      createBufferSource: () => source,
      createGain: () => gain,
    } as unknown as AudioContext;
    internal.master = master as unknown as GainNode;
    internal.masterConnected = true;
    internal.state = {
      ...player.snapshot(),
      status: "playing",
      songId: "hymn-001",
      duration: 2,
    };
    return internal;
  }

  it("disconnects the source and gain when a track ends", () => {
    const player = new BrowserMidiPlayer();
    const source = new FakeBufferSourceNode();
    const gain = new FakeGainNode();
    const internal = preparePlayer(player, source, gain);
    vi.stubGlobal("window", {
      AudioContext: class {},
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
      setInterval: globalThis.setInterval,
      clearInterval: globalThis.clearInterval,
    });
    try {
      internal.startBuffer({ duration: 2 } as AudioBuffer, 0);
      source.onended?.();

      expect(source.disconnect).toHaveBeenCalledOnce();
      expect(gain.disconnect).toHaveBeenCalledOnce();
      expect(internal.bufferSource).toBeUndefined();
      expect(internal.sourceGain).toBeUndefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("disconnects the previous deck after crossfade without ending the new track", () => {
    const player = new BrowserMidiPlayer();
    const previous = new FakeBufferSourceNode();
    const previousGain = new FakeGainNode();
    const next = new FakeBufferSourceNode();
    const nextGain = new FakeGainNode();
    const internal = preparePlayer(player, next, nextGain);
    internal.bufferSource = previous as unknown as AudioBufferSourceNode;
    internal.sourceGain = previousGain as unknown as GainNode;
    internal.crossfadeMs = 1_000;
    const ended = vi.fn();
    player.subscribeEnded(ended);
    vi.stubGlobal("window", {
      AudioContext: class {},
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
      setInterval: globalThis.setInterval,
      clearInterval: globalThis.clearInterval,
    });
    try {
      internal.startBuffer({ duration: 2 } as AudioBuffer, 0);

      expect(previous.stop).toHaveBeenCalledOnce();
      expect(previous.onended).toBeTypeOf("function");
      previous.onended?.();
      expect(previous.disconnect).toHaveBeenCalledOnce();
      expect(previousGain.disconnect).toHaveBeenCalledOnce();
      expect(internal.bufferSource).toBe(next);
      expect(ended).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("MIDI render preload", () => {
  it("separates cache entries by every audible setting", () => {
    const base = midiRenderKey("abc", 100, 0, -1, 44_100);
    expect(midiRenderKey("abc", 100, 0, -1, 44_100, "GeneralUser-GS")).not.toBe(
      base,
    );

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
