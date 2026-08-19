import { expect, test } from "@playwright/test";

type ShellRun = {
  run: number;
  elapsedMs: number;
  domContentLoaded: number;
  firstPaint: number;
  moduleCount: number;
  duplicateModules: string[];
};

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  if (!sorted.length) return 0;
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return (sorted[lower] ?? 0) * (1 - weight) + (sorted[upper] ?? 0) * weight;
}

test("initial shell stays responsive and does not duplicate application modules", async ({
  page,
}, testInfo) => {
  test.setTimeout(45_000);
  const runs: ShellRun[] = [];
  for (let run = 1; run <= 5; run += 1) {
    await page.evaluate(() => performance.clearResourceTimings());
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
    runs.push({ run, elapsedMs, ...metrics });
  }
  const elapsed = runs.map((entry) => entry.elapsedMs);
  const medianMs = percentile(elapsed, 0.5);
  const p95Ms = percentile(elapsed, 0.95);
  console.log(
    `[performance] shell median=${medianMs.toFixed(1)}ms p95=${p95Ms.toFixed(1)}ms samples=${elapsed.join(",")}`,
  );
  testInfo.annotations.push({
    type: "performance",
    description: JSON.stringify({ runs, medianMs, p95Ms }),
  });
  expect(p95Ms).toBeLessThan(8_000);
  for (const metrics of runs) {
    expect(metrics.moduleCount).toBeGreaterThan(0);
    expect(metrics.duplicateModules).toEqual([]);
  }

  const searchChunk = page.waitForResponse(
    (response) => /\/global-search-[^/]+\.js$/.test(response.url()),
    { timeout: 8_000 },
  );
  await page.getByRole("button", { name: "Cari di seluruh aplikasi" }).click();
  await searchChunk;
  await expect(page.getByRole("dialog")).toBeVisible();
});
