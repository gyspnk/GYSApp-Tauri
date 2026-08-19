import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

test.use({ serviceWorkers: "block" });

test("asset management lists optional Bible and hymnal packages without prefetching them", async ({
  page,
}) => {
  const packageRequests: string[] = [];
  page.on("request", (request) => {
    if (/\.(?:gyspkg|sf2)(?:\?|$)/i.test(request.url()))
      packageRequests.push(request.url());
  });

  await page.goto("/GYSApp-Tauri/lainnya?section=data");
  await expect(
    page.getByRole("heading", { name: "Manajemen Aset", exact: true }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByText("King James Version", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Chinese Union Version", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Hymne (English Version)", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Mandarin", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Aku Senang Menyanyi I", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Aku Senang Menyanyi M", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Aku Senang Menyanyi P", { exact: true }),
  ).toBeVisible();

  await page.waitForTimeout(500);
  expect(packageRequests).toEqual([]);
});

test("Kidung catalog hides optional collections until they are installed", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/GYSApp-Tauri/kidung");
  await expect(
    page.getByRole("heading", { name: "Kidung", exact: true }),
  ).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Koleksi" }).click();
  await expect(page.getByRole("option", { name: "english" })).toHaveCount(0);
  await expect(page.getByRole("option", { name: "mandarin" })).toHaveCount(0);
});

test("default browser download installs KJV and exposes it in the Bible selector", async ({
  page,
}) => {
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
      track: string;
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
  for (const track of ["bibles", "hymnals", "soundfont"] as const) {
    const fileName = `${track}-manifest.json`;
    await page.route(`**/${fileName}`, (route) =>
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
  await page.route("**/offline/distributed-assets.json", (route) =>
    route.fulfill({ json: catalog }),
  );
  await page.route(/\/api\/v1\/assets\/distributed\/b_kjv$/, async (route) => {
    await route.fulfill({
      body: payload,
      headers: {
        "content-length": String(payload.byteLength),
        "content-type": "application/octet-stream",
      },
    });
  });
  await page.goto("/GYSApp-Tauri/lainnya?section=data");
  await page.getByRole("button", { name: "Unduh King James Version" }).click();
  await expect(page.getByText(/Tersimpan · v2026\.05\.21/)).toBeVisible({
    timeout: 45_000,
  });

  await page.goto("/GYSApp-Tauri/bible");
  await page.getByRole("button", { name: "Versi", exact: true }).click();
  await page.getByRole("option", { name: "King James Version" }).click();
  await expect(page.getByText("KJV", { exact: true }).first()).toBeVisible({
    timeout: 15_000,
  });
  await page.unrouteAll({ behavior: "wait" });
  await page.reload();
  await page.getByRole("button", { name: "Versi", exact: true }).click();
  await page.getByRole("option", { name: "King James Version" }).click();
  await expect(page.getByText("KJV", { exact: true }).first()).toBeVisible({
    timeout: 15_000,
  });

  await page.goto("/GYSApp-Tauri/lainnya?section=data");
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .locator(".distributed-asset-row", {
      hasText: "King James Version",
    })
    .getByRole("button", { name: "Hapus", exact: true })
    .click();
  await expect(
    page.locator(".distributed-asset-row", {
      hasText: "King James Version",
    }),
  ).toContainText("Belum diunduh");
  await page.goto("/GYSApp-Tauri/bible");
  await page.getByRole("button", { name: "Versi", exact: true }).click();
  await expect(
    page.getByRole("option", { name: "King James Version" }),
  ).toHaveCount(0);
});
