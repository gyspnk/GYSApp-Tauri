import { expect, test } from "@playwright/test";

test("temporary probe: where the reader click spends its time", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/GYSApp-Tauri/kidung");
  await expect(page.locator(".pujian-item").first()).toBeVisible({
    timeout: 60_000,
  });
  await page.waitForTimeout(2_000);
  const row = page.locator(".pujian-item .pujian-title").first();
  await row.hover();
  await page.waitForTimeout(400);
  const clicked = await page.evaluate(() => {
    performance.clearMarks();
    performance.mark("probe-click");
    return Math.round(performance.now());
  });
  await row.click();
  await expect(page.locator(".hymn-detail-page")).toBeVisible({
    timeout: 60_000,
  });
  const shell = await page.evaluate(() => Math.round(performance.now()));
  await expect(page.locator(".lyrics-sheet")).toBeVisible({ timeout: 60_000 });
  const lyrics = await page.evaluate(() => Math.round(performance.now()));
  const marks = await page.evaluate(() =>
    performance
      .getEntriesByType("mark")
      .map((entry) => `${entry.name}@${Math.round(entry.startTime)}`),
  );
  console.log(
    `[nav-probe] ${JSON.stringify({ clicked, shell: shell - clicked, lyrics: lyrics - clicked, marks })}`,
  );
  expect(shell).toBeGreaterThan(clicked);
});
