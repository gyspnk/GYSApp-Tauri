import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test("Home keeps its empty activity state and exposes feed retries offline", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });

  let sauhSnapshots = 0;
  let suaraSnapshots = 0;
  let literatureSnapshots = 0;
  let publisherRequests = 0;
  let feedsAvailable = false;
  await page.route("**/offline/sauh.json", (route) => {
    sauhSnapshots += 1;
    if (feedsAvailable) return route.continue();
    return route.fulfill({ json: { items: [] } });
  });
  await page.route("**/offline/suara-sejati.json", (route) => {
    suaraSnapshots += 1;
    if (feedsAvailable) return route.continue();
    return route.fulfill({ json: { source: "tjc.org", items: [] } });
  });
  await page.route("**/offline/literature.json", (route) => {
    literatureSnapshots += 1;
    if (feedsAvailable) return route.continue();
    return route.fulfill({ json: { source: "tjc.org", items: [] } });
  });
  await page.route("https://tjc.org/**", (route) => {
    publisherRequests += 1;
    if (feedsAvailable) return route.continue();
    return route.abort("connectionrefused");
  });

  await page.goto("/GYSApp-Tauri/");
  await expect(page.locator(".home-grid")).toBeVisible();
  await expect(page.locator(".continue-panel .empty-inline")).toContainText(
    "Belum ada bacaan terakhir.",
  );

  const sauhError = page.locator(".sauh-offline-state");
  const suaraError = page.locator(".home-suara-section .error-panel");
  const literatureError = page.locator(".home-literature-section .error-panel");
  await expect(sauhError).toContainText("Coba lagi");
  await expect(suaraError).toContainText("Suara Sejati belum tersedia.");
  await expect(literatureError).toContainText("Literatur belum tersedia.");
  await expect(page.locator(".continue-panel .continue-item")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);

  const initialCounts = {
    sauhSnapshots,
    suaraSnapshots,
    literatureSnapshots,
    publisherRequests,
  };
  await sauhError.getByRole("button", { name: "Coba lagi" }).click();
  await expect(sauhError).toBeVisible();
  expect(sauhSnapshots + publisherRequests).toBeGreaterThan(
    initialCounts.sauhSnapshots + initialCounts.publisherRequests,
  );

  const beforeSuaraRetry = { suaraSnapshots, publisherRequests };
  await suaraError.getByRole("button", { name: "Coba lagi" }).click();
  await expect(suaraError).toBeVisible();
  expect(suaraSnapshots + publisherRequests).toBeGreaterThan(
    beforeSuaraRetry.suaraSnapshots + beforeSuaraRetry.publisherRequests,
  );

  await literatureError.getByRole("button", { name: "Coba lagi" }).click();
  await expect(literatureError).toBeVisible();
  expect(literatureSnapshots).toBeGreaterThan(
    initialCounts.literatureSnapshots,
  );

  feedsAvailable = true;
  const beforeRecovery = { sauhSnapshots, suaraSnapshots, literatureSnapshots };
  await sauhError.getByRole("button", { name: "Coba lagi" }).click();
  await expect(page.locator(".sauh-card-body")).toBeVisible();
  expect(sauhSnapshots).toBeGreaterThan(beforeRecovery.sauhSnapshots);

  await suaraError.getByRole("button", { name: "Coba lagi" }).click();
  await expect(
    page.locator(".home-suara-section .suara-library-item").first(),
  ).toBeVisible();
  expect(suaraSnapshots).toBeGreaterThan(beforeRecovery.suaraSnapshots);

  await literatureError.getByRole("button", { name: "Coba lagi" }).click();
  await expect(
    page.locator(".home-literature-section .suara-library-item").first(),
  ).toBeVisible();
  expect(literatureSnapshots).toBeGreaterThan(
    beforeRecovery.literatureSnapshots,
  );
  await expect(page.locator(".home-suara-section .error-panel")).toHaveCount(0);
  await expect(
    page.locator(".home-literature-section .error-panel"),
  ).toHaveCount(0);
});
