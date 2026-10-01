/** Activation is explicit; another tab cannot reload a reader or an editor. */
export class AppUpdateController {
  private waiting: Pick<ServiceWorker, "postMessage"> | undefined;
  private reloadPending = false;
  private activating = false;
  public constructor(
    private controlled: boolean,
    private readonly busy: () => boolean,
    private readonly reload: () => void,
    private readonly changed: () => void,
  ) {}
  public get pending(): boolean {
    return Boolean(this.waiting) || this.reloadPending;
  }
  public offer(worker: Pick<ServiceWorker, "postMessage">): void {
    this.waiting = worker;
    this.changed();
  }
  public activate(): boolean {
    if (!this.pending || this.busy()) return false;
    if (this.reloadPending) this.reload();
    else {
      this.activating = true;
      this.waiting?.postMessage({ type: "SKIP_WAITING" });
    }
    return true;
  }
  public controllerChanged(): void {
    if (!this.controlled) {
      this.controlled = true;
      return;
    }
    this.waiting = undefined;
    this.reloadPending = true;
    if (this.activating && !this.busy()) this.reload();
    else this.changed();
  }
}

export function isUpdateBusy(
  path: string,
  midi: string,
  speech: string,
  editing: boolean,
  readingOverlay = false,
): boolean {
  return (
    editing ||
    readingOverlay ||
    /\/(?:bible|kidung\/[^/?]+|iman\/[^/?]+|literatur\/[^/?]+)(?:\/|$)/.test(
      path,
    ) ||
    ["loading", "playing", "paused"].includes(midi) ||
    ["loading", "speaking", "paused"].includes(speech)
  );
}
