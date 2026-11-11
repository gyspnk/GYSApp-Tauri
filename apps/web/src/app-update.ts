/**
 * Updates apply themselves: the waiting worker is activated as soon as the page
 * is idle, and the reload follows the same rule. Nothing waits for a button —
 * a reader or an unsaved note only delays the moment, never cancels it.
 */
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
  public get updating(): boolean {
    return this.activating;
  }
  public withdraw(worker: Pick<ServiceWorker, "postMessage">): void {
    if (this.waiting !== worker) return;
    this.waiting = undefined;
    this.activating = false;
    this.changed();
  }
  public offer(worker: Pick<ServiceWorker, "postMessage">): void {
    if (this.waiting !== worker) this.activating = false;
    this.waiting = worker;
    this.changed();
    this.tick();
  }
  /** Applies the update when the page is idle; call it on a short interval. */
  public tick(): boolean {
    if (!this.pending || this.busy()) return false;
    if (this.reloadPending) {
      this.finish();
      return true;
    }
    if (this.activating) return false;
    this.activating = true;
    this.waiting?.postMessage({ type: "SKIP_WAITING" });
    this.changed();
    return true;
  }
  public controllerChanged(): void {
    if (!this.controlled) {
      this.controlled = true;
      if (!this.activating) return;
    }
    this.waiting = undefined;
    this.reloadPending = true;
    const requested = this.activating;
    this.activating = false;
    if (requested && !this.busy()) this.finish();
    else this.changed();
  }
  /** Reloads at most once: the pending flags clear before the page goes away. */
  private finish(): void {
    this.reloadPending = false;
    this.waiting = undefined;
    this.reload();
  }
}

export function isUpdateBusy(editing: boolean, overlay: boolean): boolean {
  // The update no longer waits for a calm page: it installs and reloads on any
  // route. Only losing typed text or an open surface (dialog, PDF reader) is
  // worth a pause, because a reload would take it away mid-action.
  return editing || overlay;
}
