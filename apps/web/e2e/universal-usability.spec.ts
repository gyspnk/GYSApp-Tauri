import { expect, test, type Locator, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block" });

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth + 1,
      ),
    )
    .toBe(true);
}

async function expectHitArea(locator: Locator, min = 44) {
  const box = await locator.boundingBox();
  expect(box, "control should be visible and measurable").not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(min);
  expect(box!.height).toBeGreaterThanOrEqual(min);
}

async function fontSize(locator: Locator) {
  return locator.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).fontSize),
  );
}

test("tablet rail keeps every primary destination named and easy to acquire", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/GYSApp-Tauri/");

  const shell = page.locator(".navigation-shell");
  const shellBox = await shell.boundingBox();
  expect(shellBox).not.toBeNull();
  expect(shellBox!.width).toBeLessThanOrEqual(96);

  const items = page.locator(".navigation-shell .nav-item");
  await expect(items).toHaveCount(5);
  for (let index = 0; index < 5; index += 1) {
    const item = items.nth(index);
    const label = item.locator(".nav-copy strong");
    await expect(label).toBeVisible();
    expect(await fontSize(label)).toBeGreaterThanOrEqual(11);
    await expectHitArea(item);
  }

  await expectNoHorizontalOverflow(page);
});

test("tablet home section actions stay on one line", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/GYSApp-Tauri/");

  const actions = page.locator(
    ".home-media-section .section-title-row > .text-button",
  );
  await expect(actions).toHaveCount(2);
  for (let index = 0; index < 2; index += 1) {
    await expect(actions.nth(index)).toHaveCSS("white-space", "nowrap");
  }
});

test("phone shell keeps navigation labels readable and common actions finger sized", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/GYSApp-Tauri/");

  const labels = page.locator(".navigation-shell .nav-copy strong");
  await expect(labels).toHaveCount(5);
  for (let index = 0; index < 5; index += 1) {
    await expect(labels.nth(index)).toBeVisible();
    expect(await fontSize(labels.nth(index))).toBeGreaterThanOrEqual(11);
  }

  await expectHitArea(page.locator(".navigation-shell .nav-item").first());
  const search = page.locator(".search-trigger");
  if (await search.isVisible()) await expectHitArea(search);
  const account = page.locator(".account-button");
  if (await account.isVisible()) await expectHitArea(account);
  await expectNoHorizontalOverflow(page);
});

test("More starts with account needs before technical asset management", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/GYSApp-Tauri/lainnya");

  const account = page.locator(".account-card");
  const assets = page.locator(".distributed-assets-card");
  await expect(account).toBeVisible();
  await expect(assets).toBeVisible();

  const accountBox = await account.boundingBox();
  const assetsBox = await assets.boundingBox();
  expect(accountBox).not.toBeNull();
  expect(assetsBox).not.toBeNull();
  expect(accountBox!.y).toBeLessThan(assetsBox!.y);
  await expectNoHorizontalOverflow(page);
});

test("representative surfaces remain contained with 200 percent root text sizing", async ({
  page,
}) => {
  const routes = ["/", "/bible", "/kidung", "/iman", "/literatur", "/lainnya"];
  await page.setViewportSize({ width: 390, height: 844 });

  for (const route of routes) {
    await page.goto(`/GYSApp-Tauri${route}`);
    await page.locator("#main-content").waitFor({ state: "visible" });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await expectNoHorizontalOverflow(page);
  }
});

test("reduced motion removes decorative shell movement", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/GYSApp-Tauri/");

  await expect(page.locator(".workspace")).toHaveCSS(
    "transition-duration",
    "0s",
  );
  await expect(page.locator(".sidebar-collapse-toggle")).toHaveCSS(
    "transition-duration",
    "0s",
  );
  expect(
    await page.evaluate(
      () => getComputedStyle(document.documentElement).scrollBehavior,
    ),
  ).toBe("auto");
});
