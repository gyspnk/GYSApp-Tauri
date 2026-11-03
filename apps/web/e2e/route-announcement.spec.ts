import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test("a direct load names the page in the document title", async ({ page }) => {
  await page.goto("/GYSApp-Tauri/alkitab");
  await expect(
    page.getByRole("heading", { level: 1, name: "Alkitab" }),
  ).toBeVisible({
    timeout: 15_000,
  });
  await expect(page).toHaveTitle("Alkitab · GYSApp");
});

test("navigating moves focus to the new page heading", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/GYSApp-Tauri/lainnya");
  await page
    .getByRole("link", { name: /^Literatur/ })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Literatur" }),
  ).toBeVisible({
    timeout: 15_000,
  });
  await expect(page).toHaveTitle("Literatur · GYSApp");
  const active = await page.evaluate(() => {
    const node = document.activeElement as HTMLElement | null;
    return {
      tag: node?.tagName ?? null,
      text: node?.textContent?.trim() ?? null,
    };
  });
  expect(active).toEqual({ tag: "H1", text: "Literatur" });
});
