import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

async function expectTouchTarget(locator: ReturnType<Parameters<typeof test>[1]> extends never ? never : any, min = 40) {
  const box = await locator.boundingBox();
  expect(box, "control should be visible and measurable").not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(min);
  expect(box!.height).toBeGreaterThanOrEqual(min);
}

test("phone Bible and Kidung controls expose comfortable touch targets", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });

  await page.goto("/GYSApp-Tauri/bible");
  await expect(page.getByRole("heading", { name: "Kejadian 1" })).toBeVisible();
  await expectTouchTarget(page.getByRole("button", { name: "Tandai ayat 1" }), 40);
  await expectTouchTarget(
    page.getByRole("button", { name: /rujukan silang untuk Kejadian 1:1/ }),
    40,
  );

  await page.goto("/GYSApp-Tauri/kidung");
  await expect(page.getByRole("heading", { name: "Kidung", exact: true })).toBeVisible();
  await expectTouchTarget(page.locator(".pujian-title").first(), 40);
});

test("phone navigation and compact text actions remain easy to tap", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/GYSApp-Tauri/");
  await expectTouchTarget(page.getByRole("link", { name: "Gereja Yesus Sejati" }), 40);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/GYSApp-Tauri/");
  const seeAll = page.getByRole("link", { name: /Lihat semua/ }).first();
  await expectTouchTarget(seeAll, 40);

  await page.goto("/GYSApp-Tauri/lainnya?section=data");
  await expectTouchTarget(page.getByRole("button", { name: "Periksa versi" }), 40);
});

test("desktop Sauh outage uses a compact recovery state instead of an empty hero", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route("**/wp-json/wp/v2/posts**", (route) =>
    route.fulfill({ status: 503, body: "upstream unavailable" }),
  );
  await page.route("**/api/v1/content/sauh", (route) =>
    route.fulfill({ status: 503, body: "upstream unavailable" }),
  );
  await page.route("**/offline/sauh.json", (route) =>
    route.fulfill({ status: 503, body: "snapshot unavailable" }),
  );

  await page.goto("/GYSApp-Tauri/");
  const state = page.locator(".sauh-offline-state");
  await expect(state).toBeVisible();
  const panel = page.locator(".verse-panel");
  const box = await panel.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeLessThanOrEqual(420);
  await expectTouchTarget(state.getByRole("button", { name: "Coba lagi" }), 40);
});
