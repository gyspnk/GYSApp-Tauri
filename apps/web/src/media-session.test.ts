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
