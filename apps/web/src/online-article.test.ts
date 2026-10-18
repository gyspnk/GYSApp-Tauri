import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchOnlineArticle, getCachedArticle } from "./online-article.js";

describe("online article compatibility reader", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses the allowlisted WordPress feed when the Worker is absent", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json([
        {
          id: 12,
          title: { rendered: "<b>Judul</b>" },
          content: {
            rendered:
              "<p>Isi pertama.</p><script>bad()</script><p>Isi kedua.</p>",
          },
          modified: "2026-08-14T00:00:00.000Z",
        },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    const retrievedAt = Date.now();
    const article = await fetchOnlineArticle(
      "https://tjc.org/id/suarasejati/judul/",
    );
    expect(article).toMatchObject({
      id: "12",
      title: "Judul",
      body: "Isi pertama.\nIsi kedua.",
      source: "tjc.org",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ headers: { accept: "application/json" } }),
    );
    expect(Date.parse(article.fetchedAt)).toBeGreaterThanOrEqual(retrievedAt);
    expect(
      await fetchOnlineArticle("https://tjc.org/id/suarasejati/judul/"),
    ).toEqual(article);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects an already-cancelled request before touching the network", async () => {
    const fetcher = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetcher);
    const controller = new AbortController();
    controller.abort();
    await expect(
      fetchOnlineArticle(
        "https://tjc.org/id/audit-pre-cancelled/",
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not start a fallback request when the reader cancels the primary request", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>(async () => {
      controller.abort();
      throw controller.signal.reason;
    });
    vi.stubGlobal("fetch", fetcher);
    await expect(
      fetchOnlineArticle(
        "https://tjc.org/id/audit-cancelled-primary/",
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("keeps the last good article readable offline while attempting to refresh an expired entry", async () => {
    const url = "https://tjc.org/id/audit-offline-article/";
    const article = {
      id: "offline",
      url,
      title: "Simpan bacaan",
      body: "Isi lengkap tersimpan.",
      source: "tjc.org",
      fetchedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    };
    const storage = {
      getItem: vi.fn(() => JSON.stringify(article)),
      removeItem: vi.fn(),
      setItem: vi.fn(),
    };
    vi.stubGlobal("window", {
      localStorage: storage,
      sessionStorage: storage,
      location: { pathname: "/suara/audit-offline-article" },
    });
    const fetcher = vi.fn<typeof fetch>(async () => {
      throw new TypeError("offline");
    });
    vi.stubGlobal("fetch", fetcher);
    expect(getCachedArticle(url)).toEqual(article);
    expect(await fetchOnlineArticle(url)).toEqual(article);
    expect(fetcher).toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it("writes one durable copy instead of duplicating full article bodies in both storage areas", async () => {
    const persistent = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    const session = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    vi.stubGlobal("window", {
      localStorage: persistent,
      sessionStorage: session,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json([
          { id: 21, content: { rendered: "<p>Complete article.</p>" } },
        ]),
      ),
    );
    await fetchOnlineArticle("https://tjc.org/id/audit-single-copy/");
    expect(persistent.setItem).toHaveBeenCalledOnce();
    expect(session.setItem).not.toHaveBeenCalled();
  });

  it("bounds the in-memory cache while retaining the most recently read article", async () => {
    const fetcher = vi.fn(async () =>
      Response.json([
        { id: 22, content: { rendered: "<p>Cached article.</p>" } },
      ]),
    );
    vi.stubGlobal("fetch", fetcher);
    for (let index = 0; index < 40; index++)
      await fetchOnlineArticle(`https://tjc.org/id/audit-cache-${index}/`);
    await fetchOnlineArticle("https://tjc.org/id/audit-cache-39/");
    expect(fetcher).toHaveBeenCalledTimes(40);
    await fetchOnlineArticle("https://tjc.org/id/audit-cache-0/");
    expect(fetcher).toHaveBeenCalledTimes(41);
  });

  it("prefers a newer session fallback when a full persistent store retained an older article", () => {
    const url = "https://tjc.org/id/audit-session-recovery/";
    const oldArticle = {
      id: "session",
      title: "Persistent copy",
      url,
      source: "tjc.org",
      body: "Older body",
      fetchedAt: new Date(Date.now() - 1000).toISOString(),
    };
    const latest = {
      ...oldArticle,
      body: "Latest complete body",
      fetchedAt: new Date().toISOString(),
    };
    const persistent = {
      getItem: () => JSON.stringify(oldArticle),
      removeItem: vi.fn(),
    };
    const session = {
      getItem: () => JSON.stringify(latest),
      removeItem: vi.fn(),
    };
    vi.stubGlobal("window", {
      localStorage: persistent,
      sessionStorage: session,
    });
    expect(getCachedArticle(url)).toEqual(latest);
    expect(persistent.removeItem).not.toHaveBeenCalled();
  });

  it("recovers a valid session copy when persistent article data is corrupt", () => {
    const url = "https://tjc.org/id/audit-session-corrupt-primary/";
    const article = {
      id: "session",
      title: "Session copy",
      url,
      source: "tjc.org",
      body: "Complete fallback",
      fetchedAt: new Date().toISOString(),
    };
    const persistent = { getItem: () => "{}", removeItem: vi.fn() };
    const session = {
      getItem: () => JSON.stringify(article),
      removeItem: vi.fn(),
    };
    vi.stubGlobal("window", {
      localStorage: persistent,
      sessionStorage: session,
    });
    expect(getCachedArticle(url)).toEqual(article);
    expect(session.removeItem).not.toHaveBeenCalled();
  });
});
