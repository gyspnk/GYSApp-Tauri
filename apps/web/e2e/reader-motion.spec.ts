import { expect, test } from "@playwright/test";
import { preparePinnedReaderAssets } from "./pinned-reader-fixtures.js";

test("chord toggle preserves lyrics and animates row spacing in both directions", async ({
  page,
}) => {
  await preparePinnedReaderAssets(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=lyrics");
  await page
    .getByRole("button", { name: "Tampilkan chord", exact: true })
    .click();
  const line = page.locator(".chord-rich-line").first();
  await expect(line).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(() => line.evaluate((el) => el.getAnimations().length))
    .toBe(0);
  await line.evaluate((el) =>
    el.setAttribute("data-motion-probe", "preserved"),
  );
  await page
    .getByRole("button", { name: "Sembunyikan chord", exact: true })
    .click();
  await expect(line).toHaveAttribute("data-motion-probe", "preserved");
  await expect
    .poll(() =>
      line.evaluate((el) => parseFloat(getComputedStyle(el).paddingTop)),
    )
    .toBe(0);
  await expect(page.locator(".chord-capability.is-hidden")).toHaveCount(4);
  await page
    .getByRole("button", { name: "Tampilkan chord", exact: true })
    .click();
  const movement = await line.evaluate((el) => ({
    padding: parseFloat(getComputedStyle(el).paddingTop),
    animations: el.getAnimations().length,
    font: parseFloat(getComputedStyle(el).fontSize),
  }));
  expect(movement.animations).toBeGreaterThan(0);
  expect(movement.padding).toBeLessThan(movement.font);
  await expect
    .poll(() =>
      line.evaluate((el) => parseFloat(getComputedStyle(el).paddingTop)),
    )
    .toBeGreaterThan(15);
});

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`verse and hymn navigation remain usable with motion ${reducedMotion}`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=lyrics");
    await page
      .getByRole("button", { name: "Bait berikutnya", exact: true })
      .click();
    await expect(page.locator(".lyrics-sheet")).toHaveAttribute(
      "aria-label",
      /bait 2$/,
    );
    await page
      .getByRole("button", { name: "Bait sebelumnya", exact: true })
      .click();
    await expect(page.locator(".lyrics-sheet")).toHaveAttribute(
      "aria-label",
      /bait 1$/,
    );
    await page.getByRole("button", { name: "Berikutnya", exact: true }).click();
    await expect(page).toHaveURL(/hymn-002/);
    await expect(page.locator(".lyrics-sheet")).toBeVisible();
  });
}
