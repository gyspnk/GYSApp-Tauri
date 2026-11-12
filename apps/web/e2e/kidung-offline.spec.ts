import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "allow" });

// Offline reloads re-install the worker and boot the shell from cache; under a
// sharded run that easily doubles the wall time, so this file keeps triple the
// default budget instead of failing on contention.
test.slow();

test("prepared catalog opens previously unvisited Kidung sections offline @nightly", async ({
  page,
  context,
}) => {
  test.skip(
    process.env.GYS_E2E_DEV === "1",
    "Production service worker contract",
  );
  await page.goto("/GYSApp-Tauri/kidung");
  await expect(page.locator(".pujian-item")).toHaveCount(533);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
  await context.setOffline(true);

  await page.locator('a.nav-item[href$="/lainnya"]').click();
  await page.locator('[data-setting="hymns"] > summary').click();
  await expect(page.locator(".kidung-settings-section").first()).toBeVisible();
  await page.locator('a.nav-item[href$="/kidung"]').click();
  await page.locator('.kidung-local-nav a[href$="section=playlist"]').click();
  // The queue keeps its title for assistive tech; the visible chrome is one
  // toolbar card shared with the catalogue, so the tab is what identifies it.
  await expect(page.locator(".kidung-tool-page h1")).toHaveText("Antrean MIDI");
  await expect(
    page.locator('.kidung-local-nav a[href$="section=playlist"]'),
  ).toHaveAttribute("aria-current", "page");
  await page.locator('.kidung-local-nav a[href$="/kidung"]').click();
  await expect(page.locator(".pujian-item")).toHaveCount(533);
  const mode = page.locator(".kidung-mode-cycle");
  if ((await mode.getAttribute("aria-pressed")) === "true") await mode.click();
  await expect(mode).toHaveAttribute("aria-pressed", "false");
  await page.locator(".pujian-title").first().click();
  await expect(page.locator(".hymn-detail-page")).toBeVisible();
  await expect(page.locator(".lyrics-sheet").first()).toBeVisible();
});

test("a verified local PDF remains readable after returning offline", async ({
  page,
  context,
}) => {
  test.skip(
    process.env.GYS_E2E_DEV === "1",
    "Production service worker contract",
  );
  await page.route("https://raw.githubusercontent.com/**", (route) =>
    route.abort(),
  );
  await page.goto("/GYSApp-Tauri/kidung/hymn-001");
  await expect(page.locator(".lyrics-sheet").first()).toBeVisible();
  await page.locator(".hymn-partitur-toggle").click();
  await expect(
    page.locator("canvas[data-pdf-rendered='true']").first(),
  ).toBeVisible({ timeout: 20000 });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".lyrics-sheet")).toBeVisible();
  await page.locator(".hymn-partitur-toggle").click();
  await expect(
    page.locator("canvas[data-pdf-rendered='true']").first(),
  ).toBeVisible({ timeout: 20000 });
});
