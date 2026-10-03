import { expect, test } from "@playwright/test";

for (const width of [390, 768, 1440]) {
  test(`viewer MIDI toggle closes playing audio and reopens the player at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=lyrics");
    const toggle = page.locator(".hymn-midi-toggle");
    const player = page.locator(".media-surface.is-kidung-media");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(player).toHaveCount(0);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(player).toBeVisible({ timeout: 30_000 });
    await player.getByRole("button", { name: "Putar", exact: true }).click();
    await expect(
      player.getByRole("button", { name: "Jeda", exact: true }),
    ).toBeVisible({ timeout: 30_000 });
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(player).toHaveCount(0);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(player).toBeVisible();
    await expect(
      player.getByRole("button", { name: "Putar", exact: true }),
    ).toBeVisible();
    await toggle.click();
    await expect(player).toHaveCount(0);
  });
}
