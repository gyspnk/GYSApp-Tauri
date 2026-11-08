import { expect, test } from "@playwright/test";

// The reader may paint from per-book files before the full pack arrives. Any
// runtime error there is a real regression, so the first chapter must appear
// with a clean console.
test("Bible reader paints its first chapter without a runtime error", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(String(error.stack ?? error));
  });
  await page.goto("/GYSApp-Tauri/bible");
  await expect(page.getByRole("heading", { name: /Kejadian 1/ })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.locator(".verse-text").first()).toBeVisible();
  expect(errors).toEqual([]);
});
