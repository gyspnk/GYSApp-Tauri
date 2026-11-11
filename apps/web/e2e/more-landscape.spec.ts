import { expect, test } from "@playwright/test";

// A landscape phone has width but no height: one wide column left half the
// window empty and stretched every panel past a readable line length.
for (const viewport of [
  { width: 844, height: 390 },
  { width: 1024, height: 600 },
]) {
  test(`settings use both columns in landscape at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.route(/^https:\/\//, (route) => route.abort());
    await page.goto("/GYSApp-Tauri/lainnya?section=account");

    const list = page.locator(".more-settings-list");
    await expect(list).toBeVisible();
    const count = await list.evaluate(
      (node) => getComputedStyle(node).gridTemplateColumns.split(" ").length,
    );
    expect(count, "the settings list fills the width it has").toBe(2);

    // An open panel carries a form or a paragraph, so it takes the whole width
    // instead of wrapping inside half of it.
    const account = page.locator('[data-setting="account"]');
    const listBox = (await list.boundingBox())!;
    const accountBox = (await account.boundingBox())!;
    expect(accountBox.width).toBeGreaterThanOrEqual(listBox.width - 1);

    // Tightening for a short window must never shrink a target below 44 px.
    for (const row of await page.locator(".more-setting-row").all()) {
      expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  });
}
