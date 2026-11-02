import { AccountProfileSchema, type AccountProfile } from "@gys/contracts";
import { recordDiagnostic } from "./diagnostics.js";
import {
  getNativeEgysToken,
  isTauriShell,
  removeNativeEgysToken,
} from "./native-platform.js";

function apiUrl(path: string): string {
  const base = import.meta.env.VITE_BFF_BASE_URL?.trim();
  return base
    ? `${base.replace(/\/$/, "")}${path}`
    : `${import.meta.env.BASE_URL.replace(/\/$/, "")}${path}`;
}

/**
 * A sign-in round trip to the provider outlives a plain data fetch: e-GYS
 * answers the WhatsApp start/confirm calls after its own upstream round trip,
 * which regularly passes eight seconds. Twenty seconds keeps the deadline
 * visible (the countdown owns 120 s) without letting a dead request hang.
 */
export const EGYS_LOGIN_TIMEOUT_MS = 20_000;

/** Abort with a reason so a timeout reads as a sentence, not "signal is aborted without reason". */
function abortReason(seconds: number): DOMException {
  return new DOMException(
    `e-GYS tidak menjawab dalam ${seconds} detik.`,
    "TimeoutError",
  );
}

/**
 * The provider's own failures arrive as provider JSON, but a timeout or a lost
 * connection surfaces as a DOMException whose message is browser-internal. Any
 * message that reaches the account panel goes through here first.
 */
export function describeEgysError(error: unknown): string {
  if (error instanceof DOMException || error instanceof Error) {
    const message = error.message ?? "";
    // Route wording from the BFF comes first: it names the failed step and the
    // provider detail in parentheses is what support reads.
    const detail = message.match(/\(e-GYS [^)]*\)/)?.[0] ?? "";
    if (/whatsapp login is unavailable/i.test(message))
      return `Login WhatsApp sedang tidak tersedia. Coba lagi sebentar lagi.${detail ? ` ${detail}` : ""}`;
    if (/whatsapp code could not be verified/i.test(message))
      return `Kode WhatsApp tidak dapat diverifikasi.${detail ? ` ${detail}` : ""}`;
    if (error.name === "TimeoutError" || /timed? ?out/i.test(message))
      return "e-GYS tidak menjawab tepat waktu. Periksa koneksi lalu coba lagi.";
    if (error.name === "AbortError" || /aborted without reason/i.test(message))
      return "Permintaan ke e-GYS dibatalkan sebelum selesai. Coba lagi.";
    if (
      /failed to fetch|networkerror|load failed|network request failed/i.test(
        message,
      )
    )
      return "Tidak dapat menghubungi server e-GYS. Periksa koneksi lalu coba lagi.";
    if (message.trim()) return message;
  }
  return "Login e-GYS belum berhasil. Coba lagi.";
}

async function request(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 8_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(
    () => controller.abort(abortReason(Math.round(timeoutMs / 1000))),
    timeoutMs,
  );
  const parent = init.signal;
  const abort = () =>
    controller.abort(new DOMException("Permintaan dibatalkan.", "AbortError"));
  parent?.addEventListener("abort", abort, { once: true });
  const headers = new Headers(init.headers);
  // Tauri webviews do not always emit browser Fetch Metadata headers. The
  // BFF accepts this explicit marker for native cookie-authenticated
  // mutations, while the browser path remains protected by Origin checks.
  if (isTauriShell()) headers.set("x-gys-client", "native");
  if (isTauriShell() && !headers.has("authorization")) {
    try {
      const token = await getNativeEgysToken();
      if (token) headers.set("authorization", `Bearer ${token}`);
    } catch (error) {
      recordDiagnostic("warn", "egys.native-token.read", error);
    }
  }
  try {
    return await fetch(input, {
      ...init,
      headers,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timer);
    parent?.removeEventListener("abort", abort);
  }
}

const SESSION_KEY = "gys-egys-session-v1";

export type EgysSessionTrace = {
  userId: string;
  displayName?: string;
  branchCode?: string;
  branchName?: string;
  isMember?: boolean;
  firstLoginAt: string;
  lastSeenAt: string;
};

function readSession(): EgysSessionTrace | undefined {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as { userId?: unknown }).userId === "string"
    )
      return parsed as EgysSessionTrace;
  } catch {
    // corrupt trace: start fresh
  }
  return undefined;
}

function writeSession(trace: EgysSessionTrace) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(trace));
  } catch {
    // storage quota must not break auth
  }
}

/**
 * Device-side login tracking: every successful profile read updates
 * `lastSeenAt`; a different account resets `firstLoginAt`. This powers the
 * settings screen's "login terakhir" indicator without storing tokens.
 */
