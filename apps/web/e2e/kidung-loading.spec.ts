import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test("catalog and settings stay usable without loading the hymn reader", async ({
  page,
}) => {
  let readerPath = "/src/kidung.tsx";
  if (process.env.GYS_E2E_DEV !== "1") {
    // CI downloads the production artifact without hidden .vite metadata.
    // Resolve the actual deferred reader through the public offline manifest.
    const response = await page.request.get(
      "/GYSApp-Tauri/offline-shell-assets.json",
    );
    expect(response.ok()).toBe(true);
    const { assets } = (await response.json()) as { assets: string[] };
    const sectionChunk =
      /^assets\/kidung-(?:page|catalog|local-nav|midi-controls|playlist-page|playlists|settings-page|shared)-/;
    const readers = assets.filter(
      (path) =>
        path.startsWith("assets/kidung-") &&
        path.endsWith(".js") &&
        !sectionChunk.test(path),
    );
    expect(readers).toHaveLength(1);
    readerPath = readers[0]!;
  }
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
