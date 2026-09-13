import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test("More keeps account needs before technical asset management", async ({
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
});

test("More data deep link remains visible after asynchronous layout settles", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/GYSApp-Tauri/lainnya?section=data");

  await expect(page.locator(".distributed-assets-list")).toBeVisible();
  await expect(page.locator(".account-loading-box")).toHaveCount(0, {
    timeout: 10_000,
  });
  await expect(page.getByText("Memuat katalog aset…")).toHaveCount(0, {
    timeout: 10_000,
  });

  const heading = page.getByRole("heading", { name: "Manajemen Aset" });
  await expect(heading).toBeVisible();
  await expect
    .poll(async () => (await heading.boundingBox())?.y ?? -1)
    .toBeGreaterThanOrEqual(64);
});
