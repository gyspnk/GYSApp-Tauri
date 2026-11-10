import { expect, test } from "@playwright/test";

/**
 * The Iman search must say how many points matched and, when nothing does,
 * offer the way out instead of leaving an empty list behind.
 */
test.beforeEach(async ({ page }) => {
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/GYSApp-Tauri/iman");
  await expect(page.getByRole("searchbox")).toBeVisible({ timeout: 30_000 });
});

test("the search reports its match count and the empty state clears it", async ({
  page,
}) => {
  const search = page.getByRole("searchbox");
  await search.fill("baptis");

  const status = page.getByRole("status").filter({ hasText: /dari \d+ pokok/ });
  await expect(status).toBeVisible();
  const text = (await status.innerText()).trim();
  const count = Number.parseInt(text, 10);
  expect(count).toBeGreaterThan(0);
  await expect(page.locator(".faith-row")).toHaveCount(count);

  await search.fill("zzz tidak ada");
  await expect(page.locator(".faith-row")).toHaveCount(0);
  await expect(page.getByText("Tidak ada pokok yang cocok")).toBeVisible();

  await page.getByRole("button", { name: "Hapus pencarian" }).last().click();
  await expect(search).toHaveValue("");
  await expect(page.locator(".faith-row")).toHaveCount(10);
});
