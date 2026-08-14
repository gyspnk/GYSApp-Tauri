import { describe, expect, it } from "vitest";
import { createApp } from "./index.js";

const manifest = {
  version: 1 as const,
  sourceRepo: "gyspnk/gyschordweb",
  sourceCommit: "cbc7d386",
  generatedAt: "2026-08-14T00:00:00.000Z",
  entries: [],
};

describe("BFF public boundary", () => {
  it("rejects an origin outside the allowlist", async () => {
    const app = createApp({
      allowedOrigins: ["https://good.example"],
      chordManifest: manifest,
      content: [],
    });
    const response = await app.request("/api/v1/content/catalog", {
      headers: { Origin: "https://evil.example" },
    });
    expect(response.status).toBe(403);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    const payload = (await response.json()) as {
      error: { code: string; requestId: string };
    };
    expect(payload.error.code).toBe("FORBIDDEN");
    expect(response.headers.get("x-request-id")).toBe(payload.error.requestId);
  });

  it("serves catalog content with an allowed origin and cache headers", async () => {
    const app = createApp({
      allowedOrigins: ["https://good.example"],
      chordManifest: manifest,
      content: [
        {
          id: "a1",
          kind: "announcement",
          title: "<b>Welcome</b>",
          body: "<script>bad</script>Hello",
          updatedAt: "2026-08-14T00:00:00.000Z",
        },
      ],
    });
    const response = await app.request("/api/v1/content/catalog", {
      headers: { Origin: "https://good.example" },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://good.example",
    );
    expect(response.headers.get("cache-control")).toContain("max-age=60");
    const payload = (await response.json()) as { items: unknown[] };
    expect(payload.items).toHaveLength(1);
    expect(JSON.stringify(payload.items)).not.toContain("<script>");
    const unchanged = await app.request("/api/v1/content/catalog", {
      headers: {
        Origin: "https://good.example",
        "if-none-match": response.headers.get("etag") ?? "",
      },
    });
    expect(unchanged.status).toBe(304);
  });

  it("uses the deployment allowlist binding when provided", async () => {
    const app = createApp({
      allowedOrigins: ["https://fallback.example"],
      chordManifest: manifest,
      content: [],
    });
    const allowed = await app.request(
      "/api/v1/content/catalog",
      {
        headers: { Origin: "https://pages.example" },
      },
      { ALLOWED_ORIGINS: "https://pages.example" },
    );
    expect(allowed.status).toBe(200);
  });

  it("returns a typed validation error for an unknown content kind", async () => {
    const app = createApp({
      allowedOrigins: ["http://localhost:5173"],
      chordManifest: manifest,
      content: [],
    });
    const response = await app.request("/api/v1/content/unknown", {
      headers: { Origin: "http://localhost:5173" },
    });
    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns the immutable chord manifest with an ETag", async () => {
    const app = createApp({
      allowedOrigins: ["http://localhost:5173"],
      chordManifest: manifest,
      content: [],
    });
    const response = await app.request("/api/v1/chords/manifest", {
      headers: { Origin: "http://localhost:5173" },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("etag")).toContain("cbc7d386");
    const payload = (await response.json()) as { sourceCommit: string };
    expect(payload.sourceCommit).toBe("cbc7d386");
  });

  it("applies a configurable per-client rate limit", async () => {
    const app = createApp({
      allowedOrigins: ["http://localhost:5173"],
      chordManifest: manifest,
      content: [],
      rateLimit: { max: 1, windowMs: 60_000 },
    });
    const init = {
      headers: {
        Origin: "http://localhost:5173",
        "x-forwarded-for": "127.0.0.9",
      },
    };
    expect((await app.request("/api/v1/content/catalog", init)).status).toBe(
      200,
    );
    const response = await app.request("/api/v1/content/catalog", init);
    expect(response.status).toBe(429);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe("RATE_LIMITED");
  });

  it("rejects non-http report URLs and accepts sanitized text", async () => {
    const app = createApp({
      allowedOrigins: ["http://localhost:5173"],
      chordManifest: manifest,
      content: [],
    });
    const invalid = await app.request("/api/v1/report", {
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        category: "web",
        message: "<b>Issue</b>",
        url: "javascript:alert(1)",
      }),
    });
    expect(invalid.status).toBe(400);
    const valid = await app.request("/api/v1/report", {
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        category: "web",
        message: "<b>Issue</b>",
        url: "https://example.com/page",
      }),
    });
    expect(valid.status).toBe(202);
    expect(JSON.stringify(await valid.json())).not.toContain("<b>");
  });

  it("normalizes the live literature page and caches it", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        '<table id="posts-table-1"><tr><td><a href="https://tjc.org/id/kesaksian/demo/">Demo Kesaksian</a></td></tr></table>',
        { headers: { "content-type": "text/html" } },
      )) as typeof fetch;
    try {
      const app = createApp({
        allowedOrigins: ["http://localhost:5173"],
        chordManifest: manifest,
        content: [],
      });
      const first = await app.request("/api/v1/content/literature");
      expect(first.status).toBe(200);
      const payload = (await first.json()) as {
        items: Array<{ title: string }>;
      };
      expect(payload.items[0]?.title).toBe("Demo Kesaksian");
      const second = await app.request("/api/v1/content/literature", {
        headers: { "if-none-match": first.headers.get("etag") ?? "" },
      });
      expect(second.status).toBe(304);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("proxies and validates the e-GYS WhatsApp login flow", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/providers"))
        return Response.json({
          google: { enabled: false, clientId: null },
          apple: { enabled: false, clientId: null },
          whatsapp: true,
        });
      if (url.endsWith("/api/v1/auth/whatsapp/start"))
        return Response.json({
          pollToken: "poll-token",
          referenceCode: "GYS-1234",
          whatsappUrl: "https://api.whatsapp.com/send?phone=1",
          expiresAt: "2026-08-14T00:00:00.000Z",
        });
      if (url.includes("/api/v1/auth/whatsapp/state"))
        return Response.json({ state: "WAITING" });
      return new Response("not mocked", { status: 500 });
    }) as typeof fetch;
    try {
      const app = createApp({
        allowedOrigins: ["http://localhost:5173"],
        chordManifest: manifest,
        content: [],
      });
      const env = { EGYS_API_BASE_URL: "https://egys.example" };
      const providers = await app.request("/api/v1/auth/providers", {}, env);
      expect(providers.status).toBe(200);
      expect(((await providers.json()) as { whatsapp: boolean }).whatsapp).toBe(
        true,
      );
      const started = await app.request(
        "/api/v1/auth/whatsapp/start",
        { method: "POST" },
        env,
      );
      expect(started.status).toBe(200);
      expect(
        ((await started.json()) as { referenceCode: string }).referenceCode,
      ).toBe("GYS-1234");
      const state = await app.request(
        "/api/v1/auth/whatsapp/state?token=poll-token",
        {},
        env,
      );
      expect(state.status).toBe(200);
      expect(((await state.json()) as { state: string }).state).toBe("WAITING");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
