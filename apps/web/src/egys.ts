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

async function request(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 8_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  const parent = init.signal;
  const abort = () => controller.abort();
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
}

export function clearEgysProfile(): void {
  try {
    localStorage.removeItem(EGYS_PROFILE_KEY);
  } catch {
    // ignore
  }
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
