import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

test.use({ serviceWorkers: "allow" });

test("an installed Bible remains readable after an offline app restart", async ({
  page,
}) => {
  test.skip(
    !process.env.VITE_BFF_BASE_URL,
    "Run this mocked download flow with VITE_BFF_BASE_URL configured in the E2E build.",
  );
  // This local SQLite fixture proves offline storage/readback, not KJV content.
  const payload = await readFile(
    new URL("../public/offline/bible/b_tb.db", import.meta.url),
  );
  const catalog = JSON.parse(
    await readFile(
      new URL("../public/offline/distributed-assets.json", import.meta.url),
      "utf8",
    ),
  ) as {
    items: Array<{
      code: string;
      track: "bibles" | "hymnals" | "soundfont";
      version: string;
      fileName: string;
      downloadUrl: string;
      installFileName: string;
      sizeBytes: number;
      checksumSha256: string;
    }>;
  };
  const item = catalog.items.find((candidate) => candidate.code === "b_kjv")!;
  item.sizeBytes = payload.byteLength;
  item.checksumSha256 = createHash("sha256").update(payload).digest("hex");
  const context = page.context();

  for (const track of ["bibles", "hymnals", "soundfont"] as const) {
    const fileName = `${track}-manifest.json`;
    await context.route(`**/${fileName}`, (route) =>
      route.fulfill({
        json: {
          track,
          releaseTag: `${track}-test`,
          publishedAt: "2026-08-18T00:00:00.000Z",
          packages: catalog.items
            .filter((candidate) => candidate.track === track)
            .map((candidate) => ({
              code: candidate.code,
              version: candidate.version,
              fileName: candidate.fileName,
              downloadUrl: candidate.downloadUrl,
              installFileName: candidate.installFileName,
              sizeBytes: candidate.sizeBytes,
              checksumSha256: candidate.checksumSha256,
            })),
        },
      }),
    );
  }

  const packageRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/v1/assets/distributed/b_kjv"))
      packageRequests.push(request.url());
  });
  await context.route(/\/api\/v1\/assets\/distributed\/b_kjv$/, (route) =>
    route.fulfill({
      body: payload,
      headers: {
        "access-control-allow-origin": "*",
        "content-length": String(payload.byteLength),
        "content-type": "application/octet-stream",
      },
    }),
  );

  await page.goto("/GYSApp-Tauri/lainnya?section=data");
  await page.waitForFunction(
    () => Boolean(navigator.serviceWorker.controller),
    null,
    { timeout: 20_000 },
  );
  const downloadButton = page.getByRole("button", {
    name: "Unduh King James Version",
  });
  await expect(downloadButton).toBeEnabled();
  await downloadButton.click();
  await expect(page.getByText(/Tersimpan · v2026\.05\.21/)).toBeVisible({
    timeout: 45_000,
  });
  expect(packageRequests).toHaveLength(1);

  await page.goto("/GYSApp-Tauri/bible");
  await page.getByRole("button", { name: "Versi", exact: true }).click();
  await page.getByRole("option", { name: "King James Version" }).click();
  await expect(page.getByText("KJV", { exact: true }).first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator('[id^="bible-verse-"]').first()).toBeVisible();

  await page.goto("/GYSApp-Tauri/");
  await page.getByRole("button", { name: /Cari di seluruh aplikasi/ }).click();
  await page
    .getByLabel("Cari Alkitab, Kidung, Literatur, Iman, atau media")
    .fill("begitu besar kasih Allah akan dunia ini");
  const tbSearchResult = page
    .getByRole("button", { name: /Yohanes 3:16/ })
    .first();
  await expect(tbSearchResult).toBeVisible({ timeout: 15_000 });
  await tbSearchResult.click();
  await expect(page).toHaveURL(/version=b_tb$/);
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("gys-bible-version-v1")),
    )
    .toBe("b_tb");
  await expect(page.locator('[id="bible-verse-43:3:16"]')).toHaveClass(
    /is-selected/,
    { timeout: 15_000 },
  );

  await page.context().setOffline(true);
  await page.reload();
  await expect(page.locator('[id^="bible-verse-"]').first()).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Versi", exact: true }).click();
  await page.getByRole("option", { name: "King James Version" }).click();
  await expect(page.getByText("KJV", { exact: true }).first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator(".error-panel")).toHaveCount(0);
  expect(packageRequests).toHaveLength(1);
});

