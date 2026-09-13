import { expect, test, type Locator, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block" });

async function expectTarget(locator: Locator, min = 44) {
  const box = await locator.boundingBox();
  expect(box, "control should be visible and measurable").not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(min);
  expect(box!.height).toBeGreaterThanOrEqual(min);
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
}

async function openCatalog(page: Page) {
  await page.goto("/GYSApp-Tauri/kidung");
  await expect(
    page.getByRole("heading", { name: "Kidung", exact: true }),
  ).toBeVisible();
  await page.locator(".pujian-list > li").first().waitFor({ state: "visible" });
}

async function openFirstHymn(page: Page) {
  await page.goto("/GYSApp-Tauri/kidung/hymn-001");
  await expect(
    page.getByRole("heading", { name: "Pujilah Allah Yang Maha Esa" }),
  ).toBeVisible();
}

test("phone Kidung catalog prioritizes full-width search and large library rows", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openCatalog(page);

  const localLinks = page.locator(".kidung-local-nav a");
  for (let index = 0; index < (await localLinks.count()); index += 1) {
    await expectTarget(localLinks.nth(index));
  }

  const search = page.locator(".hymn-catalog-controls .search-field");
  const collection = page.locator(
    ".hymn-catalog-controls .control-select",
  );
  const searchBox = await search.boundingBox();
  const collectionBox = await collection.boundingBox();
  expect(searchBox).not.toBeNull();
  expect(collectionBox).not.toBeNull();
  expect(searchBox!.width).toBeGreaterThanOrEqual(340);
  expect(collectionBox!.width).toBeGreaterThanOrEqual(340);
  expect(collectionBox!.y).toBeGreaterThan(searchBox!.y + searchBox!.height - 1);

  const firstOpen = page.locator(".pujian-open-button").first();
  await expect(firstOpen).toBeVisible();
  const openBox = await firstOpen.boundingBox();
  expect(openBox).not.toBeNull();
  expect(openBox!.height).toBeGreaterThanOrEqual(56);
  expect(openBox!.width).toBeGreaterThanOrEqual(230);
  await expect(firstOpen).toContainText("001");
  await expect(firstOpen).toContainText("Pujilah Allah Yang Maha Esa");

  await expectTarget(page.locator(".add-to-playlist-btn").first());
  await expectNoHorizontalOverflow(page);
});

test("phone hymn reader keeps primary actions self-explanatory and touch friendly", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFirstHymn(page);

  for (const tab of await page.getByRole("tab").all()) await expectTarget(tab);

  const actions = page.locator(".hymn-text-toolbar .detail-actions .hymn-action");
  expect(await actions.count()).toBeGreaterThanOrEqual(3);
  for (let index = 0; index < (await actions.count()); index += 1) {
    await expectTarget(actions.nth(index));
  }

  const labels = page.locator(
    ".hymn-text-toolbar .detail-actions .hymn-action-label",
  );
  expect(await labels.count()).toBeGreaterThanOrEqual(3);
  for (let index = 0; index < (await labels.count()); index += 1) {
    await expect(labels.nth(index)).toBeVisible();
  }

  await expectTarget(page.locator(".hymn-more-actions-summary"));
  await expectTarget(page.locator(".hymn-reader-settings-summary"));
  await expectNoHorizontalOverflow(page);
});

test("tablet and desktop hymn actions preserve labels without crowding", async ({
  page,
}) => {
  for (const viewport of [
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await openFirstHymn(page);
    const labels = page.locator(
      ".hymn-text-toolbar .detail-actions .hymn-action-label",
    );
    for (let index = 0; index < (await labels.count()); index += 1) {
      await expect(labels.nth(index)).toBeVisible();
    }
    await expectNoHorizontalOverflow(page);
  }
});

test("Kidung visual QA surfaces render without clipping", async ({ page }) => {
  const cases = [
    {
      name: "catalog-phone-390x844",
      width: 390,
      height: 844,
      path: "/GYSApp-Tauri/kidung",
      ready: ".pujian-list > li",
      theme: "light",
    },
    {
      name: "catalog-tablet-768x1024",
      width: 768,
      height: 1024,
      path: "/GYSApp-Tauri/kidung",
      ready: ".pujian-list > li",
      theme: "light",
    },
    {
      name: "reader-desktop-1440x900",
      width: 1440,
      height: 900,
      path: "/GYSApp-Tauri/kidung/hymn-001",
      ready: ".lyrics-sheet",
      theme: "light",
    },
    {
      name: "reader-dark-phone-390x844",
      width: 390,
      height: 844,
      path: "/GYSApp-Tauri/kidung/hymn-001",
      ready: ".lyrics-sheet",
      theme: "dark",
    },
  ] as const;

  for (const entry of cases) {
    await page.setViewportSize({ width: entry.width, height: entry.height });
    await page.goto(entry.path);
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
    }, entry.theme);
    await page.locator(entry.ready).first().waitFor({
      state: "visible",
      timeout: 20_000,
    });
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: `test-results/kidung-preview/${entry.name}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
});
