import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

async function isInViewport(
  page: import("@playwright/test").Page,
  selector: string,
) {
  return page.locator(selector).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.top >= 0 && rect.top < window.innerHeight;
  });
}

test("More keeps account first but data deep link reveals asset management", async ({
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

  await page.goto("/GYSApp-Tauri/lainnya?section=data");
  await expect(page.locator(".distributed-assets-list")).toBeVisible();
  await expect
    .poll(() => isInViewport(page, ".distributed-assets-card"))
    .toBe(true);

  // Asset metadata can finish rendering after the route itself is ready. Verify
  // the settled scroll position rather than accepting a transient first frame.
  await page.waitForTimeout(500);
  const heading = page.getByRole("heading", { name: "Manajemen Aset" });
  await expect(heading).toBeVisible();
  const headingBox = await heading.boundingBox();
  expect(headingBox).not.toBeNull();
  expect(headingBox!.y).toBeGreaterThanOrEqual(64);
});
