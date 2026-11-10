import { expect, test } from "@playwright/test";

const PLAYLIST = "/GYSApp-Tauri/kidung?section=playlist";

async function importPlaylist(page: import("@playwright/test").Page) {
  await page.goto(PLAYLIST);
  await expect(
    page.getByRole("heading", { name: "Antrean MIDI", exact: true }),
  ).toBeVisible();
  await page
    .locator(".kidung-tool-heading-actions input[type=file]")
    .setInputFiles({
      name: "confirm-delete.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          name: "Hapus Nanti",
          songs: [
            {
              nomor: "001",
              judul: "Pujilah Allah Yang Maha Esa",
              fileHref: "docs/assets/001.mid",
            },
          ],
          exportedAt: "2026-10-10T00:00:00.000Z",
        }),
      ),
    });
  const row = page.locator(".kidung-saved-playlist-row", {
    has: page.getByText("Hapus Nanti (Imported)", { exact: true }),
  });
  await expect(row).toBeVisible();
  return row;
}

test.beforeEach(async ({ page }) => {
  await page.route(/^https:\/\//, (route) => route.abort());
});

test("deleting a saved playlist asks first and Esc keeps it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const row = await importPlaylist(page);
  const remove = row.locator(".kidung-danger-action", {
    hasText: /^Hapus playlist$/,
  });

  await row.locator("details.kidung-row-menu > summary").first().click();
  await remove.click();

  const dialog = page.getByRole("dialog", { name: "Hapus playlist?" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("tidak bisa dibatalkan");
  const cancel = dialog.getByRole("button", { name: "Batal", exact: true });
  const confirm = dialog.getByRole("button", {
    name: "Hapus playlist",
    exact: true,
  });
  await expect(cancel).toBeFocused();
  await expect(confirm).toHaveCSS("background-color", "rgb(179, 38, 30)");
  // The dialog rises with an entrance animation; a box sampled mid-way reports
  // 43.995 px. Measure the settled layout, then hold the 44 px target strictly.
  await dialog.evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished)),
  );
  const box = (await confirm.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(row).toBeVisible();

  await row.locator("details.kidung-row-menu > summary").first().click();
  await remove.click();
  await page
    .getByRole("dialog", { name: "Hapus playlist?" })
    .getByRole("button", { name: "Hapus playlist", exact: true })
    .click();
  await expect(row).toBeHidden();
});
