/**
 * Media Session + Wake Lock bridge for the MIDI player.
 *
 * Ports gyschordweb `media-session.js`:
 *  - silent WAV <audio> loop: mobile browsers only show lock-screen /
 *    notification controls when an HTMLMediaElement is actually playing;
 *  - playback metadata + playbackState + setPositionState (1 Hz poll);
 *  - action handlers: play, pause, previoustrack, nexttrack, seekto,
 *    seekbackward (10 s), seekforward (10 s);
 *  - screen wake lock while MIDI is playing;
 *  - AudioContext resume + media session re-sync on visibility restore.
 *
 * The bridge is installed once (App shell) and keeps working across routes,
 * exactly like the global MidiEngine in gyschordweb.
 */
import { midiPlayer } from "./midi-player.js";
import { playAdjacentMidiHymn } from "./midi-queue.js";
import { getMidiPlaylist } from "./midi-playlist.js";
import { speechPlayer } from "./speech-player.js";

const SKIP_SECONDS = 10;
const POLL_MS = 1000;

type ActionHandler = (
  details?: MediaSessionActionDetails,
) => void | Promise<void>;

function generateSilentWavUrl(seconds: number): string {
  const sampleRate = 8000;
  const numSamples = sampleRate * Math.max(1, Math.ceil(seconds));
  const headerSize = 44;
  const buffer = new ArrayBuffer(headerSize + numSamples);
  const view = new DataView(buffer);
  const writeString = (offset: number, str: string) => {
    for (let index = 0; index < str.length; index++)
      view.setUint8(offset + index, str.charCodeAt(index));
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + numSamples, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  writeString(36, "data");
  view.setUint32(40, numSamples, true);
  new Uint8Array(buffer, headerSize, numSamples).fill(128);
  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}

export class MediaSessionBridge {
  private silentAudio: HTMLAudioElement | undefined;
  private silentAudioPending = false;
  private wakeLockSentinel: WakeLockSentinel | undefined;
  private poll: number | undefined;
  private installed = false;
  private speechActive = false;
  private readonly registeredActions = new Set<MediaSessionAction>();

  public install(): void {
    if (this.installed) return;
    this.installed = true;
    this.syncActionHandlers();
    this.poll = window.setInterval(() => this.pollTick(), POLL_MS);
    document.addEventListener("visibilitychange", () =>
      this.onVisibilityChange(),
    );
    this.sync();
  }

  public dispose(): void {
    if (this.poll !== undefined) window.clearInterval(this.poll);
    this.poll = undefined;
    this.releaseWakeLock();
    this.pauseSilentAudio();
    this.clearActionHandlers();
    this.installed = false;
  }

  public sync(): void {
    const isPlaying = this.isActiveMediaPlaying();
    if (!this.speechActive) this.updateMetadata();
    this.updatePlaybackState();
    this.updatePositionState();
    if (isPlaying) this.playSilentAudio();
    else this.pauseSilentAudio();
    if (isPlaying) void this.requestWakeLock();
    else this.releaseWakeLock();
  }

  public setSpeechActive(active: boolean): void {
    const changed = this.speechActive !== active;
    this.speechActive = active;
    if (changed) this.syncActionHandlers();
    this.sync();
  }

  private isActiveMediaPlaying(): boolean {
    return this.speechActive
      ? speechPlayer.snapshot().status === "speaking"
      : midiPlayer.isPlaying();
  }

  private hasSong(): boolean {
    return midiPlayer.getDuration() > 0;
  }

  private ensureSilentAudio(): HTMLAudioElement {
    if (this.silentAudio) return this.silentAudio;
    const audio = new Audio(generateSilentWavUrl(2));
    audio.loop = true;
    audio.volume = 0.01;
    audio.setAttribute("playsinline", "");
    audio.preload = "auto";
    audio.style.cssText =
      "position:fixed;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none";
    (document.body || document.documentElement).appendChild(audio);
    this.silentAudio = audio;
    return audio;
  }

  private playSilentAudio(): void {
    if (this.silentAudioPending) return;
    const audio = this.ensureSilentAudio();
    if (!audio.paused) return;
    this.silentAudioPending = true;
    const playPromise = audio.play();
    if (playPromise)
      playPromise
        .then(() => {
          this.silentAudioPending = false;
        })
        .catch(() => {
          this.silentAudioPending = false;
        });
    else this.silentAudioPending = false;
  }

  private pauseSilentAudio(): void {
    this.silentAudioPending = false;
    if (this.silentAudio && !this.silentAudio.paused) this.silentAudio.pause();
  }

  private async requestWakeLock(): Promise<void> {
    if (!("wakeLock" in navigator) || this.wakeLockSentinel) return;
    try {
      this.wakeLockSentinel = await navigator.wakeLock.request("screen");
      this.wakeLockSentinel.addEventListener("release", () => {
        this.wakeLockSentinel = undefined;
      });
    } catch {
      // Best-effort: fails while the page is not visible.
    }
  }

  private releaseWakeLock(): void {
    if (this.wakeLockSentinel) {
      void this.wakeLockSentinel.release().catch(() => undefined);
      this.wakeLockSentinel = undefined;
    }
  }

  private mediaSession(): MediaSession | undefined {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator))
      return undefined;
    return (navigator as unknown as { mediaSession: MediaSession })
      .mediaSession;
  }

  private updateMetadata(): void {
    const session = this.mediaSession();
    if (!session || !this.hasSong()) return;
    const title = midiPlayer.snapshot().title ?? "GYS Pujian";
    try {
      if (
        typeof MediaMetadata !== "undefined" &&
        (!session.metadata || session.metadata.title !== title)
      ) {
        session.metadata = new MediaMetadata({
          title,
          artist: "GYS",
          album: "GYS Chord Book",
          artwork: [],
        });
      }
    } catch {
      // Metadata is optional.
    }
  }

  private updatePlaybackState(explicit?: MediaSessionPlaybackState): void {
    const session = this.mediaSession();
    if (!session) return;
    try {
      const speechStatus = speechPlayer.snapshot().status;
      session.playbackState =
        explicit ??
        (this.speechActive
          ? speechStatus === "speaking"
            ? "playing"
            : speechStatus === "idle"
              ? "none"
              : "paused"
          : midiPlayer.isPlaying()
            ? "playing"
            : this.hasSong()
              ? "paused"
              : "none");
    } catch {
      // Playback state is optional.
    }
  }

  private updatePositionState(): void {
    const session = this.mediaSession();
    if (!session || typeof session.setPositionState !== "function") return;
    if (this.speechActive) {
      try {
        session.setPositionState();
      } catch {
        // Position state is optional.
      }
      return;
    }
    const duration = midiPlayer.getDuration();
    if (duration <= 0) return;
    const position = Math.min(Math.max(midiPlayer.getTime(), 0), duration);
    try {
      session.setPositionState({ duration, playbackRate: 1.0, position });
    } catch {
      // May be thrown for unsupported durations.
    }
  }

  private pollTick(): void {
    const isPlaying = this.isActiveMediaPlaying();
    if (document.hidden && !isPlaying) return;
    if (!this.speechActive && !this.hasSong()) return;
    if (!this.speechActive) this.updatePositionState();
    this.updatePlaybackState();
    if (isPlaying && this.silentAudio?.paused) this.playSilentAudio();
  }

  private onVisibilityChange(): void {
    if (document.visibilityState !== "visible") return;
    if (this.isActiveMediaPlaying()) {
      void this.requestWakeLock();
      if (this.silentAudio?.paused) this.playSilentAudio();
    }
    if (midiPlayer.isPlaying()) void midiPlayer.resumeContext();
    this.sync();
  }

  private seekBy(offsetSeconds: number): void {
    const duration = midiPlayer.getDuration();
    if (duration <= 0) return;
    const next = Math.min(
      Math.max(midiPlayer.getTime() + offsetSeconds, 0),
      duration,
    );
    void midiPlayer.seek(next).catch(() => undefined);
    this.updatePositionState();
  }

  private actionHandlers(): Array<[MediaSessionAction, ActionHandler]> {
    return [
      [
        "play",
        () => {
          if (this.speechActive) {
            return speechPlayer.snapshot().status === "paused"
              ? speechPlayer.resume()
              : speechPlayer.play();
          }
          void speechPlayer.pause();
          return midiPlayer.play().catch(() => undefined);
        },
      ],
      [
        "pause",
        () =>
          this.speechActive
            ? speechPlayer.pause()
            : midiPlayer.pause().catch(() => undefined),
      ],
      [
        "stop",
        () =>
          this.speechActive
            ? speechPlayer.stop()
            : midiPlayer.stop().catch(() => undefined),
      ],
      [
        "previoustrack",
        () => {
          if (this.speechActive) return speechPlayer.previous();
          // gyschordweb onPrevSong(allowRewind): >2 s plays from 0, else previous.
          if (midiPlayer.getTime() > 2) {
            return midiPlayer
              .seek(0)
              .then(() => midiPlayer.play())
              .catch(() => undefined);
          }
          return playAdjacentMidiHymn(-1).catch(() => undefined);
        },
      ],
      [
        "nexttrack",
        () =>
          this.speechActive
            ? speechPlayer.next()
            : playAdjacentMidiHymn(1).catch(() => undefined),
      ],
      [
        "seekto",
        (details) => {
          if (this.speechActive) return;
          void midiPlayer
            .seek(details?.seekTime ?? midiPlayer.getTime())
            .catch(() => undefined)
            .finally(() => this.updatePositionState());
        },
      ],
      [
        "seekbackward",
        (details) => {
          if (this.speechActive) return;
          this.seekBy(-(details?.seekOffset ?? SKIP_SECONDS));
        },
      ],
      [
        "seekforward",
        (details) => {
          if (this.speechActive) return;
          this.seekBy(details?.seekOffset ?? SKIP_SECONDS);
        },
      ],
    ];
  }

  /** Register the whole action set in one place; speech has no seeking. */
  private syncActionHandlers(): void {
    const session = this.mediaSession();
    if (!session || typeof session.setActionHandler !== "function") return;
    for (const [action, handler] of this.actionHandlers()) {
      const seeking =
        action === "seekto" ||
        action === "seekbackward" ||
        action === "seekforward";
      this.applyActionHandler(
        session,
        action,
        this.speechActive && seeking ? null : handler,
      );
    }
  }

  private applyActionHandler(
    session: MediaSession,
    action: MediaSessionAction,
    handler: ActionHandler | null,
  ): void {
    if (handler === null) {
      if (!this.registeredActions.has(action)) return;
      try {
        session.setActionHandler(action, null);
      } catch {
        return;
      }
      this.registeredActions.delete(action);
      return;
    }
    if (this.registeredActions.has(action)) return;
    try {
      session.setActionHandler(action, handler);
      this.registeredActions.add(action);
    } catch {
      // Safari exposes the Media Session object but not every action.
    }
  }

  /** Release only the actions this bridge installed (unmount/teardown). */
  private clearActionHandlers(): void {
    const session = this.mediaSession();
    if (session && typeof session.setActionHandler === "function") {
      for (const action of [...this.registeredActions]) {
        try {
          session.setActionHandler(action, null);
        } catch {
          // unsupported action
        }
      }
    }
    this.registeredActions.clear();
  }
}

export const mediaSessionBridge = new MediaSessionBridge();

/** Keep the bridge synced from the player's end-by-subscription, if idle. */
export function installMediaSessionBridge(): () => void {
  mediaSessionBridge.install();
  const unsubscribeEnded = midiPlayer.subscribeEnded(() =>
    mediaSessionBridge.sync(),
  );
  const unsubscribePlaying = midiPlayer.subscribe(() => {
    // Cheap state sync on status transitions only (not position ticks): the
    // bridge uses its own 1 Hz poll for position state.
    const status = midiPlayer.snapshot().status;
    if (status === "playing" || status === "paused" || status === "stopped")
      mediaSessionBridge.sync();
  });
  return () => {
    unsubscribeEnded();
    unsubscribePlaying();
    mediaSessionBridge.dispose();
  };
}

export function hasSongsForMediaSession(): number {
  return getMidiPlaylist().items.length;
}
