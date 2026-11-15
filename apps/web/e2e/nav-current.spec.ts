import { expect, test } from "@playwright/test";

/** The bottom navigation is the only way back on a phone, so it has to say
 *  where the reader is. Literatur and Suara are reached from Lainnya, and the
 *  reader has to be able to tell that from the bar itself. */
const ROUTES = [
  { path: "/", label: "Beranda" },
  { path: "/bible?book=kejadian&chapter=1", label: "Alkitab" },
  { path: "/kidung", label: "Kidung" },
  { path: "/kidung/hymn-001", label: "Kidung" },
  { path: "/kidung?section=playlist", label: "Kidung" },
  { path: "/iman", label: "Iman" },
  { path: "/lainnya", label: "Lainnya" },
  { path: "/literatur", label: "Lainnya" },
  { path: "/suara", label: "Lainnya" },
];

test.describe("bottom navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "gys-shell-settings-v1",
        JSON.stringify({
          version: 1,
          locale: "id",
          theme: "light",
          onboarded: true,
        }),
      );
    });
    await page.route(/^https:\/\//, (route) => route.abort());
  });

  test("marks exactly one destination on every route", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 390, height: 844 });
    for (const route of ROUTES) {
      await page.goto(`/GYSApp-Tauri${route.path}`);
      await expect(page.locator(".primary-nav")).toBeVisible({
        timeout: 30_000,
      });
      const current = page.locator('.primary-nav a[aria-current="page"]');
      await expect(current).toHaveCount(1);
      await expect(current).toHaveAttribute(
        "aria-label",
        new RegExp(route.label, "i"),
      );
    }
  });
});
