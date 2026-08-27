import { describe, expect, it, vi } from "vitest";
import {
  firstParagraph,
  expectedSauhSlug,
  onlyTodaySauh,
  parseSauhPosts,
  selectTodaySauh,
  sauhNetworkCandidates,
  stripHtml,
} from "./sauh.js";

describe("Sauh feed normalization", () => {
  it("uses the publisher's Jakarta date across the UTC day boundary", () => {
    expect(expectedSauhSlug(new Date("2026-08-18T18:00:00.000Z"))).toBe(
      "sbj260819",
    );
  });

  it("drops an upstream item without readable body instead of inventing content", () => {
    const posts = parseSauhPosts([
      {
        id: 77,
        slug: "missing-body",
        date: "2026-08-15T00:00:00.000Z",
        link: "https://tjc.org/id/sauh/missing-body",
        title: { rendered: "Judul tanpa isi" },
        content: { rendered: "<div></div>" },
        excerpt: { rendered: "" },
      },
    ]);

    expect(posts).toEqual([]);
  });

  it("drops an upstream item without a valid publication date", () => {
    const posts = parseSauhPosts([
      {
        id: 78,
        slug: "missing-date",
        link: "https://tjc.org/id/sauh/missing-date",
        title: { rendered: "Tanpa tanggal" },
        content: { rendered: "<p>Isi renungan.</p>" },
      },
      {
        id: 79,
        slug: "invalid-date",
        date: "not-a-date",
        link: "https://tjc.org/id/sauh/invalid-date",
        title: { rendered: "Tanggal rusak" },
        content: { rendered: "<p>Isi renungan.</p>" },
      },
    ]);

    expect(posts).toEqual([]);
  });

  it("does not trust non-TJC links or images from a feed response", () => {
    const posts = parseSauhPosts([
      {
        id: 80,
        slug: "foreign-source",
        date: "2026-08-15T00:00:00.000Z",
        link: "https://evil.example/sauh/foreign-source",
        title: { rendered: "Sumber asing" },
        content: { rendered: "<p>Isi renungan.</p>" },
        _embedded: {
          "wp:featuredmedia": [
            { source_url: "https://evil.example/image.jpg" },
          ],
        },
      },
      {
        id: 81,
        slug: "safe-source",
        date: "2026-08-15T00:00:00.000Z",
        link: "https://tjc.org/id/sauh/safe-source",
        title: { rendered: "Sumber aman" },
        content: { rendered: "<p>Isi renungan.</p>" },
        _embedded: {
          "wp:featuredmedia": [
            { source_url: "https://evil.example/image.jpg" },
          ],
        },
      },
    ]);

    expect(posts).toHaveLength(1);
    expect(posts[0]?.id).toBe("safe-source");
    expect(posts[0]?.imageUrl).toBeUndefined();
  });

  it("sanitizes a string-form title before it reaches the home reader", () => {
    const posts = parseSauhPosts([
      {
        id: 82,
        slug: "string-title",
        date: "2026-08-15T00:00:00.000Z",
        link: "https://tjc.org/id/sauh/string-title",
        title: "<b>Judul aman</b>",
        content: { rendered: "<p>Isi renungan.</p>" },
      },
    ]);

    expect(posts[0]?.title).toBe("Judul aman");
  });

  it("tries the configured BFF before the CORS-prone canonical endpoint", () => {
    expect(sauhNetworkCandidates("https://worker.example")).toEqual([
      "https://worker.example/api/v1/content/sauh",
      "https://tjc.org/id/wp-json/wp/v2/posts?categories=229&per_page=6&orderby=date&order=desc&_embed=wp:featuredmedia",
    ]);
  });

  it("extracts the title, reference, verse and source from WordPress markup", () => {
    const posts = parseSauhPosts([
      {
        id: 1,
        slug: "sbj260814",
        date: "2026-08-14T00:00:00+00:00",
        link: "https://tjc.org/id/gerakan-baca-alkitab/sbj260814/",
        title: { rendered: "Jagalah Hatimu!" },
        content: {
          rendered:
            '<h4>Matius 15:10-20</h4><p>"Karena dari hati timbul segala pikiran jahat..."</p>',
        },
      },
    ]);
    expect(posts).toHaveLength(1);
    expect(posts[0]?.reference).toBe("Matius 15:10-20");
    expect(posts[0]?.verse).toContain("Karena dari hati");
    expect(posts[0]?.source).toBe("tjc.org");
  });

  it("keeps the complete reflection body while exposing a compact excerpt helper", () => {
    const posts = parseSauhPosts([
      {
        id: 3,
        slug: "multi-paragraph",
        date: "2026-08-14T00:00:00+00:00",
        link: "https://tjc.org/id/gerakan-baca-alkitab/multi-paragraph/",
        title: { rendered: "Renungan lengkap" },
        content: {
          rendered:
            "<p>Paragraf pembuka untuk kartu ringkas.</p><p>Paragraf kedua harus tetap tersedia di viewer.</p>",
        },
      },
    ]);

    expect(posts[0]?.body).toBe(
      "Paragraf pembuka untuk kartu ringkas.\nParagraf kedua harus tetap tersedia di viewer.",
    );
    expect(firstParagraph(posts[0]?.body ?? "")).toBe(
      "Paragraf pembuka untuk kartu ringkas.",
    );
  });

  it("cuts off bottom Bible reading, previous slider, newsletter and donation sections", () => {
    const rawContent = `
      <h3>SAUH BAGI JIWA</h3>
      <p><strong>Renungan Tanggal: 19 Agustus 2026</strong></p>
      <a class="su-button" href="test.mp3">Unduh</a>
      <div class="shortcode box white"><p><strong><i>"Ayat Emas"</i> (Matius 15:33)</strong></p></div>
      <p><span class="su-dropcap">L</span>upa merupakan hal yang wajar terjadi.</p>
      <p>Ini adalah isi renungan utama yang harus tampil di halaman.</p>
      <div class="module-fancy-heading"><h2>Sauh Bagi Jiwa Sebelumnya</h2></div>
      <div id="GBA"><h2>Gerakan Membaca Alkitab</h2></div>
      <div id="Ayat"><ul class="module-accordion"><li>Bacaan Alkitab Harian Matius 15:32-39 32 Lalu Yesus...</li></ul></div>
      <p>Apakah Anda sudah membaca Alkitab hari ini?</p>
      <p>Terima kasih atas dukungan dari Saudara/i. Bank Central Asia (BCA)</p>
    `;

    const posts = parseSauhPosts([
      {
        id: 100,
        slug: "sbj260819",
        date: "2026-08-19T00:00:00+00:00",
        link: "https://tjc.org/id/gerakan-baca-alkitab/sbj260819/",
        title: { rendered: "Lupa" },
        content: { rendered: rawContent },
      },
    ]);

    expect(posts).toHaveLength(1);
    expect(posts[0]?.body).toBe(
      "Lupa merupakan hal yang wajar terjadi.\nIni adalah isi renungan utama yang harus tampil di halaman.",
    );
    expect(posts[0]?.body).not.toContain("Bacaan Alkitab Harian");
    expect(posts[0]?.body).not.toContain("Sauh Bagi Jiwa Sebelumnya");
    expect(posts[0]?.body).not.toContain("Lalu Yesus");
    expect(posts[0]?.body).not.toContain("Bank Central Asia");
  });

  it("preserves article body when top banner contains Bacaan Alkitab Harian heading", () => {
    const rawContent = `
      <h4>Bacaan Alkitab Harian - Matius 15:32-39</h4>
      <h3>SAUH BAGI JIWA</h3>
      <p><strong>Renungan Tanggal: 19 Agustus 2026</strong></p>
      <a class="builder_button" href="#">Gerakan Baca Alkitab</a>
      <div class="shortcode box white"><p><strong><i>"Ayat"</i> (Matius 15:33)</strong></p></div>
      <p><span class="su-dropcap">L</span>upa merupakan hal yang wajar terjadi pada setiap orang.</p>
      <p>Seseorang dapat melupakan sesuatu peristiwa karena menganggapnya tidak penting.</p>
      <div class="module-fancy-heading"><h2>Sauh Bagi Jiwa Sebelumnya</h2></div>
    `;

    const posts = parseSauhPosts([
      {
        id: 101,
        slug: "sbj260819",
        date: "2026-08-19T00:00:00+00:00",
        link: "https://tjc.org/id/gerakan-baca-alkitab/sbj260819/",
        title: { rendered: "Lupa" },
        content: { rendered: rawContent },
      },
    ]);

    expect(posts).toHaveLength(1);
    expect(posts[0]?.body).toBe(
      "Lupa merupakan hal yang wajar terjadi pada setiap orang.\nSeseorang dapat melupakan sesuatu peristiwa karena menganggapnya tidak penting.",
    );
  });

  it("strips markup without losing paragraph boundaries", () => {
    expect(stripHtml("<p>Satu</p><p>Dua &amp; tiga</p>")).toBe(
      "Satu\nDua & tiga",
    );
  });

  it("drops executable and embedded markup before rendering text", () => {
    expect(
      stripHtml("<p>Aman</p><script>alert(1)</script><svg>bad</svg>"),
    ).toBe("Aman");
  });

  it("keeps only the current day's reflection for the home surface", () => {
    const posts = parseSauhPosts([
      {
        id: 1,
        slug: "today",
        date: "2026-08-14T00:00:00.000Z",
        link: "https://tjc.org/id/gerakan-baca-alkitab/today/",
        title: { rendered: "Hari ini" },
        content: { rendered: "<p>Renungan hari ini.</p>" },
      },
      {
        id: 2,
        slug: "yesterday",
        date: "2026-08-13T00:00:00.000Z",
        link: "https://tjc.org/id/gerakan-baca-alkitab/yesterday/",
        title: { rendered: "Kemarin" },
        content: { rendered: "<p>Renungan kemarin.</p>" },
      },
    ]);
    expect(
      onlyTodaySauh(posts, new Date("2026-08-14T12:00:00.000Z")),
    ).toHaveLength(1);
    expect(
      onlyTodaySauh(posts, new Date("2026-08-14T12:00:00.000Z"))[0]?.id,
    ).toBe("today");
  });

  it("never serves a stale snapshot as today's entry", () => {
    const posts = parseSauhPosts([
      {
        id: 1,
        slug: "sbj260816",
        date: "2026-08-16T00:00:00.000Z",
        link: "https://tjc.org/id/gerakan-baca-alkitab/sbj260816/",
        title: { rendered: "Snapshot terakhir" },
        content: { rendered: "<p>Renungan tersimpan.</p>" },
      },
    ]);

    expect(
      selectTodaySauh(posts, new Date("2026-08-17T08:00:00+07:00")),
    ).toHaveLength(0);
  });

  it("uses the publisher's daily slug when UTC modification rolls over", () => {
    const post = parseSauhPosts([
      {
        id: 1,
        slug: "sbj260814",
        date: "2026-08-13T17:00:00.000Z",
        link: "https://tjc.org/id/gerakan-baca-alkitab/sbj260814/",
        title: { rendered: "Hari ini" },
        content: { rendered: "<p>Renungan.</p>" },
      },
    ]);
    expect(
      selectTodaySauh(post, new Date("2026-08-14T01:00:00.000+08:00")),
    ).toHaveLength(1);
  });

  it("prefers the publisher's canonical daily slug over an unrelated post edited today", () => {
    const posts = parseSauhPosts([
      {
        id: 1,
        slug: "sbj260814",
        date: "2026-08-13T17:00:00.000Z",
        modified: "2026-08-13T17:00:00.000Z",
        link: "https://tjc.org/id/gerakan-baca-alkitab/sbj260814/",
        title: { rendered: "Sauh hari ini" },
        content: { rendered: "<p>Ayat hari ini.</p>" },
      },
      {
        id: 2,
        slug: "artikel-lama-diedit",
        date: "2026-08-01T00:00:00.000Z",
        modified: "2026-08-14T00:30:00.000Z",
        link: "https://tjc.org/id/gerakan-baca-alkitab/artikel-lama-diedit/",
        title: { rendered: "Artikel lama" },
        content: { rendered: "<p>Isi lama yang baru diedit.</p>" },
      },
    ]);

    const selected = selectTodaySauh(
      posts,
      new Date("2026-08-14T01:00:00.000+08:00"),
    );
    expect(selected).toHaveLength(1);
    expect(selected[0]?.id).toBe("sbj260814");
  });

  it("shows the verified snapshot while live revalidation is slow", async () => {
    vi.resetModules();
    const snapshotId = `sbj${new Date().toISOString().slice(2, 10).replaceAll("-", "")}`;
    const snapshot = {
      items: [
        {
          id: snapshotId,
          title: "Snapshot hari ini",
          reference: "Yohanes 3:16",
          verse: "Karena begitu besar kasih Allah akan dunia ini",
          body: "Renungan yang sudah diverifikasi.",
          url: `https://tjc.org/id/gerakan-baca-alkitab/${snapshotId}/`,
          updatedAt: new Date().toISOString(),
          source: "tjc.org",
        },
      ],
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/offline/sauh.json"))
        return Promise.resolve(
          new Response(JSON.stringify(snapshot), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new Error("live request timed out")),
          { once: true },
        );
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("window", {
      setTimeout,
      clearTimeout,
      location: { pathname: "/" },
    });
    const { fetchSauh } = await import("./sauh.js");
    const result = await fetchSauh();
    expect(result[0]?.id).toBe(snapshotId);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/offline/sauh.json"),
      expect.objectContaining({ cache: "default" }),
    );
    vi.unstubAllGlobals();
  }, 15_000);

  it("rejects instead of showing an outdated snapshot when today's entry is unavailable", async () => {
    vi.resetModules();
    const snapshot = {
      items: [
        {
          id: "sbj200101",
          title: "Snapshot tersimpan",
          reference: "Mazmur 46:2",
          verse: "Allah itu bagi kita tempat perlindungan",
          body: "Renungan yang sudah diverifikasi.",
          url: "https://tjc.org/id/gerakan-baca-alkitab/sbj200101/",
          updatedAt: "2020-01-01T00:00:00.000Z",
          source: "tjc.org",
        },
      ],
    };
    vi.stubGlobal("fetch", (input: RequestInfo | URL) =>
      Promise.resolve(
        String(input).includes("/offline/sauh.json")
          ? new Response(JSON.stringify(snapshot), { status: 200 })
          : new Response("unavailable", { status: 503 }),
      ),
    );
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("window", {
      setTimeout,
      clearTimeout,
      location: { pathname: "/" },
    });
    const { fetchSauh } = await import("./sauh.js");

    // No today entry anywhere: the UI must get an error state (aesthetic
    // loading / retry), never yesterday's (or 2020's) reflection.
    await expect(fetchSauh()).rejects.toThrow(/belum dapat diambil/i);
    vi.unstubAllGlobals();
  });

  it("ignores a stale payload persisted under today's storage key", async () => {
    vi.resetModules();
    const staleDayKey = (() => {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date());
      const map = Object.fromEntries(
        parts.map((part) => [part.type, part.value]),
      );
      return `${map.year}-${map.month}-${map.day}`;
    })();
    const stored = JSON.stringify([
      {
        id: "sbj260816",
        title: "Orang Biasa yang Luar Biasa",
        body: "Konten lama yang tidak boleh ditampilkan sebagai renungan hari ini.",
        url: "https://tjc.org/id/gerakan-baca-alkitab/sbj260816/",
        updatedAt: "2026-08-16T00:09:34+00:00",
        source: "tjc.org",
      },
    ]);
    vi.stubGlobal("fetch", () =>
      Promise.resolve(new Response("unavailable", { status: 503 })),
    );
    vi.stubGlobal("navigator", { onLine: true });
    const storage = new Map<string, string>([
      [`gys_sauh_day_${staleDayKey}`, stored],
    ]);
    vi.stubGlobal("window", {
      setTimeout,
      clearTimeout,
      location: { pathname: "/" },
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => void storage.set(key, value),
      },
    });
    const { fetchSauh, getCachedSauh } = await import("./sauh.js");

    expect(getCachedSauh()).toBeUndefined();
    await expect(fetchSauh()).rejects.toThrow(/belum dapat diambil/i);
    vi.unstubAllGlobals();
  });
});
