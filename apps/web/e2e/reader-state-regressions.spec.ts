import { expect, test } from "@playwright/test";
import { preparePinnedReaderAssets } from "./pinned-reader-fixtures.js";
import { STORAGE_SCHEMA_VERSION } from "../src/storage.js";

test("history navigation resets window scroll before entering another page", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/GYSApp-Tauri/");
  await expect(page.locator(".home-grid")).toBeVisible();
  await page.evaluate(() => {
    window.scrollTo({ top: 500, behavior: "instant" });
    history.pushState(null, "", "/GYSApp-Tauri/bible");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page.locator(".verse-row").first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await page.evaluate(() => window.scrollTo({ top: 400, behavior: "instant" }));
  await page.goBack();
  await expect(page.locator(".home-grid")).toBeVisible();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
});

for (const width of [390, 1440]) {
  test(`PDF zoom HUD and controls stay anchored during zoom and pan (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 760 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await preparePinnedReaderAssets(page);
    await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=pdf");
    const reader = page.locator(".pdf-reader");
    await expect(
      reader.locator('canvas[data-pdf-rendered="true"]').first(),
    ).toBeVisible({ timeout: 15_000 });
    const toolbar = reader.locator(".pdf-toolbar");
    const before = (await toolbar.boundingBox())!;
    const stage = reader.locator(".pdf-stage");
    await stage.evaluate((element) => {
      const box = element.getBoundingClientRect();
      element.dispatchEvent(
        new WheelEvent("wheel", {
          ctrlKey: true,
          deltaY: -460,
          clientX: box.x + box.width / 2,
          clientY: box.y + box.height / 2,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await expect(reader.locator(".pdf-zoom-indicator")).toHaveText("251%");
    const hud = reader.locator(".pdf-zoom-hud");
    await expect(hud).toHaveClass(/is-visible/);
    const initial = (await hud.boundingBox())!;
    const viewport = (await stage.boundingBox())!;
    expect(initial.y).toBeGreaterThanOrEqual(viewport.y);
    await stage.evaluate((element) => {
      element.scrollTop += 120;
      element.scrollLeft += 60;
    });
    const after = (await hud.boundingBox())!;
    expect(Math.abs(after.x - initial.x)).toBeLessThan(1);
    expect(Math.abs(after.y - initial.y)).toBeLessThan(1);
    expect((await toolbar.boundingBox())!.y).toBeCloseTo(before.y, 0);
  });
}

test("literature articles enter a dedicated reader and offer separate resume positions", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route(/^https:\/\//, (route) => route.abort());
  const item = {
    id: "reader-article",
    category: "kesaksian",
    title: "Berjalan Bersama Tuhan",
    description: "Kesaksian",
    url: "https://tjc.org/id/reader-article/",
    format: "article",
    publishedAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
    source: "tjc.org",
  };
  await page.route("**/offline/literature.json", (route) =>
    route.fulfill({
      json: {
        source: "tjc.org",
        generatedAt: new Date().toISOString(),
        items: [item],
      },
    }),
  );
  await page.addInitScript(
    ({ item, schema }) => {
      localStorage.setItem(
        "gys-storage-meta-v1",
        JSON.stringify({
          version: schema,
          migratedAt: new Date().toISOString(),
        }),
      );
      localStorage.setItem(
        `gys_article_cache_${item.url}`,
        JSON.stringify({
          ...item,
          body: Array.from({ length: 60 }, (_, i) =>
            `Paragraf ${i + 1}. Tuhan menyertai setiap langkah kehidupan kita. `.repeat(
              7,
            ),
          ).join("\n\n"),
          fetchedAt: new Date().toISOString(),
        }),
      );
      localStorage.setItem(
        "gys-literature-progress-v2",
        JSON.stringify({
          [item.id]: {
            version: 2,
            percent: 70,
            resourceVersion: item.publishedAt,
            updatedAt: new Date().toISOString(),
            lastOpenedAt: new Date().toISOString(),
            location: { kind: "scroll", ratio: 0.2 },
            furthestLocation: { kind: "scroll", ratio: 0.7 },
          },
        }),
      );
    },
    { item, schema: STORAGE_SCHEMA_VERSION },
  );
  await page.goto("/GYSApp-Tauri/literatur/reader-article");

  await page
    .getByRole("button", { name: "Lanjutkan membaca", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/literatur\/reader-article\/read$/);
  await expect(
    page.locator('[data-testid="literature-article-reader"]'),
  ).toBeVisible();
  await expect(page.locator(".online-article-body > p")).toHaveCount(60);
  await expect(page.locator(".literature-detail-hero")).toHaveCount(0);
  await page.getByRole("button", { name: "Terakhir 20%", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => scrollY / (document.documentElement.scrollHeight - innerHeight),
      ),
    )
    .toBeCloseTo(0.2, 2);
  await page.evaluate(() => window.scrollTo({ top: 100, behavior: "instant" }));
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("gys-literature-progress-v2")!)[
            "reader-article"
          ].location.ratio,
      ),
    )
    .toBeLessThan(0.05);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("gys-literature-progress-v2")!)[
          "reader-article"
        ].percent,
    ),
  ).toBe(70);
  await page.goBack();
  await expect(page.locator(".literature-detail-hero")).toBeVisible();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await page
    .getByRole("button", { name: "Lanjutkan membaca", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Terjauh 70%", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => scrollY / (document.documentElement.scrollHeight - innerHeight),
      ),
    )
    .toBeCloseTo(0.7, 2);
  await page.getByRole("button", { name: "Posisi baca", exact: true }).click();
  await page.getByRole("button", { name: "Dari awal", exact: true }).click();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  // Restoring a fractional position rounds to a physical scroll pixel.
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("gys-literature-progress-v2")!)[
          "reader-article"
        ].furthestLocation.ratio,
    ),
  ).toBeCloseTo(0.7, 3);
});