test("an optional hymnal persists offline and can be removed and reinstalled", async ({
  page,
}) => {
  test.skip(
    !process.env.VITE_BFF_BASE_URL,
    "Run this mocked download flow with VITE_BFF_BASE_URL configured in the E2E build.",
  );
  test.setTimeout(60_000);

  const payload = Buffer.from("%PDF-1.4\noptional hymnal fixture\n", "utf8");
  const catalog = JSON.parse(
    await readFile(
      new URL("../public/offline/distributed-assets.json", import.meta.url),
      "utf8",
    ),
  ) as {
    items: Array<{
      code: string;
      track: "bibles" | "hymnals" | "soundfont";
      version: string;
      fileName: string;
      downloadUrl: string;
      installFileName: string;
      sizeBytes: number;
      checksumSha256: string;
      metadata?: {
        downloadUrl: string;
        sizeBytes: number;
        checksumSha256: string;
      };
    }>;
  };
  const item = catalog.items.find((candidate) => candidate.code === "HYMNE")!;
  item.sizeBytes = payload.byteLength;
  item.checksumSha256 = createHash("sha256").update(payload).digest("hex");
  const metadataResponse = await fetch(item.metadata!.downloadUrl);
  expect(metadataResponse.ok).toBe(true);
  const metadata = Buffer.from(await metadataResponse.arrayBuffer());
  expect(metadata.byteLength).toBe(item.metadata!.sizeBytes);
  expect(createHash("sha256").update(metadata).digest("hex")).toBe(
    item.metadata!.checksumSha256,
  );

  const context = page.context();
  await context.route(/^https:\/\//, (route) => route.abort());
  for (const track of ["bibles", "hymnals", "soundfont"] as const) {
    await context.route(`**/${track}-manifest.json`, (route) =>
      route.fulfill({
        json: {
          track,
          releaseTag: `${track}-test`,
          publishedAt: "2026-08-18T00:00:00.000Z",
          packages: catalog.items
            .filter((candidate) => candidate.track === track)
            .map((candidate) => ({
              code: candidate.code,
              version: candidate.version,
              fileName: candidate.fileName,
              downloadUrl: candidate.downloadUrl,
              installFileName: candidate.installFileName,
              sizeBytes: candidate.sizeBytes,
              checksumSha256: candidate.checksumSha256,
            })),
        },
      }),
    );
  }
  await context.route("**/offline/distributed-assets.json", (route) =>
    // The worker must install the original core bytes verified by its manifest.
    route.request().serviceWorker()
      ? route.continue()
      : route.fulfill({ json: catalog }),
  );

  const packageRequests: string[] = [];
  const metadataRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/v1/assets/distributed/HYMNE"))
      packageRequests.push(request.url());
    if (request.url().endsWith("/api/v1/assets/distributed/HYMNE/index"))
      metadataRequests.push(request.url());
  });
  await context.route(/\/api\/v1\/assets\/distributed\/HYMNE$/, (route) =>
    route.fulfill({
      body: payload,
      headers: {
        "access-control-allow-origin": "*",
        "content-length": String(payload.byteLength),
        "content-type": "application/octet-stream",
      },
    }),
  );
  await context.route(
    /\/api\/v1\/assets\/distributed\/HYMNE\/index$/,
    (route) =>
      route.fulfill({
        body: metadata,
        headers: {
          "access-control-allow-origin": "*",
          "content-length": String(metadata.byteLength),
          "content-type": "application/json",
        },
      }),
  );

  await page.goto("/GYSApp-Tauri/lainnya?section=data");
  await page.waitForFunction(
    () => Boolean(navigator.serviceWorker.controller),
    null,
    { timeout: 20_000 },
  );
  await page
    .getByRole("button", { name: "Unduh Hymne (English Version)" })
    .click();
  await expect(page.getByText(/Tersimpan · v2026\.05\.21/)).toBeVisible({
    timeout: 15_000,
  });
  expect(packageRequests).toHaveLength(1);
  expect(metadataRequests).toHaveLength(1);

  await page.goto("/GYSApp-Tauri/kidung");
  const collectionFilter = page.locator(
    ".kidung-desktop-filter .control-select",
  );
  await collectionFilter.locator(".control-select-trigger").click();
  await page.getByRole("option", { name: "English", exact: true }).click();
  await expect(page.locator('.pujian-item[data-id="hymne-001"]')).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  const offlineCollectionFilter = page.locator(
    ".kidung-desktop-filter .control-select",
  );
  await offlineCollectionFilter.locator(".control-select-trigger").click();
  await page.getByRole("option", { name: "English", exact: true }).click();
  await expect(page.locator('.pujian-item[data-id="hymne-001"]')).toBeVisible();

  await context.setOffline(false);
  await page.goto("/GYSApp-Tauri/lainnya?section=data");
  const hymneRow = page.locator(".distributed-asset-row", {
    hasText: "Hymne (English Version)",
  });
  page.once("dialog", (dialog) => dialog.accept());
  await hymneRow.getByRole("button", { name: "Hapus", exact: true }).click();
  await expect(hymneRow).toContainText("Belum diunduh");

  await page.goto("/GYSApp-Tauri/lainnya?section=data");
  await page
    .getByRole("button", { name: "Unduh Hymne (English Version)" })
    .click();
  await expect(page.getByText(/Tersimpan · v2026\.05\.21/)).toBeVisible({
    timeout: 15_000,
  });
  expect(packageRequests).toHaveLength(2);
  expect(metadataRequests).toHaveLength(2);

  await page.goto("/GYSApp-Tauri/kidung");
  await page.locator(".kidung-desktop-filter .control-select-trigger").click();
  await page.getByRole("option", { name: "English", exact: true }).click();
  await expect(page.locator('.pujian-item[data-id="hymne-001"]')).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await page.locator(".kidung-desktop-filter .control-select-trigger").click();
  await page.getByRole("option", { name: "English", exact: true }).click();
  await expect(page.locator('.pujian-item[data-id="hymne-001"]')).toBeVisible();
  await context.setOffline(false);
});
