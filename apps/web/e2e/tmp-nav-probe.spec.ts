import { expect, test } from "@playwright/test";

test("temporary probe: does a sidebar click keep the document", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/GYSApp-Tauri/");
  await expect(page.locator(".home-page")).toBeVisible({ timeout: 60_000 });
  await page.evaluate(() => {
    (window as unknown as { __gysProbe: number }).__gysProbe = 1;
  });
  await page
    .locator(".navigation-shell")
    .getByRole("link", { name: "Alkitab", exact: true })
    .click();
  await expect(page.locator(".verse-text").first()).toBeVisible({
    timeout: 60_000,
  });
  const data = await page.evaluate(() => ({
    survived: (window as unknown as { __gysProbe?: number }).__gysProbe ?? 0,
    marks: performance.getEntriesByType("mark").map((entry) => entry.name),
    timeOrigin: Math.round(performance.timeOrigin),
    now: Math.round(performance.now()),
    navEntries: performance.getEntriesByType("navigation").length,
    history: history.length,
  }));
  console.log(`[nav-probe] ${JSON.stringify(data)}`);
  expect(data.survived).toBe(1);
});
