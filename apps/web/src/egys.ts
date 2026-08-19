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

export async function signOutEgys(): Promise<void> {
  try {
    await request(apiUrl("/api/v1/auth/logout"), {
      method: "POST",
      credentials: "include",
    });
  } finally {
    if (isTauriShell()) await removeNativeEgysToken();
  }
}
