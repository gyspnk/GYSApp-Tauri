import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { preparePinnedReaderAssets } from "./pinned-reader-fixtures.js";

for (const width of [320, 390, 1440]) {
  test(`Kidung PDF is a catalog mode and closes straight to the list (${width}px)`, async ({
    page,
  }) => {
    await preparePinnedReaderAssets(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/GYSApp-Tauri/kidung");
    expect(
      await page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue("--blue")
          .trim(),
      ),
    ).toBe("#0079a8");
    await expect(page.locator(".nav-copy small")).toHaveCount(0);
    const modes = page.getByRole("group", { name: "Mode tampilan kidung" });
    await expect(
      modes.getByRole("button", { name: "Teks", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
    await modes.getByRole("button", { name: "Teks", exact: true }).click();
    await expect(
      modes.getByRole("button", { name: "Partitur", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    const row = page.locator(".pujian-title").first();
    await row.click();
    await expect(page).not.toHaveURL(/mode=/);
    await expect(page.locator(".pdf-reader")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".lyrics-sheet")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Pujian berikutnya", exact: true })
      .click();
    await expect(page).toHaveURL(/hymn-002$/);
    await expect(page.locator(".pdf-reader")).toBeVisible({ timeout: 30_000 });
    await page
      .getByRole("button", { name: "← Semua kidung", exact: true })
      .click();
    await expect(page).toHaveURL(/\/kidung$/);
    await expect(row).toBeVisible();
    await expect(page.locator(".lyrics-sheet")).toHaveCount(0);
    await modes.getByRole("button", { name: "Partitur", exact: true }).click();
    await row.click();
    await expect(page).not.toHaveURL(/mode=/);
    await expect(page.locator(".lyrics-sheet")).toBeVisible();
    await expect(page.locator(".pdf-reader")).toHaveCount(0);
  });

  test(`all ten complete faith statements are readable on the page (${width}px)`, async ({
    page,
  }) => {
    const pack = JSON.parse(
      await readFile(
        new URL("../public/offline/faith.json", import.meta.url),
        "utf8",
      ),
    );
    const items = pack.faith.find(
      (group: { language: string }) => group.language === "ID",
    ).content;
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/GYSApp-Tauri/iman");
    const rows = page.locator(".faith-statement");
    await expect(rows).toHaveCount(10);
    for (let index = 0; index < items.length; index++) {
      await expect(rows.nth(index)).toHaveText(items[index].text);
      expect(
        await rows.nth(index).evaluate((node) => ({
          tag: node.tagName,
          interactive: Boolean(node.closest("button")),
          clipped: node.scrollHeight > node.clientHeight + 1,
        })),
      ).toEqual({ tag: "P", interactive: false, clipped: false });
      await rows.nth(index).scrollIntoViewIfNeeded();
      const bounds = (await rows.nth(index).boundingBox())!;
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      expect(
        await rows
          .nth(index)
          .evaluate((node) => getComputedStyle(node).whiteSpace),
      ).toBe("normal");
    }
  });
}
