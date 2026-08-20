import { describe, expect, it } from "vitest";
import { expectedSauhSlug, normalizeSauhPosts, onlyTodaySauh } from "./sauh.js";

describe("BFF Sauh normalization", () => {
  it("uses the publisher's Jakarta date across the UTC day boundary", () => {
    expect(expectedSauhSlug(new Date("2026-08-18T18:00:00.000Z"))).toBe(
      "sbj260819",
    );
  });

  it("drops items without a valid upstream date instead of making them current", () => {
    const posts = normalizeSauhPosts([
      {
        id: 1,
        slug: "missing-date",
        link: "https://tjc.org/id/sauh/missing-date/",
        title: { rendered: "Tanpa tanggal" },
        content: { rendered: "<p>Isi renungan.</p>" },
      },
      {
        id: 2,
        slug: "invalid-date",
        date: "not-a-date",
        link: "https://tjc.org/id/sauh/invalid-date/",
        title: { rendered: "Tanggal rusak" },
        content: { rendered: "<p>Isi renungan.</p>" },
      },
    ]);

    expect(posts).toEqual([]);
  });

  it("rejects foreign content links and strips foreign image URLs", () => {
    const posts = normalizeSauhPosts([
      {
        id: 3,
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
        id: 4,
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

  it("keeps the complete readable reflection body for the viewer", () => {
    const posts = normalizeSauhPosts([
      {
        id: 4,
        slug: "complete-body",
        date: "2026-08-15T00:00:00.000Z",
        link: "https://tjc.org/id/sauh/complete-body/",
        title: { rendered: "Renungan lengkap" },
        content: {
          rendered:
            "<p>Bagian pembuka.</p><p>Bagian lanjutan yang tidak boleh hilang dari viewer.</p>",
        },
      },
    ]);

    expect(posts[0]?.body).toBe(
      "Bagian pembuka.\nBagian lanjutan yang tidak boleh hilang dari viewer.",
    );
  });

  it("cuts off bottom Bible reading, previous slider, newsletter and donation sections", () => {
    const rawContent = `
      <h3>SAUH BAGI JIWA</h3>
      <p><strong>Renungan Tanggal: 19 Agustus 2026</strong></p>
      <a class="su-button" href="test.mp3">Unduh</a>
      <div class="shortcode box white"><p><strong><i>"Ayat Emas"</i> (Matius 15:33)</strong></p></div>
      <p><span class="su-dropcap">L</span>upa merupakan hal yang wajar terjadi.</p>
      <p>Ini adalah isi renungan utama.</p>
      <div class="module-fancy-heading"><h2>Sauh Bagi Jiwa Sebelumnya</h2></div>
      <div id="GBA"><h2>Gerakan Membaca Alkitab</h2></div>
      <div id="Ayat"><ul class="module-accordion"><li>Bacaan Alkitab Harian Matius 15:32-39 32 Lalu Yesus...</li></ul></div>
      <p>Apakah Anda sudah membaca Alkitab hari ini?</p>
      <p>Terima kasih atas dukungan dari Saudara/i. Bank Central Asia (BCA)</p>
    `;

    const posts = normalizeSauhPosts([
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
      "Lupa merupakan hal yang wajar terjadi.\nIni adalah isi renungan utama.",
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

    const posts = normalizeSauhPosts([
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

  it("prefers the publisher's daily slug over an unrelated post edited today", () => {
    const posts = normalizeSauhPosts([
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

    const selected = onlyTodaySauh(
      posts,
      new Date("2026-08-14T01:00:00.000+08:00"),
    );
    expect(selected).toHaveLength(1);
    expect(selected[0]?.id).toBe("sbj260814");
  });
});
