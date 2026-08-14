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

  it("only proxies allowlisted TJC PDF sources and preserves ranges", async () => {
    const originalFetch = globalThis.fetch;
    let seenRange = "";
    globalThis.fetch = (async (_input, init) => {
      seenRange = new Headers(init?.headers).get("range") ?? "";
      return new Response(new Uint8Array([37, 80, 68, 70, 45]), {
        status: 206,
        headers: {
          "content-type": "application/pdf",
          "content-range": "bytes 0-4/5",
          "accept-ranges": "bytes",
        },
      });
    }) as typeof fetch;
    try {
      const app = createApp({
        allowedOrigins: ["http://localhost:5173"],
        chordManifest: manifest,
        content: [],
      });
      const denied = await app.request(
        `/api/v1/content/pdf?url=${encodeURIComponent("https://evil.example/file.pdf")}`,
        { headers: { Origin: "http://localhost:5173" } },
      );
      expect(denied.status).toBe(403);
      const proxied = await app.request(
        `/api/v1/content/pdf?url=${encodeURIComponent("https://tjc.org/id/file.pdf")}`,
        {
          headers: {
            Origin: "http://localhost:5173",
            range: "bytes=0-4",
          },
        },
      );
      expect(proxied.status).toBe(206);
      expect(proxied.headers.get("content-type")).toBe("application/pdf");
      expect(proxied.headers.get("access-control-allow-origin")).toBe(
        "http://localhost:5173",
      );
      expect(seenRange).toBe("bytes=0-4");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("proxies only canonical same-commit MIDI/chord assets", async () => {
    const originalFetch = globalThis.fetch;
    let seenUrl = "";
    globalThis.fetch = (async (input) => {
      seenUrl = String(input);
      return new Response(new Uint8Array([77, 84, 104, 100]), {
        status: 200,
        headers: { "content-type": "application/octet-stream" },
      });
    }) as typeof fetch;
    try {
      const app = createApp({
        allowedOrigins: ["http://localhost:5173"],
        chordManifest: manifest,
        content: [],
      });
      const denied = await app.request(
        `/api/v1/content/music?commit=cbc7d386&path=${encodeURIComponent("https://evil.example/file.mid")}`,
        { headers: { Origin: "http://localhost:5173" } },
      );
      expect(denied.status).toBe(403);
      const response = await app.request(
        `/api/v1/content/music?commit=cbc7d386&path=${encodeURIComponent("assets/midi/001_demo.mid")}`,
        { headers: { Origin: "http://localhost:5173", range: "bytes=0-3" } },
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe(
        "application/octet-stream",
      );
      expect(seenUrl).toContain("raw.githubusercontent.com/gyspnk/gyschordweb");
      expect(seenUrl).toContain("001_demo.mid");
    } finally {
      globalThis.fetch = originalFetch;
    }
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

  it("proxies validated Edge speech audio through a protected endpoint", async () => {
    const originalFetch = globalThis.fetch;
    let seenUrl = "";
    let seenBody = "";
    globalThis.fetch = (async (input, init) => {
      seenUrl = String(input);
      seenBody = String(init?.body ?? "");
      return new Response(new Uint8Array([73, 68, 51]), {
        status: 200,
        headers: { "content-type": "audio/mpeg", "content-length": "3" },
      });
    }) as typeof fetch;
    try {
      const app = createApp({
        allowedOrigins: ["http://localhost:5173"],
        chordManifest: manifest,
        content: [],
      });
      const response = await app.request(
        "/api/v1/tts/edge",
        {
          method: "POST",
          headers: {
            Origin: "http://localhost:5173",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            text: "Bacaan hari ini",
            voice: "id-ID-GadisNeural",
            rate: 0.9,
            pitch: 1,
            volume: 1,
          }),
        },
        { EDGE_TTS_URL: "https://speech.example/edge" },
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("audio/mpeg");
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(
        new Uint8Array([73, 68, 51]),
      );
      expect(seenUrl).toBe("https://speech.example/edge");
      expect(seenBody).toContain("Bacaan hari ini");
    } finally {
      globalThis.fetch = originalFetch;
    }
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

  it("serves allowlisted articles as sanitized internal-reader documents", async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(
        "<nav>Menu</nav><article><h1>Kesaksian resmi</h1><p>Isi <b>yang</b> dibaca.</p><script>bad()</script></article>",
        { headers: { "content-type": "text/html" } },
      );
    }) as typeof fetch;
    try {
      const app = createApp({
        allowedOrigins: ["http://localhost:5173"],
        chordManifest: manifest,
        content: [],
      });
      const invalid = await app.request(
        `/api/v1/content/article?url=${encodeURIComponent("https://evil.example/article")}`,
      );
      expect(invalid.status).toBe(403);
      const url = "https://tjc.org/id/kesaksian/resmi/";
      const first = await app.request(
        `/api/v1/content/article?url=${encodeURIComponent(url)}`,
      );
      expect(first.status).toBe(200);
      expect(await first.json()).toMatchObject({
        title: "Kesaksian resmi",
        body: "Kesaksian resmi\nIsi yang dibaca.",
      });
      const second = await app.request(
        `/api/v1/content/article?url=${encodeURIComponent(url)}`,
        { headers: { "if-none-match": first.headers.get("etag") ?? "" } },
      );
      expect(second.status).toBe(304);
      expect(calls).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("deduplicates simultaneous article fetches", async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return new Response("<article><p>Isi bersama.</p></article>", {
        headers: { "content-type": "text/html" },
      });
    }) as typeof fetch;
    try {
      const app = createApp({
        allowedOrigins: ["http://localhost:5173"],
        chordManifest: manifest,
        content: [],
      });
      const url = "https://tjc.org/id/kesaksian/serentak/";
      const [first, second] = await Promise.all([
        app.request(`/api/v1/content/article?url=${encodeURIComponent(url)}`),
        app.request(`/api/v1/content/article?url=${encodeURIComponent(url)}`),
      ]);
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(calls).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("serves the canonical Suara Sejati feed with thumbnails", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      Response.json([
        {
          id: 12,
          slug: "cahaya-kehidupan",
          date: "2023-12-13T00:00:00.000Z",
          link: "https://tjc.org/id/suarasejati/cahaya-kehidupan/",
          title: { rendered: "Cahaya Kehidupan" },
          excerpt: { rendered: "<p>Kesaksian terbaru.</p>" },
          _embedded: {
            "wp:featuredmedia": [
              { source_url: "https://tjc.org/id/wp-content/uploads/cover.jpg" },
            ],
          },
        },
      ])) as typeof fetch;
    try {
      const app = createApp({
        allowedOrigins: ["http://localhost:5173"],
        chordManifest: manifest,
        content: [],
      });
      const response = await app.request("/api/v1/content/suara-sejati");
      expect(response.status).toBe(200);
      const payload = (await response.json()) as {
        items: Array<{ title: string; imageUrl?: string }>;
      };
      expect(payload.items[0]).toMatchObject({
        title: "Cahaya Kehidupan",
        imageUrl: "https://tjc.org/id/wp-content/uploads/cover.jpg",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("normalizes e-GYS identity with branch and membership tracking", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/me"))
        return Response.json({
          accountId: "account-1",
          personId: "person-1",
          fullName: "Jemaat GYS",
          email: "jemaat@example.com",
          branchScope: "Jakarta Selatan",
          can: { viewMembers: true },
          language: "id",
        });
      if (url.endsWith("/api/v1/members/person-1"))
        return Response.json({
          id: "person-1",
          fullName: "Jemaat GYS",
          history: [
            {
              branchCode: "JKT-SEL",
              branchName: "Jakarta Selatan",
              memberStatus: "aktif",
              current: true,
            },
          ],
        });
      return new Response("not mocked", { status: 500 });
    }) as typeof fetch;
    try {
      const app = createApp({
        allowedOrigins: ["http://localhost:5173"],
        chordManifest: manifest,
        content: [],
      });
      const response = await app.request(
        "/api/v1/account/profile",
        { headers: { cookie: "EGYS_SESSION=test" } },
        { EGYS_API_BASE_URL: "https://egys.example" },
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        profile: {
          displayName: "Jemaat GYS",
          branchCode: "JKT-SEL",
          branchName: "Jakarta Selatan",
          memberStatus: "aktif",
          isMember: true,
        },
      });
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
