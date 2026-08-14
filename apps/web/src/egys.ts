import {
  AccountProfileSchema,
  EgysProvidersSchema,
  EgysWhatsAppLoginStartedSchema,
  EgysWhatsAppLoginStateSchema,
  type AccountProfile,
  type EgysProviders,
} from "@gys/contracts";

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

export async function getEgysProviders(
  signal?: AbortSignal,
): Promise<EgysProviders | undefined> {
  if (!configuredBase()) return undefined;
  const response = await fetch(apiUrl("/api/v1/auth/providers"), {
    credentials: "include",
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(`e-GYS providers failed: ${response.status}`);
  const body: unknown = await response.json();
  const parsed = EgysProvidersSchema.safeParse(body);
  if (parsed.success) return parsed.data;
  const legacy = (body as { providers?: unknown })?.providers;
  return Array.isArray(legacy)
    ? EgysProvidersSchema.parse({
        google: { enabled: legacy.includes("google") },
        apple: { enabled: legacy.includes("apple") },
        whatsapp: false,
      })
    : undefined;
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

export async function startEgysWhatsAppLogin(signal?: AbortSignal) {
  if (!configuredBase()) throw new Error("e-GYS BFF is not configured");
  const response = await fetch(apiUrl("/api/v1/auth/whatsapp/start"), {
    method: "POST",
    credentials: "include",
    ...(signal ? { signal } : {}),
  });
  if (!response.ok)
    throw new Error(`e-GYS WhatsApp sign-in failed: ${response.status}`);
  return EgysWhatsAppLoginStartedSchema.parse(await response.json());
}

export async function getEgysWhatsAppState(
  token: string,
  signal?: AbortSignal,
) {
  if (!configuredBase()) throw new Error("e-GYS BFF is not configured");
  const response = await fetch(
    apiUrl(`/api/v1/auth/whatsapp/state?token=${encodeURIComponent(token)}`),
    {
      credentials: "include",
      cache: "no-store",
      ...(signal ? { signal } : {}),
    },
  );
  if (!response.ok)
    throw new Error(`e-GYS WhatsApp state failed: ${response.status}`);
  return EgysWhatsAppLoginStateSchema.parse(await response.json());
}

export async function signOutEgys(): Promise<void> {
  if (!configuredBase()) return;
  await fetch(apiUrl("/api/v1/auth/logout"), {
    method: "POST",
    credentials: "include",
  });
}
