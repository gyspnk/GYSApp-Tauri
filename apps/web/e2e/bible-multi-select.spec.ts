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
    await expect(
      toolbar.locator(".selected-verse-context span").first(),
    ).toHaveText("Kejadian 1:1–3");
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

  test("editing a combined note keeps every linked verse in sync", async ({
    page,
  }) => {
    await openReader(page);
    const verses = page.locator(".verse-text");
    const toolbar = page.getByTestId("selected-verse-toolbar");

    await verses.nth(0).click();
    await toolbar.getByRole("button", { name: "Pilih banyak ayat" }).click();
    await verses.nth(1).click();
    await toolbar.getByRole("button", { name: "Catatan" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("textarea").fill("Versi pertama");
    await dialog.getByRole("button", { name: /Simpan/ }).click();
    await dialog
      .getByRole("button", { name: "Tutup" })
      .click()
      .catch(() => undefined);

    // Open the note again from a single verse and edit it there.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator(".verse-text").first()).toBeVisible({
      timeout: 45_000,
    });
    await page.locator(".verse-text").nth(1).click();
    await page
      .getByTestId("selected-verse-toolbar")
      .getByRole("button", {
        name: "Catatan",
      })
      .click();
    const edit = page.getByRole("dialog");
    await edit.getByRole("button", { name: /Versi pertama/ }).click();
    await edit.locator("textarea").fill("Versi kedua");
    await edit.getByRole("button", { name: /Simpan/ }).click();

    const notes = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("gys-bible-notes-v1") ?? "{}"),
    );
    expect(notes["1:1:1"]?.[0]?.text).toBe("Versi kedua");
    expect(notes["1:1:2"]?.[0]?.text).toBe("Versi kedua");
    expect(notes["1:1:1"]?.[0]?.id).toBe(notes["1:1:2"]?.[0]?.id);
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
  test("extends the selection to a range with shift-click", async ({
    page,
  }) => {
    await openReader(page);
    const verses = page.locator(".verse-text");
    const toolbar = page.getByTestId("selected-verse-toolbar");
    await verses.nth(0).click();
    await toolbar.getByRole("button", { name: "Pilih banyak ayat" }).click();
    await verses.nth(4).click({ modifiers: ["Shift"] });
    await expect(toolbar.locator(".selected-verse-context strong")).toHaveText(
      "5 ayat dipilih",
    );
    await expect(
      toolbar.locator(".selected-verse-context span").first(),
    ).toHaveText("Kejadian 1:1–5");
    await expect(page.locator(".verse-row.is-selected")).toHaveCount(5);
  });
});
