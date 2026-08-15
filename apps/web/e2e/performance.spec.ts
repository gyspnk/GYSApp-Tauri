import { expect, test } from "@playwright/test";

test("initial shell stays responsive and does not duplicate application modules", async ({
  page,
}, testInfo) => {
  test.setTimeout(30_000);
  const started = Date.now();
  await page.goto("/GYSApp-Tauri/", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: "Selamat datang kembali" }),
  ).toBeVisible({ timeout: 8_000 });
  const elapsedMs = Date.now() - started;
  const metrics = await page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0] as
      PerformanceNavigationTiming | undefined;
    const resources = performance.getEntriesByType(
      "resource",
    ) as PerformanceResourceTiming[];
    const moduleUrls = resources
      .map((entry) => new URL(entry.name, location.href))
      .filter(
        (url) =>
          url.pathname.includes("/assets/") &&
          /\.(?:js|mjs)$/.test(url.pathname) &&
          !/worker|pdf/i.test(url.pathname),
      )
      .map((url) => url.href);
    const counts = new Map<string, number>();
    for (const url of moduleUrls) counts.set(url, (counts.get(url) ?? 0) + 1);
    return {
      domContentLoaded: navigation?.domContentLoadedEventEnd ?? 0,
      firstPaint:
        performance
          .getEntriesByType("paint")
          .find((entry) => entry.name === "first-contentful-paint")
          ?.startTime ?? 0,
      moduleCount: counts.size,
      duplicateModules: [...counts]
        .filter(([, count]) => count > 1)
        .map(([url]) => url),
    };
  });
  testInfo.annotations.push({
    type: "performance",
    description: JSON.stringify({ elapsedMs, ...metrics }),
  });
  expect(elapsedMs).toBeLessThan(8_000);
  expect(metrics.moduleCount).toBeGreaterThan(0);
  expect(metrics.duplicateModules).toEqual([]);
});
