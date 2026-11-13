import { expect, test } from "@playwright/test";

// The catalogue's mode button used to be named after the mode it was already
// in, so a screen reader announced "Teks, not pressed" on the control that
// opens the score. The name now states the action.
test("the catalogue mode button is named for what pressing it does", async ({
  page,
}) => {
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/GYSApp-Tauri/kidung");

  const mode = page.locator(".kidung-mode-cycle");
  await expect(mode).toBeVisible();
  await expect(mode).toHaveAttribute("aria-pressed", "false");
  await expect(mode).toHaveAccessibleName("Tampilkan partitur");

  await mode.click();
  await expect(mode).toHaveAttribute("aria-pressed", "true");
  await expect(mode).toHaveAccessibleName("Tampilkan teks");

  // The group keeps the mode's own name, so the pair reads as one control.
  await expect(
    page.getByRole("group", { name: "Mode tampilan kidung" }),
  ).toBeVisible();
});
