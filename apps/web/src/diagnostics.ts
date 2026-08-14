export type DiagnosticLevel = "info" | "warn" | "error";
export type DiagnosticEvent = {
  id: string;
  level: DiagnosticLevel;
  scope: string;
  message: string;
  timestamp: string;
  route?: string;
};

const KEY = "gys-diagnostics-v1";
const MAX_EVENTS = 80;
const listeners = new Set<() => void>();

function redact(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [redacted]")
    .replace(
      /(idToken|access_token|refresh_token|code|cookie)=?[^&\s]+/gi,
      "$1=[redacted]",
    )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function validEvent(value: unknown): value is DiagnosticEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as Partial<DiagnosticEvent>;
  return (
    typeof event.id === "string" &&
    event.id.length > 0 &&
    (event.level === "info" ||
      event.level === "warn" ||
      event.level === "error") &&
    typeof event.scope === "string" &&
    event.scope.length > 0 &&
    event.scope.length <= 80 &&
    typeof event.message === "string" &&
    event.message.length > 0 &&
    event.message.length <= 500 &&
    typeof event.timestamp === "string" &&
    !Number.isNaN(Date.parse(event.timestamp)) &&
    (event.route === undefined ||
      (typeof event.route === "string" && event.route.length <= 200))
  );
}

function read(): DiagnosticEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter(validEvent);
  } catch {
    return [];
  }
}

function write(events: DiagnosticEvent[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
  } catch {
    // Diagnostics must never break the application when storage is full.
  }
}

export function recordDiagnostic(
  level: DiagnosticLevel,
  scope: string,
  error: unknown,
): DiagnosticEvent {
  const raw = error instanceof Error ? error.message : String(error);
  const event: DiagnosticEvent = {
    id:
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    level,
    scope: scope.slice(0, 80),
    message: redact(raw || "Unknown error"),
    timestamp: new Date().toISOString(),
    ...(typeof window !== "undefined" && window.location.pathname
      ? { route: window.location.pathname }
      : {}),
  };
  write([...read(), event]);
  for (const listener of listeners) listener();
  return event;
}

export function getDiagnostics(): DiagnosticEvent[] {
  return read();
}

export function subscribeDiagnostics(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Install one global listener set; return the cleanup for tests/unmounts. */
export function installGlobalDiagnostics(): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onError = (event: ErrorEvent) => {
    recordDiagnostic("error", "window.error", event.error ?? event.message);
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    recordDiagnostic("error", "unhandled-rejection", event.reason);
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
