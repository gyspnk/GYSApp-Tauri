import { afterEach, expect, it, vi } from "vitest";
import { MediaSessionBridge } from "./media-session.js";
import { BrowserMidiPlayer } from "./midi-player.js";

afterEach(() => vi.unstubAllGlobals());

it("does not prime audio from unrelated navigation gestures", () => {
  const body = new EventTarget();
  const document = new EventTarget();
  Object.assign(document, { body });
  Object.assign(body, { appendChild: vi.fn() });
  vi.stubGlobal("document", document);
  vi.stubGlobal("navigator", {});
  vi.stubGlobal("window", { setInterval: vi.fn(), clearInterval: vi.fn() });
  const Audio = vi.fn(function () {
    return {
      play: async () => undefined,
      pause: vi.fn(),
      setAttribute: vi.fn(),
      style: {},
    };
  });
  vi.stubGlobal("Audio", Audio);
  const bridge = new MediaSessionBridge();
  bridge.install();
  body.dispatchEvent(new Event("click"));
  body.dispatchEvent(new Event("touchstart"));
  expect(Audio).not.toHaveBeenCalled();
  bridge.dispose();
});

it("visibility restoration does not create an idle MIDI audio context", async () => {
  const AudioContext = vi.fn();
  vi.stubGlobal("window", { AudioContext });
  const player = new BrowserMidiPlayer();
  await player.resumeContext();
  expect(AudioContext).not.toHaveBeenCalled();
});

it("keeps one action owner across speech status changes", () => {
  const current = new Map<string, unknown>();
  const calls: string[] = [];
  const mediaSession = {
    metadata: null,
    playbackState: "none",
    setActionHandler: vi.fn((action: string, handler: unknown) => {
      calls.push(action);
      if (handler) current.set(action, handler);
      else current.delete(action);
    }),
    setPositionState: vi.fn(),
  };
  const body = new EventTarget();
  const document = new EventTarget();
  Object.assign(document, { body, visibilityState: "visible", hidden: false });
  Object.assign(body, { appendChild: vi.fn() });
  vi.stubGlobal("document", document);
  vi.stubGlobal("navigator", { mediaSession });
  vi.stubGlobal("window", {
    setInterval: vi.fn(() => 1),
    clearInterval: vi.fn(),
  });
  const bridge = new MediaSessionBridge();
  bridge.install();

  const actions = [
    "play",
    "pause",
    "stop",
    "previoustrack",
    "nexttrack",
    "seekto",
    "seekbackward",
    "seekforward",
  ];
  expect([...current.keys()].sort()).toEqual([...actions].sort());
  const nexttrack = current.get("nexttrack");
  expect(calls.filter((action) => action === "nexttrack")).toHaveLength(1);

  bridge.setSpeechActive(true);
  expect(current.get("nexttrack")).toBe(nexttrack);
  expect(current.has("seekto")).toBe(false);
  expect(current.has("seekbackward")).toBe(false);
  expect(current.has("seekforward")).toBe(false);
  expect(calls.filter((action) => action === "nexttrack")).toHaveLength(1);
  expect(calls.filter((action) => action === "seekto")).toHaveLength(2);

  bridge.setSpeechActive(false);
  expect(current.get("nexttrack")).toBe(nexttrack);
  expect(current.has("seekto")).toBe(true);
  expect(calls.filter((action) => action === "nexttrack")).toHaveLength(1);

  bridge.dispose();
  expect(current.size).toBe(0);
});
