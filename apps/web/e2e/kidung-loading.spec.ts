import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.use({ serviceWorkers: "block" });

test("catalog and settings stay usable without loading the hymn reader", async ({
  page,
}) => {
  const readerPath =
    process.env.GYS_E2E_DEV === "1"
      ? "/src/kidung.tsx"
      : JSON.parse(
          await readFile(
            new URL("../dist/.vite/manifest.json", import.meta.url),
            "utf8",
          ),
        )["src/kidung.tsx"].file;
  const readerRequests: string[] = [];
  await page.route("**/*", async (route) => {
    if (new URL(route.request().url()).pathname.endsWith(readerPath)) {
      readerRequests.push(route.request().url());
      await route.abort();
      return;
    }
    await route.continue();
  });

  await page.goto("/GYSApp-Tauri/kidung");
  await expect(page.locator(".pujian-item")).toHaveCount(533);
  await page.locator(".add-to-playlist-btn").first().click();
  await expect(page.locator(".add-to-playlist-btn").first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator('.kidung-local-nav a[href$="section=settings"]').click();
  await expect(page.locator(".kidung-settings-section").first()).toBeVisible();
  expect(readerRequests).toEqual([]);
});

test("Kidung settings open without fetching song data", async ({ page }) => {
  const dataRequests: string[] = [];
  page.on("request", (request) => {
    if (/\/offline\/(hymn-catalog|music-lock)\.json/.test(request.url()))
      dataRequests.push(request.url());
  });
  await page.goto("/GYSApp-Tauri/kidung?section=settings");
  await expect(page.locator(".kidung-settings-section").first()).toBeVisible();
  await expect(
    page.locator(".kidung-local-nav a[aria-current=page]"),
  ).toHaveAttribute("href", /section=settings/);
  expect(dataRequests).toEqual([]);
});
