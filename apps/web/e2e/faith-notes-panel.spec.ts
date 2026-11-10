import { expect, test } from "@playwright/test";
/** The panel animates in; geometry is only meaningful once it settles. */
async function settled(panel: import("@playwright/test").Locator) {
  await panel.evaluate(async (element) => {
    await Promise.all(
      element.getAnimations().map((animation) => animation.finished),
    );
  });
}

/**
 * Faith notes follow the artifact: a bottom sheet on a phone and a right-hand
 * panel on a wide screen, with the list behind it inert while it is open.
 */
test.beforeEach(async ({ page }) => {
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/GYSApp-Tauri/iman");
  await expect(page.locator(".faith-row-summary").first()).toBeVisible({
    timeout: 30_000,
  });
});

test("phone notes rise from the bottom edge", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".faith-row-summary").first().click();
  await page.getByRole("button", { name: /^Catatan pribadi/ }).click();

  const panel = page.locator(".faith-notes .bible-notes-modal");
  await expect(panel).toBeVisible();
  await settled(panel);
  const box = await panel.boundingBox();
  const stage = await page
    .locator(".faith-notes.bible-notes-backdrop")
    .boundingBox();
  expect(box).not.toBeNull();
  expect(stage).not.toBeNull();
  expect(
    Math.abs(box!.y + box!.height - (stage!.y + stage!.height)),
  ).toBeLessThanOrEqual(1);
  expect(Math.abs(box!.x)).toBeLessThanOrEqual(1);
  await expect(page.locator(".faith-page")).toHaveAttribute("inert", "");
});

test("wide screens dock the note panel on the right", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator(".faith-row-summary").first().click();
  await page.getByRole("button", { name: /^Catatan pribadi/ }).click();

  const panel = page.locator(".faith-notes .bible-notes-modal");
  await expect(panel).toBeVisible();
  await settled(panel);
  const box = await panel.boundingBox();
  const stage = await page
    .locator(".faith-notes.bible-notes-backdrop")
    .boundingBox();
  expect(box).not.toBeNull();
  expect(stage).not.toBeNull();
  // The stage is a fixed layer, so it stops at the layout viewport edge and the
  // panel has to reach that edge, not the window width.
  expect(
    Math.abs(box!.x + box!.width - (stage!.x + stage!.width)),
  ).toBeLessThanOrEqual(1);
  expect(box!.width).toBeLessThanOrEqual(480);
  expect(Math.abs(box!.height - stage!.height)).toBeLessThanOrEqual(1);
});