export function trackEgysProfileSeen(
  profile: AccountProfile,
): EgysSessionTrace {
  const now = new Date().toISOString();
  const previous = readSession();
  if (previous && previous.userId === profile.id) {
    const next = {
      ...previous,
      ...(profile.displayName ? { displayName: profile.displayName } : {}),
      ...(profile.branchCode ? { branchCode: profile.branchCode } : {}),
      ...(profile.branchName ? { branchName: profile.branchName } : {}),
      ...(profile.isMember !== undefined ? { isMember: profile.isMember } : {}),
      lastSeenAt: now,
    };
    writeSession(next);
    return next;
  }
  const fresh: EgysSessionTrace = {
    userId: profile.id,
    ...(profile.displayName ? { displayName: profile.displayName } : {}),
    ...(profile.branchCode ? { branchCode: profile.branchCode } : {}),
    ...(profile.branchName ? { branchName: profile.branchName } : {}),
    ...(profile.isMember !== undefined ? { isMember: profile.isMember } : {}),
    firstLoginAt: now,
    lastSeenAt: now,
  };
  writeSession(fresh);
  return fresh;
}

export function readEgysSessionTrace(): EgysSessionTrace | undefined {
  return readSession();
}

export function clearEgysSessionTrace() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

export async function getEgysProfile(
  signal?: AbortSignal,
): Promise<AccountProfile | undefined> {
  const response = await request(apiUrl("/api/v1/account/profile"), {
    credentials: "include",
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  if (response.status === 401 || response.status === 404) return undefined;
  if (!response.ok) {
    const failure = new Error(`e-GYS profile failed: ${response.status}`);
    recordDiagnostic("error", "egys.profile", failure);
    throw failure;
  }
  const body = (await response.json()) as { profile?: unknown };
  return body.profile ? AccountProfileSchema.parse(body.profile) : undefined;
}

export async function signInEgysWithGoogle(credential: string): Promise<void> {
  if (!credential.trim()) throw new Error("Google credential is empty");
  const response = await request(apiUrl("/api/v1/auth/egys/google"), {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ credential }),
  });
  const body = (await response.json().catch(() => undefined)) as
    { ok?: unknown; error?: { message?: unknown } } | undefined;
  if (!response.ok || body?.ok !== true) {
    const message =
      typeof body?.error?.message === "string" && body.error.message.trim()
        ? body.error.message.trim()
        : `e-GYS Google login failed: ${response.status}`;
    const failure = new Error(message);
    recordDiagnostic("error", "egys.google-login", failure);
    throw failure;
  }
}

export const EGYS_PROFILE_KEY = "gys-egys-profile-v1";
const PROFILE_CHANGED = "gys-egys-profile-changed";

export function subscribeEgysProfile(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === EGYS_PROFILE_KEY || event.key === null) listener();
  };
  window.addEventListener(PROFILE_CHANGED, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(PROFILE_CHANGED, listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function readCachedEgysProfile(): AccountProfile | undefined {
  try {
    const raw = localStorage.getItem(EGYS_PROFILE_KEY);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    const validated = AccountProfileSchema.safeParse(parsed);
    return validated.success ? validated.data : undefined;
  } catch {
    return undefined;
  }
}

export function saveEgysProfile(profile: AccountProfile): void {
  try {
    localStorage.setItem(EGYS_PROFILE_KEY, JSON.stringify(profile));
    trackEgysProfileSeen(profile);
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(PROFILE_CHANGED));
}

export function clearEgysProfile(): void {
  try {
    localStorage.removeItem(EGYS_PROFILE_KEY);
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(PROFILE_CHANGED));
}

export async function signOutEgys(): Promise<void> {
  try {
    await request(apiUrl("/api/v1/auth/logout"), {
      method: "POST",
      credentials: "include",
    });
  } finally {
    if (isTauriShell()) await removeNativeEgysToken();
    clearEgysSessionTrace();
    clearEgysProfile();
  }
}

export async function requestEgysProvider<T>(
  provider: string,
  data: object = {},
  signal?: AbortSignal,
  timeoutMs = 8_000,
): Promise<T> {
  const response = await request(
    apiUrl(`/api/v1/auth/egys/${provider}`),
    {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
      ...(signal ? { signal } : {}),
    },
    timeoutMs,
  );
  const body = await response.json().catch(() => undefined);
  if (!response.ok) {
    const message =
      typeof body === "object" && body !== null && "error" in body
        ? (body as { error?: { message?: string } }).error?.message
        : undefined;
    throw new Error(message || "Login e-GYS belum berhasil");
  }
  return body as T;
}

export function egysWhatsAppTrackingUrl(): string {
  const url = new URL(
    apiUrl("/api/v1/auth/egys/whatsapp/track"),
    window.location.href,
  );
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}
