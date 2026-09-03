import { describe, expect, it, vi } from "vitest";
import { getEgysProfile, signInEgysWithGoogle } from "./egys.js";

describe("e-GYS client authentication boundary", () => {
  it("attaches the native v1 token only to the BFF request", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      expect(String(input)).toContain("/api/v1/account/profile");
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer live-v1-token");
      expect(headers.get("x-gys-client")).toBe("native");
      return Response.json({
        profile: {
          id: "42",
          displayName: "Jemaat Live",
          provider: "egys",
          locale: "id",
        },
      });
    });
    const invoke = vi.fn(async (command: string) => {
      expect(command).toBe("secret_get");
      return "live-v1-token";
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("__TAURI_INTERNALS__", { invoke });
    vi.stubGlobal("window", {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
    });
    try {
      await expect(getEgysProfile()).resolves.toMatchObject({
        id: "42",
        displayName: "Jemaat Live",
      });
      expect(invoke).toHaveBeenCalledWith("secret_get", {
        key: "egys-live-v1-token",
      });
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("surfaces the safe BFF rejection reason", async () => {
    vi.stubEnv("VITE_BFF_BASE_URL", "https://bff.example");
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() =>
        Promise.resolve(
          Response.json(
            {
              error: {
                code: "UNAUTHORIZED",
                message: "Token Google ditolak oleh e-GYS",
                requestId: "request-1",
              },
            },
            { status: 401 },
          ),
        ),
      ),
    );
    vi.stubGlobal("window", {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
      location: { pathname: "/lainnya", href: "https://bff.example/lainnya" },
    });
    try {
      await expect(signInEgysWithGoogle("google-id-token")).rejects.toThrow(
        "Token Google ditolak oleh e-GYS",
      );
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });
});
