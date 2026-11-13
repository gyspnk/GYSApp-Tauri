import { expect, test, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

/**
 * A book that ships one master PDF must show the hymn's pages, not the book.
 * The two-page fixture stands in for a distributed hymnal: song 001 is on page
 * 2, song 002 has no page in the index, so the reader must ask first.
 */
const master = readFileSync(
  new URL("./fixtures/two-page.pdf", import.meta.url),
);
const index = Buffer.from(
  JSON.stringify([
    {
      number: "001",
      title: "Mapped Hymn",
      verses: ["Mapped hymn verse"],
      pdfFile: "pdf/hymne/001.pdf",
      page: 2,
      pages: 1,
    },
    {
      number: "002",
      title: "Unmapped Hymn",
      verses: ["Unmapped hymn verse"],
      pdfFile: "pdf/hymne/002.pdf",
    },
  ]),
);
const sha256 = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

async function installTestBook(page: Page) {
  await page.goto("/GYSApp-Tauri/kidung");
  await page.evaluate(
    async ({ pdf, metadata, record }) => {
      const bytes = (base64: string) =>
        Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const cache = await caches.open(record.cacheName);
      await cache.put(record.cacheKey, new Response(bytes(pdf)));
      await cache.put(record.metadataCacheKey!, new Response(bytes(metadata)));
      localStorage.setItem(
        "gys-distributed-assets-v1",
        JSON.stringify({ [record.code]: record }),
      );
    },
    {
      pdf: master.toString("base64"),
      metadata: index.toString("base64"),
      record: {
        code: "HYMNE",
        kind: "hymnal",
        version: "test-1",
        releaseTag: "test",
        installFileName: "hymne.gyspkg",
        packageSizeBytes: master.byteLength,
        packageChecksumSha256: sha256(master),
        cacheName: "gys-distributed-v1-test",
        cacheKey: "https://gysapp.local/distributed-assets/HYMNE/master",
        payloadBytes: master.byteLength,
        payloadChecksumSha256: sha256(master),
        installedAt: "2026-11-13T00:00:00.000Z",
        metadataCacheKey: "https://gysapp.local/distributed-assets/HYMNE/index",
        metadataBytes: index.byteLength,
        metadataChecksumSha256: sha256(index),
      },
    },
  );
}

test.describe("distributed hymnal page window", () => {
  test.use({ serviceWorkers: "block" });

  test("shows the mapped hymn's page and asks before the whole book", async ({
    page,
  }) => {
    await page.route(/^https:\/\//, (route) => route.abort());
    await page.setViewportSize({ width: 390, height: 844 });
    await installTestBook(page);

    await page.goto("/GYSApp-Tauri/kidung/hymne-001");
    await expect(page.locator("h1")).toContainText("Mapped Hymn", {
      timeout: 30_000,
    });
    await page.getByRole("button", { name: "Partitur", exact: true }).click();
    await expect(page.locator(".pdf-toolbar")).toContainText("Halaman 1 / 1", {
      timeout: 60_000,
    });

    await page.goto("/GYSApp-Tauri/kidung/hymne-002");
    await expect(page.locator("h1")).toContainText("Unmapped Hymn", {
      timeout: 30_000,
    });
    await page.getByRole("button", { name: "Partitur", exact: true }).click();
    const notice = page.locator(".hymn-pdf-unmapped");
    await expect(notice).toBeVisible({ timeout: 60_000 });
    await expect(notice).toContainText("belum dipetakan");
    // Nothing painted yet: the whole book is behind one explicit tap.
    await expect(page.locator(".pdf-toolbar")).toHaveCount(0);

    await notice.getByRole("button", { name: "Buka seluruh buku" }).click();
    await expect(page.locator(".pdf-toolbar")).toContainText("Halaman 1 / 2", {
      timeout: 60_000,
    });
  });
});
