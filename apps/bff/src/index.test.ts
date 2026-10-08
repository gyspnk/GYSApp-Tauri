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
  it("keeps Cloudflare visitors in separate rate-limit buckets", async () => {
    const app = createApp({
      allowedOrigins: [],
      chordManifest: manifest,
      content: [],
      rateLimit: { max: 1, windowMs: 60_000 },
    });
    const request = (ip: string) =>
      app.request("/api/v1/content/catalog", {
        headers: { "cf-connecting-ip": ip },
      });
    expect((await request("192.0.2.1")).status).toBe(200);
    expect((await request("192.0.2.1")).status).toBe(429);
    expect((await request("192.0.2.2")).status).toBe(200);
  });
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
    const bytes = new Uint8Array(729_948).fill(0x20);
    bytes.set(new TextEncoder().encode("[]"));
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(bytes, {
        status: 200,
        headers: {
          "content-length": String(bytes.byteLength),
          "content-type": "application/json",
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
      const response = await app.request(
        "/api/v1/assets/distributed/HYMNE/index",
        { headers: { Origin: "https://good.example" } },
      );

      expect(response.status).toBe(200);
      const received = await response.arrayBuffer();
      expect(received.byteLength).toBe(bytes.byteLength);
      expect(new TextDecoder().decode(received).trim()).toBe("[]");
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
      expect(proxied.headers.get("cross-origin-resource-policy")).toBe(
        "cross-origin",
      );
      expect(proxied.headers.get("access-control-expose-headers")).toContain(
        "Content-Range",
      );
      expect(proxied.headers.get("access-control-expose-headers")).toContain(
        "Accept-Ranges",
      );
      expect(proxied.headers.get("content-range")).toBe("bytes 0-4/5");
      expect(seenRange).toBe("bytes=0-4");
      const s3Proxied = await app.request(
        `/api/v1/content/pdf?url=${encodeURIComponent(
          "https://tjcorguploads.s3.amazonaws.com/tjcorg/wp-content/uploads/sites/43/2025/12/WS126.pdf",
        )}`,
        { headers: { Origin: "http://localhost:5173" } },
      );
      expect(s3Proxied.status).toBe(206);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("resolves and caches an official issue PDF with minimal WordPress metadata", async () => {
    const originalFetch = globalThis.fetch;
    const pdf =
      "https://tjcorguploads.s3.amazonaws.com/tjcorg/wp-content/uploads/Pelita-Kecil-46-WEB.pdf";
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify([
            { content: { rendered: `<iframe src="${pdf}"></iframe>` } },
          ]),
        ),
      );
    globalThis.fetch = fetchMock;
    try {
      const app = createApp({
        allowedOrigins: ["https://good.example"],
        chordManifest: manifest,
        content: [],
      });
      const path = `/api/v1/content/pdf-source?url=${encodeURIComponent("https://tjc.org/id/pelitakecil/pk46/")}`;
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await app.request(path, {
          headers: { Origin: "https://good.example" },
        });
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ url: pdf });
        expect(response.headers.get("access-control-allow-origin")).toBe(
          "https://good.example",
        );
      }
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(String(fetchMock.mock.calls[0]![0])).toContain(
        "slug=pk46&per_page=1&_fields=content",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("rejects unsafe issue pages and reports missing PDF metadata for retry", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("[]"));
    globalThis.fetch = fetchMock;
    try {
      const app = createApp({
        allowedOrigins: [],
        chordManifest: manifest,
        content: [],
      });
      const unsafe = await app.request(
        `/api/v1/content/pdf-source?url=${encodeURIComponent("https://evil.example/id/warta-sejati/ws-4/")}`,
      );
      expect(unsafe.status).toBe(403);
      expect(fetchMock).not.toHaveBeenCalled();
      const missing = await app.request(
        `/api/v1/content/pdf-source?url=${encodeURIComponent("https://tjc.org/id/warta-sejati/ws-4/")}`,
      );
      expect(missing.status).toBe(503);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("falls back to the publisher when its S3 mirror is unavailable", async () => {
    const originalFetch = globalThis.fetch;
    const bytes = new Uint8Array([37, 80, 68, 70, 45]);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("<html>Publisher error</html>", {
          headers: { "content-type": "text/html" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(bytes, {
          status: 200,
          headers: { "content-type": "application/pdf" },
        }),
      );
    globalThis.fetch = fetchMock;
    try {
      const app = createApp({
        allowedOrigins: ["http://localhost:5173"],
        chordManifest: manifest,
        content: [],
      });
      const response = await app.request(
        `/api/v1/content/pdf?url=${encodeURIComponent(
          "https://tjc.org/id/wp-content/uploads/sites/43/2019/10/file.pdf",
        )}`,
      );
      expect(response.status).toBe(200);
      expect(await response.arrayBuffer()).toEqual(bytes.buffer);
      expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
        "tjcorguploads.s3.amazonaws.com/tjcorg/wp-content/uploads/sites/43/2019/10/file.pdf",
      );
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

  it("returns an empty optional Edge voice catalog when not configured", async () => {
    const app = createApp({
      allowedOrigins: ["http://localhost:5173"],
      chordManifest: manifest,
      content: [],
    });
    const response = await app.request("/api/v1/tts/edge/voices", {
      headers: { Origin: "http://localhost:5173" },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ voices: [] });
  });

  it("isolates bounded official PDF ranges from ordinary API quotas", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response("%PDF-", {
          status: 206,
          headers: { "content-type": "application/pdf" },
        }),
    );
    try {
      const app = createApp({
        allowedOrigins: ["http://localhost:5173"],
        chordManifest: manifest,
        content: [],
        rateLimit: { max: 1, windowMs: 60_000 },
      });
      const path = `/api/v1/content/pdf?url=${encodeURIComponent("https://tjc.org/file.pdf")}`;
      const init = { headers: { range: "bytes=0-1572863" } };
      for (let i = 0; i < 4; i++)
        expect((await app.request(path, init)).status).toBe(206);
      expect((await app.request(path, init)).status).toBe(429);
      expect((await app.request("/api/v1/content/catalog")).status).toBe(200);
      expect((await app.request("/api/v1/content/catalog")).status).toBe(429);
      // Invalid sources and unbounded/oversized ranges use the ordinary bucket.
      expect(
        (await app.request(path, { headers: { range: "bytes=0-" } })).status,
      ).toBe(429);
      expect(
        (await app.request(path, { headers: { range: "bytes=0-9999999" } }))
          .status,
      ).toBe(429);
      expect(
        (
          await app.request(
            "/api/v1/content/pdf?url=https://evil.example/file.pdf",
            init,
          )
        ).status,
      ).toBe(429);
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

  it("keeps official S3 PDF links in the literature catalog", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        '<div class="module module-accordion tb_9pdq304"><table id="table_1"><tr><td><a href="https://tjcorguploads.s3.amazonaws.com/tjcorg/wp-content/uploads/sites/43/2019/08/Panduan-Pemahaman-Alkitab-Yakobus-1-2-Petrus.pdf">Kitab Yakobus</a></td></tr><tr><td><a href="https://tjcorguploads.s3.amazonaws.com/tjcorg/wp-content/uploads/sites/43/2019/08/Panduan-Pemahaman-Alkitab-Tesalonika-Timotius-Titus.pdf">Kitab Tesalonika</a></td></tr></table></div>',
        { headers: { "content-type": "text/html" } },
      )) as typeof fetch;
    try {
      const app = createApp({
        allowedOrigins: ["http://localhost:5173"],
        chordManifest: manifest,
        content: [],
      });
      const response = await app.request("/api/v1/content/literature");
      expect(response.status).toBe(200);
      const payload = (await response.json()) as {
        items: Array<{ title: string; url: string; format: string }>;
      };
      expect(
        payload.items.some(
          (item) =>
            item.title === "Kitab Yakobus" &&
            item.url ===
              "https://tjcorguploads.s3.amazonaws.com/tjcorg/wp-content/uploads/sites/43/2019/08/Panduan-Pemahaman-Alkitab-Yakobus-1-2-Petrus.pdf" &&
            item.format === "pdf",
        ),
      ).toBe(true);
      expect(payload.items).toHaveLength(4);
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

  it("proxies allowlisted TJC images with CORS and cache headers", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input) => {
      const url = String(input);
      if (url.includes("tjc.org") || url.includes("amazonaws.com")) {
        return new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        });
      }
      return new Response("Not found", { status: 404 });
    }) as typeof fetch;
    try {
      const app = createApp({
        allowedOrigins: ["http://localhost:5173"],
        chordManifest: manifest,
        content: [],
      });
      const url = "https://tjc.org/id/wp-content/uploads/sites/43/cover.jpg";
      const response = await app.request(
        `/api/v1/content/image?url=${encodeURIComponent(url)}`,
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/jpeg");
      expect(response.headers.get("access-control-allow-origin")).toBe("*");
      expect(response.headers.get("cross-origin-resource-policy")).toBe(
        "cross-origin",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("keeps media error responses embeddable for the same UI origin", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response("Not found", { status: 404 })) as typeof fetch;
    try {
      const app = createApp({
        allowedOrigins: ["http://localhost:5173"],
        chordManifest: manifest,
        content: [],
      });
      const pdf = await app.request(
        `/api/v1/content/pdf?url=${encodeURIComponent("https://tjc.org/id/missing.pdf")}`,
      );
      const image = await app.request(
        `/api/v1/content/image?url=${encodeURIComponent("https://tjc.org/id/missing.jpg")}`,
      );
      expect(pdf.status).toBe(503);
      expect(image.status).toBe(503);
      expect(pdf.headers.get("cross-origin-resource-policy")).toBe(
        "cross-origin",
      );
      expect(image.headers.get("cross-origin-resource-policy")).toBe(
        "cross-origin",
      );
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
              {
                source_url: "https://tjc.org/id/wp-content/uploads/cover.jpg",
                media_details: {
                  sizes: {
                    medium: {
                      source_url:
                        "https://tjc.org/id/wp-content/uploads/cover-300x200.jpg",
                    },
                  },
                },
              },
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
        source: string;
        generatedAt: string;
        items: Array<{ title: string; imageUrl?: string }>;
      };
      expect(payload.source).toBe("tjc.org");
      expect(new Date(payload.generatedAt).toISOString()).toBe(
        payload.generatedAt,
      );
      expect(payload.items[0]).toMatchObject({
        title: "Cahaya Kehidupan",
        imageUrl: "https://tjc.org/id/wp-content/uploads/cover-300x200.jpg",
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

  it("returns a safe reason when e-GYS rejects the Google credential", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          error: true,
          message: "Token is not valid.",
          token: "must-not-leak",
        },
        { status: 200 },
      ),
    );
    try {
      const app = createApp({
        allowedOrigins: ["http://localhost:5173"],
        chordManifest: manifest,
        content: [],
      });
      const response = await app.request(
        "/api/v1/auth/egys/google",
        {
          method: "POST",
          headers: {
            Origin: "http://localhost:5173",
            "content-type": "application/json",
          },
          body: JSON.stringify({ credential: "google-id-token" }),
        },
        { EGYS_API_BASE_URL: "https://e.gys.or.id" },
      );

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body).toMatchObject({
        error: {
          code: "UNAUTHORIZED",
          message: "Token Google ditolak oleh e-GYS",
        },
      });
      expect(JSON.stringify(body)).not.toContain("must-not-leak");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it.each([
    ["referenceid", "mobilephone"],
    ["referenceId", "mobilePhone"],
  ])(
    "uses live v1 provider callbacks with %s and keeps tokens in HttpOnly cookies",
    async (referenceKey, phoneKey) => {
      const originalFetch = globalThis.fetch;
      const calls: Array<{ url: string; body: string }> = [];
      globalThis.fetch = (async (input, init) => {
        const url = String(input);
        calls.push({ url, body: String(init?.body) });
        return new Response(
          JSON.stringify(
            url.endsWith("whatsapp-login-request")
              ? {
                  [referenceKey]: "ref-123",
                  [phoneKey]: "62812345678",
                  content: "LOGIN ref-123",
                }
              : { token: "private-provider-token" },
          ),
          { headers: { "content-type": "application/json" } },
        );
      }) as typeof fetch;
      try {
        const app = createApp({
          allowedOrigins: ["http://localhost:5173"],
          chordManifest: manifest,
          content: [],
        });
        const env = { EGYS_API_BASE_URL: "https://e.gys.or.id" };
        const start = await app.request(
          "/api/v1/auth/egys/whatsapp/start",
          { method: "POST" },
          env,
        );
        expect(start.status).toBe(200);
        expect(start.headers.get("set-cookie")).toContain("HttpOnly");
        const confirm = await app.request(
          "/api/v1/auth/egys/whatsapp/confirm",
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              cookie: "egys_wa_reference=ref-123",
              origin: "http://localhost:5173",
            },
            body: JSON.stringify({
              otp: "123456",
              mobilephone: "628987654321",
              referenceid: "attacker-ref",
            }),
          },
          env,
        );
        expect(await confirm.json()).toEqual({ ok: true });
        expect(confirm.headers.get("set-cookie")).toContain(
          "egys_session=private-provider-token",
        );
        expect(calls[1]).toMatchObject({
          url: "https://e.gys.or.id/login/whatsapp-login-confirm",
        });
        expect(calls[1]!.body).toContain("referenceid=ref-123");
        expect(calls[1]!.body).toContain("mobilephone=628987654321");
        expect(calls[1]!.body).not.toContain("attacker-ref");
        const apple = await app.request(
          "/api/v1/auth/egys/apple",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              code: "apple-code",
              id_token: "apple-id-token",
            }),
          },
          env,
        );
        expect(await apple.json()).toEqual({ ok: true });
        expect(apple.headers.get("set-cookie")).toContain("HttpOnly");
        expect(calls[2]!.url).toBe("https://e.gys.or.id/auth/apple/callback");
        expect(JSON.parse(calls[2]!.body)).toEqual({
          code: "apple-code",
          id_token: "apple-id-token",
          ismobile: 1,
        });
        const missingSender = await app.request(
          "/api/v1/auth/egys/whatsapp/confirm",
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              cookie: "egys_wa_reference=ref-123",
              origin: "http://localhost:5173",
            },
            body: JSON.stringify({ otp: "123456" }),
          },
          env,
        );
        expect(missingSender.status).toBe(400);
        const invalid = await app.request(
          "/api/v1/auth/egys/whatsapp/confirm",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ otp: "123456" }),
          },
          env,
        );
        expect(invalid.status).not.toBe(200);
        expect(calls).toHaveLength(3);
      } finally {
        globalThis.fetch = originalFetch;
      }
    },
  );

  it("binds WhatsApp tracking to the cookie and trusted origin", async () => {
    const app = createApp({
      allowedOrigins: ["http://localhost:5173"],
      chordManifest: manifest,
      content: [],
    });
    const env = { EGYS_API_BASE_URL: "https://e.gys.or.id" };
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async (input, init) => {
      calls++;
      expect(String(input)).toBe("https://e.gys.or.id/wa-login/bound-ref");
      expect(new Headers(init?.headers).get("origin")).toBe(
        "https://e.gys.or.id",
      );
      return new Response("Tracking unavailable", { status: 403 });
    }) as typeof fetch;
    try {
      const unauthorized = await app.request(
        "/api/v1/auth/egys/whatsapp/track",
        { headers: { origin: "http://localhost:5173", upgrade: "websocket" } },
        env,
      );
      expect(unauthorized.status).toBe(401);
      const foreign = await app.request(
        "/api/v1/auth/egys/whatsapp/track",
        {
          headers: {
            origin: "https://attacker.example",
            cookie: "egys_wa_reference=bound-ref",
            upgrade: "websocket",
          },
        },
        env,
      );
      expect(foreign.status).toBe(403);
      expect(calls).toBe(0);
      const upstreamFailure = await app.request(
        "/api/v1/auth/egys/whatsapp/track?reference=attacker",
        {
          headers: {
            origin: "http://localhost:5173",
            cookie: "egys_wa_reference=bound-ref",
            upgrade: "websocket",
          },
        },
        env,
      );
      expect(upstreamFailure.status).toBe(503);
      expect(calls).toBe(1);
    } finally {
      globalThis.fetch = original;
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
