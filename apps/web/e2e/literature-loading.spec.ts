import { expect, test, type Page } from "@playwright/test";
import { documentBytes } from "./pdf-fixtures.js";

const publisher =
  "https://tjcorguploads.s3.amazonaws.com/tjcorg/wp-content/uploads/sites/43/2026/07/reading.pdf";
function entry(category: "warta" | "pelita-kecil" | "buku" | "panduan") {
  const issue = category === "warta" || category === "pelita-kecil";
  return {
    id: category,
    category,
    title:
      category === "warta"
        ? "Warta Sejati"
        : category === "pelita-kecil"
          ? "Pelita Kecil"
          : "Literatur",
    description: "",
    url: issue
      ? `https://tjc.org/id/${category === "warta" ? "warta-sejati/ws-4" : "pelitakecil/pk46"}/`
      : publisher,
    format: issue ? "issue" : "pdf",
    publishedAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
    source: "tjc.org",
  };
}
async function prepare(page: Page, category: Parameters<typeof entry>[0]) {
  const item = entry(category);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.route("**/offline/literature.json", (route) =>
    route.fulfill({
      json: {
        source: "tjc.org",
        generatedAt: "2026-10-06T00:00:00Z",
        items: [item],
      },
    }),
  );
  await page.route("**/api/v1/content/pdf?**", (route) =>
    route.fulfill({
      body: documentBytes(4),
      contentType: "application/pdf",
      headers: { "access-control-allow-origin": "*" },
    }),
  );
  return { item, errors };
}

