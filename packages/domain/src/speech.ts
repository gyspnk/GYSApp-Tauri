import type { SpeechProvider } from "@gys/contracts";

export type SpeechResult = { providerId: string; offline: boolean };

export class SpeechOrchestrator {
  private active: SpeechProvider | undefined;

  public constructor(private readonly providers: readonly SpeechProvider[]) {}

  public async offlineStatus(): Promise<boolean> {
    for (const provider of this.providers) {
      const status = await provider.status();
      if (status.available && status.offline) return true;
    }
    return false;
  }

  public async speak(
    text: string,
    options: {
      voiceId?: string;
      rate?: number;
      pitch?: number;
      volume?: number;
    },
    signal?: AbortSignal,
  ): Promise<SpeechResult> {
    let lastError: unknown;
    for (const provider of this.providers) {
      const status = await provider.status();
      if (!status.available) continue;
      try {
        await provider.speak(text, options, signal);
        this.active = provider;
        return { providerId: provider.id, offline: status.offline };
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error("no speech provider is available");
  }

  public async pause(): Promise<void> {
    await this.active?.pause();
  }
  public async resume(): Promise<void> {
    await this.active?.resume();
  }
  public async stop(): Promise<void> {
    await this.active?.stop();
    this.active = undefined;
  }
}
