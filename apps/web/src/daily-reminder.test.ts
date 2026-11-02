import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import {
  installDailyReminder,
  REMINDER_CHANGE_EVENT,
} from "./daily-reminder.js";
import { loadLocaleMessages, type Locale } from "./i18n.js";

// The notification text comes from the English chunk, so load it once.
beforeAll(async () => {
  await loadLocaleMessages("en");
});

let time: string | null;
let locale: Locale;
let notifications: string[];
let dispose: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 11, 19, 59));
  time = "20:00";
  locale = "id";
  notifications = [];
  const events = new EventTarget();
  vi.stubGlobal("window", events);
  vi.stubGlobal(
    "document",
    Object.assign(new EventTarget(), { visibilityState: "visible" }),
  );
  vi.stubGlobal("localStorage", { getItem: () => time });
  vi.stubGlobal(
    "Notification",
    class {
      static permission = "granted";
      constructor(title: string) {
        notifications.push(title);
      }
    },
  );
});
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("runs daily with the current language and cleans up every timer/listener", async () => {
  dispose = installDailyReminder(() => locale);
  locale = "en";
  await vi.advanceTimersByTimeAsync(60_000);
  expect(notifications).toEqual(["GYS quiet time"]);
  await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1_000);
  expect(notifications).toHaveLength(2);
  dispose();
  window.dispatchEvent(new Event(REMINDER_CHANGE_EVENT));
  expect(vi.getTimerCount()).toBe(0);
});

it("disabling the saved preference cancels an already scheduled reminder", async () => {
  dispose = installDailyReminder(() => locale);
  time = null;
  window.dispatchEvent(new Event(REMINDER_CHANGE_EVENT));
  await vi.advanceTimersByTimeAsync(61_000);
  expect(notifications).toEqual([]);
  expect(vi.getTimerCount()).toBe(0);
});

it("catches up once on the same day after background suspension", () => {
  dispose = installDailyReminder(() => locale);
  vi.setSystemTime(new Date(2026, 9, 11, 20, 5));
  window.dispatchEvent(new Event("focus"));
  document.dispatchEvent(new Event("visibilitychange"));
  expect(notifications).toEqual(["Waktu teduh GYS"]);
});

it("does not deliver yesterday's overdue reminder or schedule invalid times", () => {
  dispose = installDailyReminder(() => locale);
  vi.setSystemTime(new Date(2026, 9, 12, 12));
  window.dispatchEvent(new Event("focus"));
  expect(notifications).toEqual([]);
  time = "25:73";
  window.dispatchEvent(new Event(REMINDER_CHANGE_EVENT));
  expect(vi.getTimerCount()).toBe(0);
});