for (const width of [390, 768, 1440]) {
  for (const category of [
    "warta",
    "pelita-kecil",
    "buku",
    "panduan",
  ] as const) {
    test(`${category} opens a stable internal PDF at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 650 });
      const { errors } = await prepare(page, category);
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route("**/api/v1/content/pdf-source?**", async (route) => {
        await gate;
        await route.fulfill({
          json: { url: publisher },
          headers: { "access-control-allow-origin": "*" },
        });
      });
      await page.goto(`/GYSApp-Tauri/literatur/${category}?read=1`, {
        waitUntil: "domcontentloaded",
      });
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      const before = await dialog.locator(".section-title-row").boundingBox();
      const handle = await dialog.elementHandle();
      if (category === "warta" || category === "pelita-kecil") {
        await expect(dialog.locator(".literature-pdf-preparing")).toBeVisible();
        expect(await page.locator(".pdf-reader").count()).toBe(0);
      }
      release();
      await expect(
        dialog.locator('canvas[data-pdf-rendered="true"]').first(),
      ).toBeVisible();
      expect(await handle!.evaluate((node) => node.isConnected)).toBe(true);
      expect(await dialog.locator(".section-title-row").boundingBox()).toEqual(
        before,
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        ),
      ).toBe(0);
      expect(errors).toEqual([]);
      await dialog.getByRole("button", { name: "Tutup", exact: true }).click();
      await expect(page).toHaveURL(/\/literatur$/);
    });
  }
}

test("older metadata workers fall back to WordPress and reuse the source on revisit", async ({
  page,
}) => {
  await prepare(page, "pelita-kecil");
  let postRequests = 0;
  await page.route("**/api/v1/content/pdf-source?**", (route) =>
    route.fulfill({
      status: 404,
      json: {},
      headers: { "access-control-allow-origin": "*" },
    }),
  );
  await page.route("https://tjc.org/id/wp-json/wp/v2/posts?**", (route) => {
    postRequests++;
    return route.fulfill({
      json: [{ content: { rendered: `<iframe src="${publisher}"></iframe>` } }],
      headers: { "access-control-allow-origin": "*" },
    });
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goto("/GYSApp-Tauri/literatur/pelita-kecil?read=1");
    await expect(
      page.locator('canvas[data-pdf-rendered="true"]').first(),
    ).toBeVisible();
  }
  expect(postRequests).toBe(1);
});

test("repeated PDF failures stay inside the viewer and retry without clearing shell caches", async ({
  page,
}) => {
  await prepare(page, "buku");
  let requests = 0;
  await page.route("**/api/v1/content/pdf?**", (route) => {
    requests++;
    return requests <= 2
      ? route.fulfill({
          status: 503,
          body: "Unavailable",
          headers: { "access-control-allow-origin": "*" },
        })
      : route.fulfill({
          body: documentBytes(4),
          contentType: "application/pdf",
          headers: { "access-control-allow-origin": "*" },
        });
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator.serviceWorker, "controller", {
      value: {
        postMessage: (message: unknown) => {
          (
            window as unknown as { purgeMessages: unknown[] }
          ).purgeMessages.push(message);
        },
      },
    });
    (window as unknown as { purgeMessages: unknown[] }).purgeMessages = [];
  });
  await page.goto("/GYSApp-Tauri/literatur/buku?read=1");
  const dialog = await page.getByRole("dialog").elementHandle();
  for (let attempt = 0; attempt < 2; attempt++) {
    await expect(page.locator(".pdf-error-state")).toBeVisible();
    await page.getByRole("button", { name: "Coba lagi", exact: true }).click();
  }
  await expect(
    page.locator('canvas[data-pdf-rendered="true"]').first(),
  ).toBeVisible();
  expect(await dialog!.evaluate((node) => node.isConnected)).toBe(true);
  expect(
    await page.evaluate(
      () => (window as unknown as { purgeMessages: unknown[] }).purgeMessages,
    ),
  ).toEqual([]);
});

test("the first paint has a branded dark loading state before the application bundle arrives", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "gys-shell-settings-v1",
      JSON.stringify({ version: 1, theme: "dark", locale: "id" }),
    ),
  );
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/assets\/index-.*\.js$/, async (route) => {
    await gate;
    await route.continue();
  });
  await page.route(/^https:\/\//, (route) => route.abort());
  const navigation = page.goto("/GYSApp-Tauri/", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator(".shell-startup img")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(
    await page.evaluate(
      () => getComputedStyle(document.documentElement).backgroundColor,
    ),
  ).not.toBe("rgb(255, 255, 255)");
  release();
  await navigation;
  await expect(
    page.getByRole("heading", { name: "Bacaan & nyanyian" }),
  ).toBeVisible();
  await expect(page.locator(".shell-startup")).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("cached Home literature stays visible while the snapshot refreshes", async ({
  page,
}) => {
  const { item } = await prepare(page, "warta");
  await page.addInitScript(
    (item) =>
      localStorage.setItem(
        "gys_literature_catalog_v5",
        JSON.stringify({ items: [item], fetchedAt: new Date().toISOString() }),
      ),
    item,
  );
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/offline/literature.json", async (route) => {
    await gate;
    await route.fulfill({
      json: {
        source: "tjc.org",
        generatedAt: "2026-10-06T00:00:00Z",
        items: [item],
      },
    });
  });
  await page.goto("/GYSApp-Tauri/", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".home-literature-shelf")).toBeVisible();
  expect(
    await page.locator(".home-literature-section .loading-progress").count(),
  ).toBe(0);
  release();
  await expect(page.locator(".home-literature-shelf")).toBeVisible();
});

for (const width of [390, 768, 1440]) {
  test(`PDF stall notice respects byte inactivity and stays compact at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 720 });
    await page.clock.install();
    await prepare(page, "buku");
    let release!: () => void;
    let requested = false;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/v1/content/pdf?**", async (route) => {
      requested = true;
      await gate;
      await route.fulfill({
        body: documentBytes(4),
        contentType: "application/pdf",
      });
    });
    await page.goto("/GYSApp-Tauri/literatur/buku?read=1");
    await expect.poll(() => requested).toBe(true);
    const progress = page.locator('.pdf-loading [role="progressbar"]');
    await expect(progress).toBeVisible();
    await expect(progress).not.toHaveAttribute("aria-valuenow");
    await page.clock.fastForward(10_000);
    await expect(page.locator(".pdf-loading-slow")).toHaveCount(0);
    await page.clock.fastForward(3_000);
    const notice = page.locator(".pdf-loading-slow");
    await expect(notice).toBeVisible();
    const bounds = await notice.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await page.clock.runFor(250);
    await page.screenshot({
      path: testInfo.outputPath(`pdf-loading-${width}.png`),
    });
    release();
    await page.clock.resume();
    await expect(
      page.locator('canvas[data-pdf-rendered="true"]').first(),
    ).toBeVisible();
    await expect(notice).toHaveCount(0);
  });
}
