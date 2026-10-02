import { describe, expect, it, vi } from "vitest";
import { AppUpdateController, isUpdateBusy } from "./app-update.js";

describe("safe app update activation", () => {
  it("withdraws a superseded worker without removing a newer offer", () => {
    const controller = new AppUpdateController(
      true,
      () => false,
      vi.fn(),
      vi.fn(),
    );
    const old = { postMessage: vi.fn() },
      next = { postMessage: vi.fn() };
    controller.offer(old);
    controller.offer(next);
    controller.withdraw(old);
    expect(controller.pending).toBe(true);
    controller.withdraw(next);
    expect(controller.pending).toBe(false);
    expect(controller.activate()).toBe(false);
  });
  it("requests activation only once and clears its progress after controller change", () => {
    const worker = { postMessage: vi.fn() };
    const controller = new AppUpdateController(
      true,
      () => false,
      vi.fn(),
      vi.fn(),
    );
    controller.offer(worker);
    expect(controller.activate()).toBe(true);
    expect(controller.updating).toBe(true);
    expect(controller.activate()).toBe(false);
    expect(worker.postMessage).toHaveBeenCalledOnce();
    controller.controllerChanged();
    expect(controller.updating).toBe(false);
  });
  it("keeps an installed update waiting while reading or editing", () => {
    const worker = { postMessage: vi.fn() },
      reload = vi.fn();
    let busy = true;
    const controller = new AppUpdateController(
      true,
      () => busy,
      reload,
      vi.fn(),
    );
    controller.offer(worker);
    expect(controller.pending).toBe(true);
    expect(controller.activate()).toBe(false);
    expect(worker.postMessage).not.toHaveBeenCalled();
    busy = false;
    expect(controller.activate()).toBe(true);
    expect(worker.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    expect(reload).not.toHaveBeenCalled();
    controller.controllerChanged();
    expect(reload).toHaveBeenCalledOnce();
  });
  it("does not reload a reader when another tab activates the update", () => {
    const reload = vi.fn();
    let busy = true;
    const controller = new AppUpdateController(
      true,
      () => busy,
      reload,
      vi.fn(),
    );
    controller.controllerChanged();
    expect(reload).not.toHaveBeenCalled();
    expect(controller.activate()).toBe(false);
    busy = false;
    expect(reload).not.toHaveBeenCalled();
    controller.activate();
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
  it("reloads an uncontrolled tab when its user explicitly activates a waiting update", () => {
    const reload = vi.fn();
    const controller = new AppUpdateController(
      false,
      () => false,
      reload,
      vi.fn(),
    );
    controller.offer({ postMessage: vi.fn() });
    expect(controller.activate()).toBe(true);
    controller.controllerChanged();
    expect(controller.updating).toBe(false);
    expect(reload).toHaveBeenCalledOnce();
  });
  it("rechecks activity after activation before reloading", () => {
    let busy = false;
    const reload = vi.fn();
    const controller = new AppUpdateController(
      true,
      () => busy,
      reload,
      vi.fn(),
    );
    controller.offer({ postMessage: vi.fn() });
    controller.activate();
    busy = true;
    controller.controllerChanged();
    expect(reload).not.toHaveBeenCalled();
  });
  it("protects reader routes, paused audio and dirty editors", () => {
    for (const path of [
      "/GYSApp-Tauri/bible",
      "/GYSApp-Tauri/kidung/hymn-001",
      "/GYSApp-Tauri/iman/topic",
      "/GYSApp-Tauri/literatur/article",
    ])
      expect(isUpdateBusy(path, "idle", "idle", false)).toBe(true);
    expect(
      isUpdateBusy("/GYSApp-Tauri/iman", "idle", "idle", false, true),
    ).toBe(true);
    expect(isUpdateBusy("/", "paused", "idle", false)).toBe(true);
    expect(isUpdateBusy("/", "idle", "paused", false)).toBe(true);
    expect(isUpdateBusy("/", "idle", "idle", true)).toBe(true);
    expect(isUpdateBusy("/GYSApp-Tauri/", "idle", "idle", false)).toBe(false);
  });
});
