import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.use({ hasTouch: true });

async function openPicker(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("gys-bible-book", "43");
    localStorage.setItem("gys-bible-chapter", "12");
    localStorage.setItem(
      "gys-shell-settings-v1",
      JSON.stringify({ version: 1, locale: "id", theme: "light" }),
    );
  });
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/GYSApp-Tauri/bible");
  await page.locator(".reader-context-book-picker").tap();
  const dialog = page.getByRole("dialog", { name: "Pilih Kitab & Pasal" });
  await expect(dialog).toBeVisible();
  return dialog;
}

for (const width of [320, 390, 768, 1440]) {
  test(`Bible keypad edits a draft and opens numbers on the second tap at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 780 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const dialog = await openPicker(page);
    const chapter = dialog.getByRole("combobox", {
      name: "Pasal",
      exact: true,
    });
    const verse = dialog.getByRole("combobox", { name: "Ayat", exact: true });
    const pad = dialog.getByRole("group", { name: "Numpad pasal dan ayat" });
    const open = dialog.getByRole("button", { name: "Buka ayat", exact: true });
    await expect(chapter).toBeFocused();
    await expect(chapter).toHaveText("12");
    await expect(dialog.locator("input")).toHaveCount(0);
    await chapter.tap();
    await expect(chapter).toHaveAttribute("aria-expanded", "false");
    await expect(chapter).toHaveText("12");
    await pad.getByRole("button", { name: "3", exact: true }).tap();
    await expect(chapter).toHaveText("3");
    await pad.getByRole("button", { name: "1", exact: true }).tap();
    await expect(chapter).toHaveText("31");
    await expect(chapter).toHaveAttribute("aria-invalid", "true");
    await expect(open).toBeDisabled();
    await pad.getByRole("button", { name: "Hapus angka", exact: true }).tap();
    await expect(chapter).toHaveText("3");
    await verse.tap();
    await expect(verse).toHaveAttribute("aria-expanded", "false");
    for (const digit of ["1", "6"])
      await pad.getByRole("button", { name: digit, exact: true }).tap();
    await expect(verse).toHaveText("16");
    await verse.tap();
    await expect(verse).toHaveAttribute("aria-expanded", "true");
    await expect(dialog.getByRole("option")).toHaveCount(36);
    await dialog.getByRole("option", { name: "18", exact: true }).tap();
    await expect(verse).toHaveText("18");
    await expect(dialog.locator(".bible-address-menu")).toHaveCount(0);
    await expect(dialog).toBeVisible();
    expect(
      await page.evaluate(() => [
        localStorage.getItem("gys-bible-book"),
        localStorage.getItem("gys-bible-chapter"),
      ]),
    ).toEqual(["43", "12"]);
    for (const control of await dialog.locator("button:visible").all()) {
      await expect
        .poll(() => control.boundingBox().then((box) => box?.width ?? 0))
        .toBeGreaterThanOrEqual(43.9);
      await expect
        .poll(() => control.boundingBox().then((box) => box?.height ?? 0))
        .toBeGreaterThanOrEqual(43.9);
    }
    expect(
      (
        await new AxeBuilder({ page })
          .include(".bible-address-picker")
          .withTags(["wcag2a", "wcag2aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await open.tap();
    await expect(dialog).toBeHidden();
    await expect(page.locator(".verse-row.is-selected")).toHaveAttribute(
      "id",
      "bible-verse-43:3:18",
    );
    await expect(page.locator(".reader-context-book-picker")).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    expect(errors).toEqual([]);
  });
}

test("Bible book/verse search, long numeric references and cancelling preserve the reader", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 780 });
  const dialog = await openPicker(page);
  const book = dialog.getByRole("combobox", { name: "Kitab", exact: true });
  const chapter = dialog.getByRole("combobox", { name: "Pasal", exact: true });
  const verse = dialog.getByRole("combobox", { name: "Ayat", exact: true });
  const open = dialog.getByRole("button", { name: "Buka ayat", exact: true });
  await book.tap();
  await expect(book).toHaveAttribute("aria-expanded", "true");
  const search = dialog.getByRole("searchbox", {
    name: "Cari kitab atau isi ayat",
  });
  await search.fill("Mazmur");
  await dialog.getByRole("option", { name: "Mazmur", exact: true }).tap();
  await expect(book).toHaveText("Mazmur");
  await chapter.tap();
  await chapter.pressSequentially("119");
  await verse.tap();
  await verse.pressSequentially("176");
  await expect(open).toBeEnabled();
  await verse.tap();
  await expect(dialog.getByRole("option")).toHaveCount(176);
  const last = dialog.getByRole("option", { name: "176", exact: true });
  await expect(last).toBeInViewport();
  await verse.press("Escape");
  await expect(dialog).toBeVisible();
  await verse.tap();
  await verse.pressSequentially("177");
  await expect(open).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.locator(".reader-context-book-picker").tap();
  await expect(book).toHaveText("Yohanes");
  await expect(chapter).toHaveText("12");
  await book.tap();
  await search.fill("menciptakan langit");
  const match = dialog
    .locator(".bible-picker-verse-item")
    .filter({ hasText: "Kejadian 1:1" })
    .first();
  await expect(match).toBeVisible();
  await search.press("ArrowDown");
  await expect(book).toBeFocused();
  await book.press("Enter");
  await expect(book).toHaveText("Kejadian");
  await expect(dialog).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("gys-bible-book")),
  ).toBe("43");
  await open.tap();
  await expect(page.locator(".verse-row.is-selected")).toHaveAttribute(
    "id",
    "bible-verse-1:1:1",
  );
});

test("Bible keypad and dropdowns fit a short landscape viewport and trap focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 667, height: 375 });
  const dialog = await openPicker(page);
  const chapter = dialog.getByRole("combobox", { name: "Pasal", exact: true });
  await chapter.tap();
  await chapter.tap();
  const list = dialog.getByRole("listbox");
  const box = (await list.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(375);
  await chapter.press("End");
  await chapter.press("Enter");
  await expect(chapter).toHaveText("21");
  const buttons = dialog.locator("button:visible");
  await buttons.last().focus();
  await page.keyboard.press("Tab");
  await expect(buttons.first()).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(buttons.last()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.locator(".reader-context-book-picker")).toBeFocused();
});
