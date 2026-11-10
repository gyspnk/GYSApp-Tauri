import { expect, test } from "@playwright/test";

test("the offline row reports what the platform actually holds", async ({
  page,
}) => {
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: {
        estimate: async () => ({ usage: 12 * 1024 * 1024, quota: 1024 ** 3 }),
      },
    });
  });
  await page.goto("/GYSApp-Tauri/lainnya?section=offline");
  const note = page.locator(".more-storage-note");
  await expect(note).toContainText("12");
  await expect(note).toContainText("1.024");
});

test("an honest unknown beats a made-up number", async ({ page }) => {
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.addInitScript(() => {
    // Older browsers expose no StorageManager at all.
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: undefined,
    });
  });
  await page.goto("/GYSApp-Tauri/lainnya?section=offline");
  await expect(page.locator(".more-storage-note")).toContainText(
    "belum bisa dibaca",
  );
});
