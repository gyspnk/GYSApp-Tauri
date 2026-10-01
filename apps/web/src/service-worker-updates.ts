import { AppUpdateController, isUpdateBusy } from "./app-update.js";
import { midiPlayer } from "./midi-player.js";
import { speechPlayer } from "./speech-player.js";
import { readShellSettings } from "./settings.js";
import { translate } from "./i18n.js";
import { recordDiagnostic } from "./diagnostics.js";

export function installServiceWorkerUpdates(): () => void {
  const disposers: Array<() => void> = [];
  let disposed = false;
  let registration: ServiceWorkerRegistration | undefined;
  const banner = document.createElement("aside");
  banner.className = "app-update-banner";
  banner.setAttribute("role", "status");
  const message = document.createElement("span");
  const button = document.createElement("button");
  button.type = "button";
  banner.append(message, button);
  const dirtyEditors = new Set<HTMLElement>();
  const busy = () => {
    for (const editor of dirtyEditors)
      if (!editor.isConnected) dirtyEditors.delete(editor);
    const focused = document.activeElement;
    return isUpdateBusy(
      location.pathname,
      midiPlayer.snapshot().status,
      speechPlayer.snapshot().status,
      dirtyEditors.size > 0 ||
        (focused instanceof HTMLElement &&
          (focused.matches(
            "input:not([type='button']):not([type='range']), textarea, select",
          ) ||
            focused.isContentEditable)),
    );
  };
  const render = () => {
    if (disposed) return;
    if (!controller.pending) {
      banner.remove();
      return;
    }
    const locale = readShellSettings(localStorage).locale;
    const blocked = busy();
    message.textContent = blocked
      ? translate(locale, "update.busy")
      : translate(locale, "update.ready");
    button.textContent = translate(locale, "update.reload");
    button.disabled = blocked;
    if (!banner.isConnected) document.body.append(banner);
  };
  const controller = new AppUpdateController(
    Boolean(navigator.serviceWorker.controller),
    busy,
    () => location.reload(),
    render,
  );
  const listen = (
    target: EventTarget,
    type: string,
    listener: EventListener,
  ) => {
    target.addEventListener(type, listener);
    disposers.push(() => target.removeEventListener(type, listener));
  };
  listen(document, "input", (event) => {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.matches(
        "textarea, input[type='text'], input[type='email'], input[type='password'], input:not([type])",
      ) ||
        target.isContentEditable)
    )
      dirtyEditors.add(target);
    render();
  });
  listen(document, "submit", (event) => {
    if (event.target instanceof HTMLFormElement)
      for (const editor of dirtyEditors)
        if (event.target.contains(editor)) dirtyEditors.delete(editor);
    queueMicrotask(render);
  });
  listen(button, "click", () => {
    controller.activate();
    render();
  });
  listen(navigator.serviceWorker, "controllerchange", () =>
    controller.controllerChanged(),
  );
  listen(window, "popstate", render);
  listen(document, "focusin", render);
  listen(document, "focusout", () => queueMicrotask(render));
  disposers.push(midiPlayer.subscribe(render), speechPlayer.subscribe(render));
  // Router pushes don't emit popstate; observe location cheaply only while pending.
  const timer = window.setInterval(() => {
    if (controller.pending) render();
  }, 1000);
  disposers.push(() => clearInterval(timer));
  const offer = (worker: ServiceWorker | null) => {
    if (!worker) return;
    if (worker.state === "installed") controller.offer(worker);
    else
      listen(worker, "statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller)
          controller.offer(worker);
      });
  };
  const check = async () => {
    try {
      await registration?.update();
    } catch (error) {
      recordDiagnostic("warn", "service-worker.update", error);
    }
  };
  const start = async () => {
    try {
      registration = await navigator.serviceWorker.register(
        `${import.meta.env.BASE_URL}sw.js`,
        { updateViaCache: "none" },
      );
      if (disposed) return;
      offer(registration.waiting);
      offer(registration.installing);
      listen(registration, "updatefound", () =>
        offer(registration?.installing ?? null),
      );
      listen(window, "focus", () => void check());
      listen(document, "visibilitychange", () => {
        if (document.visibilityState === "visible") void check();
      });
      const updateTimer = window.setInterval(
        () => void check(),
        10 * 60 * 1000,
      );
      disposers.push(() => clearInterval(updateTimer));
      void check();
      const ready = await navigator.serviceWorker.ready;
      const connection = (
        navigator as Navigator & {
          connection?: { saveData?: boolean; effectiveType?: string };
        }
      ).connection;
      if (
        !disposed &&
        !connection?.saveData &&
        connection?.effectiveType !== "2g"
      )
        ready.active?.postMessage({ type: "gys-cache-optional" });
    } catch (error) {
      recordDiagnostic("warn", "service-worker.register", error);
    }
  };
  if (document.readyState === "complete") void start();
  else listen(window, "load", () => void start());
  return () => {
    disposed = true;
    for (const dispose of disposers) dispose();
    banner.remove();
  };
}
