import { translate, type Locale } from "./i18n.js";
import { recordDiagnostic } from "./diagnostics.js";

const TIME_KEY = "gys-reminder-time-v1";
export const REMINDER_CHANGE_EVENT = "gys-reminder-change";

function readTime(): string | undefined {
  try {
    const value = localStorage.getItem(TIME_KEY);
    return value && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

/** The saved schedule belongs to the app lifetime, independent of the settings draft. */
export function installDailyReminder(getLocale: () => Locale): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let due: Date | undefined;
  let scheduledTime: string | undefined;
  let disposed = false;
  const clear = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const notify = () => {
    try {
      if (
        typeof Notification !== "undefined" &&
        Notification.permission === "granted"
      ) {
        const locale = getLocale();
        new Notification(translate(locale, "more.notificationTitle"), {
          body: translate(locale, "more.notificationBody"),
        });
      }
    } catch (error) {
      recordDiagnostic("warn", "reminder.notify", error);
    }
  };
  const schedule = () => {
    clear();
    due = undefined;
    scheduledTime = readTime();
    if (disposed || !scheduledTime) return;
    const [hours, minutes] = scheduledTime.split(":").map(Number);
    due = new Date();
    due.setHours(hours!, minutes!, 0, 0);
    if (due.getTime() <= Date.now()) due.setDate(due.getDate() + 1);
    timer = setTimeout(deliver, Math.max(1, due.getTime() - Date.now()));
  };
  const deliver = () => {
    clear();
    if (disposed) return;
    const now = new Date();
    if (
      due &&
      scheduledTime === readTime() &&
      now.getTime() >= due.getTime() &&
      now.toDateString() === due.toDateString()
    )
      notify();
    schedule();
  };
  const onResume = () => {
    if (due && Date.now() >= due.getTime()) deliver();
    else schedule();
  };
  const onVisibility = () => {
    if (document.visibilityState === "visible") onResume();
  };
  const onStorage = (event: StorageEvent) => {
    if (
      (event.key === TIME_KEY || event.key === null) &&
      (!event.storageArea || event.storageArea === localStorage)
    )
      schedule();
  };
  window.addEventListener(REMINDER_CHANGE_EVENT, schedule);
  window.addEventListener("storage", onStorage);
  window.addEventListener("focus", onResume);
  document.addEventListener("visibilitychange", onVisibility);
  schedule();
  return () => {
    disposed = true;
    clear();
    window.removeEventListener(REMINDER_CHANGE_EVENT, schedule);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("focus", onResume);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
