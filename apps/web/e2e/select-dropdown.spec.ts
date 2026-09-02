import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test("topbar theme and select dropdowns stay within viewport without right cutoff", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/GYSApp-Tauri/");

  // Click the theme select button in topbar
  const themeTrigger = page.locator(
    ".topbar-select.theme-select .control-select-trigger",
  );
  await expect(themeTrigger).toBeVisible({ timeout: 10_000 });
  await themeTrigger.click();

  const menu = page.locator(".control-select-menu").first();
  await expect(menu).toBeVisible();

  const menuBox = await menu.boundingBox();
  expect(menuBox).not.toBeNull();
  if (menuBox) {
    // Menu must not overflow right edge of viewport
    expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(1024 + 1);
    // Menu must be anchored cleanly
    expect(menuBox.x).toBeGreaterThanOrEqual(0);
  }

  // Click an option (e.g. Terang) to close
  const lightOption = page.getByRole("option", { name: "Terang" });
  await lightOption.click();
  await expect(menu).toHaveCount(0);
});
