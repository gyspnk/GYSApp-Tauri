import { expect, test } from "@playwright/test";

const openReader = async (page: import("@playwright/test").Page) => {
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.addInitScript(() => {
    localStorage.setItem("gys-bible-book", "1");
    localStorage.setItem("gys-bible-chapter", "1");
  });
  await page.goto("/GYSApp-Tauri/alkitab");
  await expect(page.locator(".verse-text").first()).toBeVisible({
    timeout: 45_000,
  });
};

test.describe("Bible multi-verse selection", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("selects several verses, highlights them together and saves one combined note", async ({
    page,
  }) => {
    await openReader(page);
    const verses = page.locator(".verse-text");
    const toolbar = page.getByTestId("selected-verse-toolbar");
    const label = toolbar.locator(".selected-verse-context strong");

    await verses.nth(0).click();
    await expect(toolbar).toBeVisible();
    await expect(label).toHaveText(/Kejadian 1:1/);

    await toolbar.getByRole("button", { name: "Pilih banyak ayat" }).click();
    await verses.nth(1).click();
    await expect(label).toHaveText("2 ayat dipilih");
    await verses.nth(2).click();
    await expect(label).toHaveText("3 ayat dipilih");
    await expect(page.locator(".verse-row.is-selected")).toHaveCount(3);

    await verses.nth(2).click();
    await expect(label).toHaveText("2 ayat dipilih");

    await toolbar.locator(".highlight-dot").first().click();
    await expect(page.locator(".verse-row.is-highlight-yellow")).toHaveCount(2);
    const highlights = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("gys-bible-highlights-v1") ?? "{}"),
    );
    expect(Object.keys(highlights)).toEqual(
      expect.arrayContaining(["1:1:1", "1:1:2"]),
    );

    await toolbar.getByRole("button", { name: "Catatan" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Kejadian 1:1–2");
    await expect(dialog).toContainText(
      "Catatan ini tersimpan untuk 2 ayat yang dipilih.",
    );
    await dialog.locator("textarea").fill("Catatan gabungan dua ayat");
    await dialog.getByRole("button", { name: /Simpan/ }).click();

    const notes = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("gys-bible-notes-v1") ?? "{}"),
    );
    expect(notes["1:1:1"]?.[0]?.text).toBe("Catatan gabungan dua ayat");
    expect(notes["1:1:2"]?.[0]?.text).toBe("Catatan gabungan dua ayat");
    expect(notes["1:1:1"]?.[0]?.id).toBe(notes["1:1:2"]?.[0]?.id);
    expect(notes["1:1:3"]).toBeUndefined();
  });

  test("clears the multi-select after a reload", async ({ page }) => {
    await openReader(page);
    const verses = page.locator(".verse-text");
    const toolbar = page.getByTestId("selected-verse-toolbar");
    await verses.nth(0).click();
    await toolbar.getByRole("button", { name: "Pilih banyak ayat" }).click();
    await verses.nth(1).click();
    await expect(toolbar.locator(".selected-verse-context strong")).toHaveText(
      "2 ayat dipilih",
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator(".verse-text").first()).toBeVisible({
      timeout: 45_000,
    });
    await expect(toolbar).toBeHidden();
    await expect(page.locator(".verse-row.is-selected")).toHaveCount(0);
  });
});
