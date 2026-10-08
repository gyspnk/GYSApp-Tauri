import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });
test("catalog opens from metadata while lyric search waits for its deferred corpus", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/offline/hymn-catalog.json", async (route) => {
    await barrier;
    await route.continue();
  });
  await page.goto("/GYSApp-Tauri/kidung");
  await expect(page.locator(".pujian-item")).toHaveCount(533);
  expect(
    requests.some((url) => url.endsWith("/offline/hymn-catalog.json")),
  ).toBe(false);
  expect(
    requests.some((url) => url.endsWith("/offline/hymn-metadata.json")),
  ).toBe(true);
  const response = page.waitForResponse("**/offline/hymn-catalog.json");
  await page.locator(".hymn-catalog-controls input").fill("Kasih setiaNya");
  await expect(page.locator(".hymn-catalog-shell [role=status]")).toBeVisible();
  release();
  await response;
  await expect(page.locator(".hymn-catalog-shell [role=status]")).toHaveCount(
    0,
  );
  await expect(page.locator(".pujian-item").first()).toBeVisible();
});

test("Bible displays its chapter before starting or cloning a search worker", async ({
  page,
}) => {
  const workers: string[] = [];
  page.on("request", (request) => {
    if (/bible-search-worker/.test(request.url())) workers.push(request.url());
  });
  await page.goto("/GYSApp-Tauri/bible");
  await expect(page.locator(".verse-row").first()).toBeVisible();
  expect(workers).toEqual([]);
  await page.locator(".reader-search-btn").click();
  await page.locator("#bible-query").fill("Allah");
  await page.locator("#bible-search-form button[type=submit]").click();
  await expect(page.locator(".result-item")).toHaveCount(40);
  expect(workers.length).toBeGreaterThan(0);
  expect(
    await page.evaluate(
      () =>
        performance.getEntriesByName("gys-bible-chapter-ready").at(-1)
          ?.startTime,
    ),
  ).toBeGreaterThan(0);
  await expect
    .poll(() =>
      page.evaluate(
        () => performance.getEntriesByName("gys-bible-search-ready").length,
      ),
    )
    .toBeGreaterThan(0);
});

test("automatic PDF fallback waits for a delayed music lock", async ({
  page,
}) => {
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/offline/music-lock.json", async (route) => {
    await barrier;
    await route.continue();
  });
  await page.route("https://raw.githubusercontent.com/**", (route) =>
    route.abort(),
  );
  await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=pdf");
  await expect(page.locator(".hymn-detail-page")).toBeVisible();
  await page.waitForTimeout(250);
  release();
  await expect(
    page.locator("canvas[data-pdf-rendered='true']").first(),
  ).toBeVisible({ timeout: 20000 });
});
