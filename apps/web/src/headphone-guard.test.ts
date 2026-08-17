import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  handleDeviceChange,
  installHeadphoneDisconnectGuard,
} from "./headphone-guard.js";
import { midiPlayer } from "./midi-player.js";
import { speechPlayer } from "./speech-player.js";

describe("headphone disconnect guard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("pauses speechPlayer if currently speaking on devicechange", () => {
    vi.spyOn(speechPlayer, "snapshot").mockReturnValue({
      status: "speaking",
      currentIndex: 0,
      total: 5,
      voices: [],
      rate: 1,
      pitch: 1,
      volume: 1,
      available: true,
      engine: "auto",
      context: undefined,
    });
    vi.spyOn(midiPlayer, "snapshot").mockReturnValue({
      status: "idle",
      duration: 0,
      position: 0,
      volume: 1,
      muted: false,
      tempo: 100,
      transpose: 0,
      instrument: -1,
      backend: "idle",
      loadingProgress: 0,
    });
    const pauseSpeech = vi.spyOn(speechPlayer, "pause").mockResolvedValue();
    const pauseMidi = vi.spyOn(midiPlayer, "pause").mockResolvedValue();

    handleDeviceChange();

    expect(pauseSpeech).toHaveBeenCalledTimes(1);
    expect(pauseMidi).not.toHaveBeenCalled();
  });

  it("pauses midiPlayer if currently playing on devicechange", () => {
    vi.spyOn(speechPlayer, "snapshot").mockReturnValue({
      status: "idle",
      currentIndex: -1,
      total: 0,
      voices: [],
      rate: 1,
      pitch: 1,
      volume: 1,
      available: true,
      engine: "auto",
      context: undefined,
    });
    vi.spyOn(midiPlayer, "snapshot").mockReturnValue({
      status: "playing",
      duration: 120,
      position: 30,
      volume: 1,
      muted: false,
      tempo: 100,
      transpose: 0,
      instrument: -1,
      backend: "fluidsynth",
      loadingProgress: 1,
    });
    const pauseSpeech = vi.spyOn(speechPlayer, "pause").mockResolvedValue();
    const pauseMidi = vi.spyOn(midiPlayer, "pause").mockResolvedValue();

    handleDeviceChange();

    expect(pauseMidi).toHaveBeenCalledTimes(1);
    expect(pauseSpeech).not.toHaveBeenCalled();
  });

  it("installs event listener on navigator.mediaDevices", () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    vi.stubGlobal("navigator", {
      mediaDevices: {
        addEventListener,
        removeEventListener,
      },
    });

    const cleanup = installHeadphoneDisconnectGuard();
    expect(addEventListener).toHaveBeenCalledWith(
      "devicechange",
      expect.any(Function),
    );

    cleanup();
    expect(removeEventListener).toHaveBeenCalledWith(
      "devicechange",
      expect.any(Function),
    );
  });

  it("gracefully returns noop cleanup when mediaDevices is missing", () => {
    vi.stubGlobal("navigator", {});
    const cleanup = installHeadphoneDisconnectGuard();
    expect(cleanup).toBeTypeOf("function");
    expect(() => cleanup()).not.toThrow();
  });
});
