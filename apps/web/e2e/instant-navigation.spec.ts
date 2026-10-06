import { expect, test } from "@playwright/test";

test("warm navigation reuses core payloads without optional downloads", async ({
  page,
}) => {
  let bibleRequests = 0;
  let hymnRequests = 0;
  let pdfRequests = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/offline/bible/tb-reader.json"))
      bibleRequests++;
    if (request.url().endsWith("/offline/hymn-metadata.json")) hymnRequests++;
    if (/\.pdf(?:$|\?)/.test(request.url())) pdfRequests++;
  });
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/GYSApp-Tauri/");
  await expect(page.locator(".home-grid")).toBeVisible();
  await page.waitForFunction(() =>
    ["home", "bible", "kidung", "faith", "more"].every(
      (id) => performance.getEntriesByName(`gys-route-preloaded:${id}`).length,
    ),
  );
  const timings = [];
  for (const [path, selector] of [
    ["/bible", ".verse-row"],
    ["/kidung", ".hymn-catalog-shell"],
    ["/iman", ".faith-row"],
    ["/lainnya", ".more-page"],
    ["/", ".home-grid"],
    ["/bible", ".verse-row"],
  ]) {
    const start = Date.now();
    await page
      .locator(".primary-nav .nav-item")
      .nth(["/", "/bible", "/kidung", "/iman", "/lainnya"].indexOf(path!))
      .click();
    await expect(page.locator(selector!).first()).toBeVisible({
      timeout: 1000,
    });
    timings.push({ path, ms: Date.now() - start });
    await expect(page.locator(".route-loading")).toHaveCount(0);
  }
  console.log("Warm navigation", timings);
  expect(bibleRequests).toBe(1);
  expect(hymnRequests).toBe(1);
  expect(pdfRequests).toBe(0);
});

test("PDF loading is compact and indeterminate before response bytes arrive", async ({
  page,
}) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/assets/faith/Yesus-Kristus.pdf", async (route) => {
    await pending;
    await route.fulfill({ response: await route.fetch() });
  });
  await page.goto("/GYSApp-Tauri/iman");
  await page.locator('button[aria-label*="PDF"]').first().click();
  const loading = page.locator(".faith-pdf-overlay .pdf-loading");
  await expect(loading).toBeVisible();
  const bar = loading.getByRole("progressbar");
  await expect(bar).toHaveCount(1);
  await expect(bar).not.toHaveAttribute("aria-valuenow");
  expect(
    (await loading.locator(".pdf-loading-page").boundingBox())!.height,
  ).toBeLessThan(110);
  release();
  await expect(loading).toBeHidden();
  await expect(
    page.locator('.faith-pdf-overlay canvas[data-pdf-rendered="true"]').first(),
  ).toBeVisible();
});

test("article excerpt paints while the full source is still pending", async ({
  page,
}) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("https://tjc.org/id/wp-json/**", async (route) => {
    await pending;
    await route.abort();
  });
  await page.goto("/GYSApp-Tauri/suara/147-menapaki-tiga-iman");
  await expect(page.locator(".online-article-body")).toContainText(
    "Dokter menyarankan operasi",
  );
  await expect(
    page.locator(".suara-article-card .loading-progress"),
  ).toBeVisible();
  await expect(page.locator(".route-loading")).toHaveCount(0);
  release();
  await expect(page.locator(".reader-preview-note")).toBeVisible();
  await expect(
    page.locator(".suara-article-card .loading-progress"),
  ).toHaveCount(0);
});
