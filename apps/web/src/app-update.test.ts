import { describe, expect, it, vi } from "vitest";
import { AppUpdateController, isUpdateBusy } from "./app-update.js";

const install = (busy: () => boolean = () => false, reload = vi.fn()) => ({
  reload,
  controller: new AppUpdateController(true, busy, reload, vi.fn()),
});

describe("self-applying app updates", () => {
  it("withdraws a superseded worker without removing a newer offer", () => {
    const { controller } = install();
    const old = { postMessage: vi.fn() },
      next = { postMessage: vi.fn() };
    controller.offer(old);
    controller.offer(next);
    controller.withdraw(old);
    expect(controller.pending).toBe(true);
    controller.withdraw(next);
    expect(controller.pending).toBe(false);
  });
  it("activates the waiting worker as soon as the page is idle", () => {
    const worker = { postMessage: vi.fn() };
    const { controller } = install();
    controller.offer(worker);
    expect(worker.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    expect(controller.updating).toBe(true);
    controller.tick();
    expect(worker.postMessage).toHaveBeenCalledOnce();
  });
  it("delays the activation while reading or editing, then applies it", () => {
    const worker = { postMessage: vi.fn() };
    let busy = true;
    const { controller } = install(() => busy);
    controller.offer(worker);
    expect(controller.pending).toBe(true);
    expect(controller.updating).toBe(false);
    expect(worker.postMessage).not.toHaveBeenCalled();
    expect(controller.tick()).toBe(false);
    busy = false;
    expect(controller.tick()).toBe(true);
    expect(worker.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
  });
  it("reloads once the new controller arrives and the page is idle", () => {
    const { controller, reload } = install();
    controller.offer({ postMessage: vi.fn() });
    controller.controllerChanged();
    expect(controller.updating).toBe(false);
    expect(reload).toHaveBeenCalledOnce();
    controller.tick();
    expect(reload).toHaveBeenCalledOnce();
  });
  it("holds the reload until the reader or editor is finished", () => {
    let busy = true;
    const { controller, reload } = install(() => busy);
    controller.offer({ postMessage: vi.fn() });
    controller.controllerChanged();
    expect(reload).not.toHaveBeenCalled();
    busy = false;
    expect(controller.tick()).toBe(true);
    expect(reload).toHaveBeenCalledOnce();
  });
  it("does not reload a reader when another tab activates the update", () => {
    let busy = true;
    const { controller, reload } = install(() => busy);
    controller.controllerChanged();
    expect(reload).not.toHaveBeenCalled();
    expect(controller.updating).toBe(false);
    busy = false;
    expect(controller.tick()).toBe(true);
    expect(reload).toHaveBeenCalledOnce();
  });
  it("first install claims the page without reloading it", () => {
    const reload = vi.fn();
    new AppUpdateController(
      false,
      () => false,
      reload,
      vi.fn(),
    ).controllerChanged();
    expect(reload).not.toHaveBeenCalled();
  });
  it("still reloads an uncontrolled tab after its update activates", () => {
    const reload = vi.fn();
    const controller = new AppUpdateController(
      false,
      () => false,
      reload,
      vi.fn(),
    );
    controller.offer({ postMessage: vi.fn() });
    controller.controllerChanged();
    expect(controller.updating).toBe(false);
    expect(reload).toHaveBeenCalledOnce();
  });
  it("lets the update run on any route, pausing only for typed text or an open surface", () => {
    expect(isUpdateBusy(false, false)).toBe(false);
    expect(isUpdateBusy(true, false)).toBe(true);
    expect(isUpdateBusy(false, true)).toBe(true);
  });
});
