import { AccountProfileSchema, type AccountProfile } from "@gys/contracts";

function apiUrl(path: string): string {
  const base = import.meta.env.VITE_BFF_BASE_URL?.trim();
  return base
    ? `${base.replace(/\/$/, "")}${path}`
    : `${import.meta.env.BASE_URL.replace(/\/$/, "")}${path}`;
}

function configuredBase(): string | undefined {
  return import.meta.env.VITE_BFF_BASE_URL?.trim();
}

export async function getEgysProfile(
  signal?: AbortSignal,
): Promise<AccountProfile | undefined> {
  if (!configuredBase()) return undefined;
  const response = await fetch(apiUrl("/api/v1/account/profile"), {
    credentials: "include",
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  if (response.status === 401 || response.status === 404) return undefined;
  if (!response.ok) throw new Error(`e-GYS profile failed: ${response.status}`);
  const body = (await response.json()) as { profile?: unknown };
  return body.profile ? AccountProfileSchema.parse(body.profile) : undefined;
}

export async function exchangeEgysToken(
  provider: "google" | "apple",
  idToken: string,
): Promise<void> {
  if (!configuredBase()) throw new Error("e-GYS BFF is not configured");
  const response = await fetch(apiUrl(`/api/v1/auth/exchange/${provider}`), {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!response.ok) throw new Error(`e-GYS sign-in failed: ${response.status}`);
}

export async function signOutEgys(): Promise<void> {
  if (!configuredBase()) return;
  await fetch(apiUrl("/api/v1/auth/logout"), {
    method: "POST",
    credentials: "include",
  });
}
