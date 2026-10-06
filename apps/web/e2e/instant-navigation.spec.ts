import { expect, test } from "@playwright/test";

test("warm navigation reuses core payloads without optional downloads", async ({
  page,
}) => {
  let bibleRequests = 0;
  let hymnRequests = 0;
  let faithRequests = 0;
  let pdfRequests = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/offline/bible/tb-reader.json"))
      bibleRequests++;
    if (request.url().endsWith("/offline/hymn-metadata.json")) hymnRequests++;
    if (request.url().endsWith("/offline/faith.json")) faithRequests++;
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
    ["/iman", ".faith-row"],
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
  expect(faithRequests).toBe(1);
  expect(pdfRequests).toBe(0);
});

test("preloaded first visits render without the React Suspense reveal delay", async ({
  page,
}) => {
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/GYSApp-Tauri/");
  await page.waitForFunction(() =>
    ["bible", "kidung", "faith", "more"].every(
      (id) => performance.getEntriesByName(`gys-route-preloaded:${id}`).length,
    ),
  );
  for (const [index, selector] of [
    [1, ".verse-row"],
    [2, ".hymn-catalog-shell"],
    [3, ".faith-row"],
    [4, ".more-page"],
  ] as const) {
    const elapsed = await page.evaluate(
      ({ index, selector }) =>
        new Promise<number>((resolve) => {
          const start = performance.now();
          document
            .querySelectorAll<HTMLAnchorElement>(".primary-nav .nav-item")
            [index]!.click();
          const check = () => {
            const content = document.querySelector(selector);
            if (content && content.getBoundingClientRect().width > 0)
              requestAnimationFrame(() => resolve(performance.now() - start));
            else requestAnimationFrame(check);
          };
          requestAnimationFrame(check);
        }),
      { index, selector },
    );
    expect(elapsed, selector).toBeLessThan(250);
    await expect(page.locator(".route-loading")).toHaveCount(0);
  }
});

test("branded PDF loading stays compact and indeterminate before response bytes arrive", async ({
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
  const logo = loading.getByRole("img", { name: "Gereja Yesus Sejati" });
  await expect(logo).toBeVisible();
  await expect
    .poll(() => logo.evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBeGreaterThan(0);
  expect((await bar.boundingBox())!.y).toBeGreaterThan(
    (await logo.boundingBox())!.y + (await logo.boundingBox())!.height,
  );
  expect(
    await bar
      .locator(":scope > span")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("loading-flow");
  expect(
    (await loading.locator(".pdf-loading-page").boundingBox())!.height,
  ).toBeLessThan(160);
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await bar
      .locator(":scope > span")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
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
