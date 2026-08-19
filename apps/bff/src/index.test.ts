import { describe, expect, it, vi } from "vitest";
import { createApp } from "./index.js";

const manifest = {
  version: 1 as const,
  sourceRepo: "gyspnk/gyschordweb",
  sourceCommit: "a3d1ea7",
  generatedAt: "2026-08-14T00:00:00.000Z",
  entries: [],
};

describe("BFF public boundary", () => {
  it("streams an allowlisted distributed package selected from its trusted manifest", async () => {
    const originalFetch = globalThis.fetch;
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            track: "bibles",
            releaseTag: "bibles-2026.05.21",
            publishedAt: "2026-05-21T06:43:39.809Z",
            packages: [
              {
                code: "b_kjv",
                version: "2026.05.21",
                fileName: "b_kjv.gyspkg",
                downloadUrl:
                  "https://github.com/ThenGB/GYSApp-Data/releases/download/bibles-2026.05.21/b_kjv.gyspkg",
                installFileName: "b_kjv.db",
                sizeBytes: bytes.byteLength,
                checksumSha256:
                  "9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(bytes, {
          status: 200,
          headers: {
            "content-type": "application/octet-stream",
            "content-length": String(bytes.byteLength),
          },
        }),
      );
    globalThis.fetch = fetchMock;
    try {
      const app = createApp({
        allowedOrigins: ["https://good.example"],
        chordManifest: manifest,
        content: [],
      });
      const response = await app.request("/api/v1/assets/distributed/b_kjv", {
        headers: { Origin: "https://good.example" },
      });

      expect(response.status).toBe(200);
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
      expect(response.headers.get("content-length")).toBe("4");
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("rejects an unknown distributed asset without fetching upstream", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn<typeof fetch>();
    globalThis.fetch = fetchMock;
    try {
      const app = createApp({
        allowedOrigins: ["https://good.example"],
        chordManifest: manifest,
        content: [],
      });
      const response = await app.request(
        "/api/v1/assets/distributed/not-allowed",
        { headers: { Origin: "https://good.example" } },
      );

      expect(response.status).toBe(404);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("cuts off a chunked distributed package larger than its manifest", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          track: "bibles",
          releaseTag: "bibles-2026.05.21",
          publishedAt: "2026-05-21T06:43:39.809Z",
          packages: [
            {
              code: "b_kjv",
              version: "2026.05.21",
              fileName: "b_kjv.gyspkg",
              downloadUrl:
                "https://github.com/ThenGB/GYSApp-Data/releases/download/bibles-2026.05.21/b_kjv.gyspkg",
              installFileName: "b_kjv.db",
              sizeBytes: 4,
              checksumSha256: "a".repeat(64),
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3, 4, 5]), { status: 200 }),
      );
    try {
      const app = createApp({
        allowedOrigins: ["https://good.example"],
        chordManifest: manifest,
        content: [],
      });
      const response = await app.request("/api/v1/assets/distributed/b_kjv", {
        headers: { Origin: "https://good.example" },
      });

      await expect(response.arrayBuffer()).rejects.toThrow(
        "Distributed asset exceeds manifest size",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("streams only the pinned metadata index for an optional hymnal", async () => {
    const originalFetch = globalThis.fetch;
    const bytes = new TextEncoder().encode("[]");
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(bytes, {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    globalThis.fetch = fetchMock;
    try {
      const app = createApp({
        allowedOrigins: ["https://good.example"],
        chordManifest: manifest,
        content: [],
      });
      const response = await app.request(
        "/api/v1/assets/distributed/HYMNE/index",
        { headers: { Origin: "https://good.example" } },
      );

      expect(response.status).toBe(200);
      expect(new TextDecoder().decode(await response.arrayBuffer())).toBe("[]");
      expect(fetchMock).toHaveBeenCalledWith(
        "https://raw.githubusercontent.com/ThenGB/GYSAPP-Fork/4f0d39b/assets/data/index/hymne_index.json",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("does not fetch a non-TJC Sauh source binding", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn<typeof fetch>();
    globalThis.fetch = fetchMock;
    try {
      const app = createApp({
        allowedOrigins: ["https://good.example"],
        chordManifest: manifest,
        content: [],
      });
      const response = await app.request(
        "/api/v1/content/sauh",
        { headers: { Origin: "https://good.example" } },
        { SAUH_SOURCE_URL: "https://evil.example/wp-json/wp/v2/posts" },
      );
      expect(response.status).toBe(200);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("does not expose the draft e-GYS v2 provider route", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn<typeof fetch>();
    globalThis.fetch = fetchMock;
    try {
      const app = createApp({
        allowedOrigins: ["https://good.example"],
        chordManifest: manifest,
        content: [],
      });
      const response = await app.request(
        "/api/v1/auth/providers",
        { headers: { Origin: "https://good.example" } },
        { EGYS_API_BASE_URL: "http://evil.example" },
      );
      expect(response.status).toBe(404);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

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

  it("requires a trusted origin for cookie-authenticated state changes", async () => {
    const app = createApp({
      allowedOrigins: ["https://good.example"],
      chordManifest: manifest,
      content: [],
    });
    const blocked = await app.request("/api/v1/auth/logout", {
      method: "POST",
      headers: { cookie: "egys_session=opaque" },
    });
    expect(blocked.status).toBe(403);
    const blockedBody = (await blocked.json()) as {
      error: { code: string };
    };
    expect(blockedBody.error.code).toBe("FORBIDDEN");

    const sameSite = await app.request("/api/v1/auth/logout", {
      method: "POST",
      headers: {
        cookie: "egys_session=opaque",
        "sec-fetch-site": "same-origin",
      },
    });
    expect(sameSite.status).toBe(204);

    const allowed = await app.request("/api/v1/auth/logout", {
      method: "POST",
      headers: {
        cookie: "egys_session=opaque",
        Origin: "https://good.example",
      },
    });
    expect(allowed.status).toBe(204);

    const native = await app.request("/api/v1/auth/logout", {
      method: "POST",
      headers: {
        cookie: "egys_session=opaque",
        "x-gys-client": "native",
      },
    });
    expect(native.status).toBe(204);
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
        `/api/v1/content/music?commit=a3d1ea7&path=${encodeURIComponent("https://evil.example/file.mid")}`,
        { headers: { Origin: "http://localhost:5173" } },
      );
      expect(denied.status).toBe(403);
      const response = await app.request(
        `/api/v1/content/music?commit=a3d1ea7&path=${encodeURIComponent("assets/midi/001_demo.mid")}`,
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

  it("proxies only the immutable GYSApp-Fork master PDF", async () => {
    const originalFetch = globalThis.fetch;
    let seenUrl = "";
    globalThis.fetch = (async (input) => {
      seenUrl = String(input);
      return new Response(new Uint8Array([37, 80, 68, 70, 45]), {
        status: 206,
        headers: {
          "content-type": "application/pdf",
          "content-range": "bytes 0-4/5",
          "content-length": "5",
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
        "/api/v1/content/fork-pdf?commit=4f0d39b&path=assets%2Fdata%2Fpdf%2Fkr%2Fother.pdf",
        { headers: { Origin: "http://localhost:5173" } },
      );
      expect(denied.status).toBe(403);
      const response = await app.request(
        "/api/v1/content/fork-pdf?commit=4f0d39b&path=assets%2Fdata%2Fpdf%2Fkr%2Fkr_master.pdf",
        { headers: { Origin: "http://localhost:5173", range: "bytes=0-4" } },
      );
      expect(response.status).toBe(206);
      expect(response.headers.get("content-type")).toBe("application/pdf");
      expect(response.headers.get("content-range")).toBe("bytes 0-4/5");
      expect(seenUrl).toContain("raw.githubusercontent.com/ThenGB/GYSAPP-Fork");
      expect(seenUrl).toContain("kr_master.pdf");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("accepts an octet-stream content type from the immutable Fork PDF source", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(new Uint8Array([37, 80, 68, 70, 45]), {
        status: 206,
        headers: {
          "content-type": "application/octet-stream",
          "content-range": "bytes 0-4/5",
          "content-length": "5",
        },
      })) as typeof fetch;
    try {
      const app = createApp({
        allowedOrigins: ["http://localhost:5173"],
        chordManifest: manifest,
        content: [],
      });
      const response = await app.request(
        "/api/v1/content/fork-pdf?commit=4f0d39b&path=assets%2Fdata%2Fpdf%2Fkr%2Fkr_master.pdf",
        { headers: { Origin: "http://localhost:5173", range: "bytes=0-4" } },
      );
      expect(response.status).toBe(206);
      expect(response.headers.get("content-type")).toBe("application/pdf");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("rejects a full Fork PDF when the immutable size or hash drifts", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(new Uint8Array([37, 80, 68, 70, 45]), {
        status: 200,
        headers: { "content-type": "application/pdf" },
      })) as typeof fetch;
    try {
      const app = createApp({
        allowedOrigins: ["http://localhost:5173"],
        chordManifest: manifest,
        content: [],
      });
      const response = await app.request(
        "/api/v1/content/fork-pdf?commit=4f0d39b&path=assets%2Fdata%2Fpdf%2Fkr%2Fkr_master.pdf",
      );
      expect(response.status).toBe(502);
      expect(
        ((await response.json()) as { error: { code: string } }).error.code,
      ).toBe("INTEGRITY_ERROR");
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
    expect(response.headers.get("etag")).toContain("a3d1ea7");
    const payload = (await response.json()) as { sourceCommit: string };
    expect(payload.sourceCommit).toBe("a3d1ea7");
  });

  it("exposes verified e-GYS OpenAPI provenance without proxying the document", async () => {
    const app = createApp({
      allowedOrigins: ["http://localhost:5173"],
      chordManifest: manifest,
      content: [],
    });
    const response = await app.request("/api/v1/meta/egys");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      sourceRepo: "Gereja-Yesus-Sejati/egys",
      openApi: {
        available: true,
        docsPath: "/v3/api-docs",
        uiPath: "/swagger-ui.html",
        enabledBy: "springdoc.api-docs.enabled",
        schemas: "generated-from-controllers",
      },
    });
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

  it("normalizes a validated Edge voice catalog without exposing its URL", async () => {
    const originalFetch = globalThis.fetch;
    let seenUrl = "";
    globalThis.fetch = (async (input) => {
      seenUrl = String(input);
      return new Response(
        JSON.stringify([
          { id: "id-ID-GadisNeural", name: "Gadis", language: "id-ID" },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;
    try {
      const app = createApp({
        allowedOrigins: ["http://localhost:5173"],
        chordManifest: manifest,
        content: [],
      });
      const response = await app.request(
        "/api/v1/tts/edge/voices",
        { headers: { Origin: "http://localhost:5173" } },
        { EDGE_TTS_VOICES_URL: "https://speech.example/voices" },
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        voices: [
          {
            id: "id-ID-GadisNeural",
            name: "Gadis",
            language: "id-ID",
            local: false,
          },
        ],
      });
      expect(seenUrl).toBe("https://speech.example/voices");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("rejects an invalid Edge voice catalog payload", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ voices: [{ id: "not valid" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;
    try {
      const app = createApp({
        allowedOrigins: ["http://localhost:5173"],
        chordManifest: manifest,
        content: [],
      });
      const response = await app.request(
        "/api/v1/tts/edge/voices",
        { headers: { Origin: "http://localhost:5173" } },
        { EDGE_TTS_VOICES_URL: "https://speech.example/voices" },
      );
      expect(response.status).toBe(502);
      expect(
        ((await response.json()) as { error: { code: string } }).error.code,
      ).toBe("INTEGRITY_ERROR");
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

  it("rejects invalid report URLs and fails closed when no report sink exists", async () => {
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
    const unavailable = await app.request("/api/v1/report", {
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
    expect(unavailable.status).toBe(503);
    const payload = (await unavailable.json()) as {
      error: { code: string; message: string };
    };
    expect(payload.error.code).toBe("UPSTREAM_UNAVAILABLE");
    expect(payload.error.message).toContain("not configured");
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

  it("keeps undated literature versions stable across catalog refreshes", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        '<table id="posts-table-1"><tr><td><a href="https://tjc.org/id/files/demo.pdf">Demo PDF</a></td></tr></table>',
        { headers: { "content-type": "text/html" } },
      )) as typeof fetch;
    try {
      const readVersion = async () => {
        const app = createApp({
          allowedOrigins: ["http://localhost:5173"],
          chordManifest: manifest,
          content: [],
        });
        const response = await app.request("/api/v1/content/literature");
        const payload = (await response.json()) as {
          items: Array<{ updatedAt: string }>;
        };
        return payload.items[0]?.updatedAt;
      };
      const first = await readVersion();
      await new Promise((resolve) => setTimeout(resolve, 5));
      const second = await readVersion();
      expect(first).toBe(second);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("shares a simultaneous literature upstream request", async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return new Response(
        '<table id="posts-table-1"><tr><td><a href="https://tjc.org/id/kesaksian/shared/">Shared</a></td></tr></table>',
        { headers: { "content-type": "text/html" } },
      );
    }) as typeof fetch;
    try {
      const app = createApp({
        allowedOrigins: ["http://localhost:5173"],
        chordManifest: manifest,
        content: [],
      });
      const [first, second] = await Promise.all([
        app.request(
          "/api/v1/content/literature",
          {},
          { LITERATURE_SOURCE_URL: "https://tjc.org/id/literature" },
        ),
        app.request(
          "/api/v1/content/literature",
          {},
          { LITERATURE_SOURCE_URL: "https://tjc.org/id/literature" },
        ),
      ]);
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      // One primary page and one optional book page are fetched by the shared
      // catalog request; the second concurrent route must not repeat either.
      expect(calls).toBe(2);
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

  it("filters non-TJC Suara links and thumbnails", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      Response.json([
        {
          id: 14,
          slug: "foreign-suara",
          date: "2023-12-15T00:00:00.000Z",
          link: "https://evil.example/suara/foreign-suara",
          title: { rendered: "Sumber asing" },
          excerpt: { rendered: "<p>Kesaksian.</p>" },
        },
        {
          id: 15,
          slug: "safe-suara",
          date: "2023-12-16T00:00:00.000Z",
          link: "https://tjc.org/id/suarasejati/safe-suara/",
          title: { rendered: "Sumber aman" },
          excerpt: { rendered: "<p>Kesaksian.</p>" },
          _embedded: {
            "wp:featuredmedia": [
              { source_url: "https://evil.example/image.jpg" },
            ],
          },
        },
        {
          id: 16,
          slug: "invalid-date-suara",
          date: "not-a-date",
          link: "https://tjc.org/id/suarasejati/invalid-date-suara/",
          title: { rendered: "Tanggal rusak" },
          excerpt: { rendered: "<p>Kesaksian.</p>" },
        },
      ])) as typeof fetch;
    try {
      const app = createApp({
        allowedOrigins: ["http://localhost:5173"],
        chordManifest: manifest,
        content: [],
      });
      const response = await app.request(
        "/api/v1/content/suara-sejati",
        {},
        { SUARA_SOURCE_URL: "https://tjc.org/id/wp-json/suara" },
      );
      expect(response.status).toBe(200);
      const payload = (await response.json()) as {
        items: Array<{ id: string; imageUrl?: string }>;
      };
      expect(payload.items).toHaveLength(1);
      expect(payload.items[0]).toMatchObject({ id: "safe-suara" });
      expect(payload.items[0]?.imageUrl).toBeUndefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("shares a simultaneous Suara Sejati upstream request", async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return Response.json([
        {
          id: 13,
          slug: "shared-suara",
          date: "2023-12-14T00:00:00.000Z",
          link: "https://tjc.org/id/suarasejati/shared-suara/",
          title: { rendered: "Shared Suara" },
          excerpt: { rendered: "<p>Kesaksian bersama.</p>" },
        },
      ]);
    }) as typeof fetch;
    try {
      const app = createApp({
        allowedOrigins: ["http://localhost:5173"],
        chordManifest: manifest,
        content: [],
      });
      const [first, second] = await Promise.all([
        app.request(
          "/api/v1/content/suara-sejati",
          {},
          { SUARA_SOURCE_URL: "https://tjc.org/id/wp-json/suara" },
        ),
        app.request(
          "/api/v1/content/suara-sejati",
          {},
          { SUARA_SOURCE_URL: "https://tjc.org/id/wp-json/suara" },
        ),
      ]);
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(calls).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("normalizes the live e-GYS v1 profile for native bearer sessions", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/v1/users/profile")) {
        expect(new Headers(init?.headers).get("authorization")).toBe(
          "Bearer live-v1-token",
        );
        return Response.json({
          data: [
            {
              id: 42,
              email: "jemaat@example.com",
              name: "Jemaat Live",
              branchname: "Jakarta Selatan",
              member_type: "Jemaat",
              status: "ACTIVE",
            },
          ],
          token: "must-not-leak",
        });
      }
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
        {
          headers: {
            authorization: "Bearer live-v1-token",
            "x-gys-client": "native",
          },
        },
        { EGYS_API_BASE_URL: "https://e.gys.or.id" },
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        profile: {
          id: "42",
          displayName: "Jemaat Live",
          email: "jemaat@example.com",
          branchName: "Jakarta Selatan",
          memberStatus: "Jemaat",
          isMember: true,
          provider: "egys",
          locale: "id",
        },
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("does not expose draft e-GYS v2 login routes", async () => {
    const app = createApp({
      allowedOrigins: ["http://localhost:5173"],
      chordManifest: manifest,
      content: [],
    });
    const requests = [
      app.request("/api/v1/auth/whatsapp/start", { method: "POST" }),
      app.request("/api/v1/auth/whatsapp/state?token=poll-token"),
      app.request("/api/v1/auth/exchange/google", { method: "POST" }),
    ];

    await expect(
      Promise.all(requests).then((items) => items.map((item) => item.status)),
    ).resolves.toEqual([404, 404, 404]);
  });
});
