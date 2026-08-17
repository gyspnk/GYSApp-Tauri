import { midiPlayer } from "./midi-player.js";
import { speechPlayer } from "./speech-player.js";
import { recordDiagnostic } from "./diagnostics.js";

/**
 * Listens for audio device changes (e.g. headphone unplug or Bluetooth disconnect)
 * to automatically pause active playback and prevent accidental loud audio in church/sanctuary.
 */
export function handleDeviceChange(): void {
  try {
    const speech = speechPlayer.snapshot();
    if (speech.status === "speaking") {
      void speechPlayer.pause();
    }

    const midi = midiPlayer.snapshot();
    if (midi.status === "playing") {
      void midiPlayer.pause();
    }
  } catch (error) {
    recordDiagnostic("warn", "audio.devicechange", error);
  }
}

export function installHeadphoneDisconnectGuard(): () => void {
  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.addEventListener !== "function"
  ) {
    return () => {};
  }

  const listener = () => {
    handleDeviceChange();
  };

  navigator.mediaDevices.addEventListener("devicechange", listener);
  return () => {
    navigator.mediaDevices?.removeEventListener?.("devicechange", listener);
  };
}
