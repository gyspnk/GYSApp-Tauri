import { expect, test } from "@playwright/test";

test("migrates legacy notes and keeps multiple notes scoped to the selected verse", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem(
      "gys-bible-notes-v1",
      JSON.stringify({
        "1:1:1": "Legacy note one",
        "1:1:2": "Legacy note two",
      }),
    );
  });
  await page.goto("/GYSApp-Tauri/bible");
  await expect(page.getByRole("heading", { name: /Kejadian 1/ })).toBeVisible({
    timeout: 15_000,
  });

  await page.locator(".verse-text").nth(0).click();
  let toolbar = page.getByRole("toolbar", { name: "Aksi ayat terpilih" });
  await toolbar.getByRole("button", { name: "Catatan ayat" }).click();
  let dialog = page.getByRole("dialog", { name: "Catatan ayat" });
  await expect(dialog.locator(".bible-notes-item")).toHaveCount(1);
  await expect(dialog.locator(".bible-notes-item")).toContainText(
    "Legacy note one",
  );
  await expect(dialog.getByText("Legacy note two")).toHaveCount(0);

  await dialog.getByRole("button", { name: /Tambah catatan/ }).click();
  const noteField = page.getByLabel("Catatan pribadi");
  await expect(noteField).toHaveValue("");
  await noteField.fill("Second thought for this verse.");
  await dialog.getByRole("button", { name: "Simpan catatan" }).click();
  await expect(dialog.locator(".bible-notes-item")).toHaveCount(2);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const notes = JSON.parse(
          localStorage.getItem("gys-bible-notes-v1") ?? "{}",
        ) as Record<string, unknown>;
        return Array.isArray(notes["1:1:1"])
          ? (notes["1:1:1"] as Array<{ text?: string }>).map(
              (note) => note.text,
            )
          : [];
      }),
    )
    .toEqual(["Legacy note one", "Second thought for this verse."]);
  await dialog
    .locator(".bible-notes-item")
    .first()
    .getByRole("button", { name: /Hapus catatan/ })
    .click();
  await expect(dialog.locator(".bible-notes-item")).toHaveCount(1);
  await expect(dialog.locator(".bible-notes-item")).toContainText(
    "Second thought for this verse.",
  );

  await dialog.getByRole("button", { name: "Tutup catatan ayat" }).click();
  await page.locator(".verse-text").nth(1).click();
  toolbar = page.getByRole("toolbar", { name: "Aksi ayat terpilih" });
  await toolbar.getByRole("button", { name: "Catatan ayat" }).click();
  dialog = page.getByRole("dialog", { name: "Catatan ayat" });
  await expect(dialog.locator(".bible-notes-item")).toHaveCount(1);
  await expect(dialog.locator(".bible-notes-item")).toContainText(
    "Legacy note two",
  );
  await expect(dialog.getByText("Legacy note one")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Tutup catatan ayat" }).click();

  await toolbar.getByRole("button", { name: "Tutup ayat terpilih" }).click();
  const selectedToolbar = page.getByTestId("selected-verse-toolbar");
  await expect(
    page.locator(".selected-verse-toolbar.is-exiting"),
  ).toBeVisible();
  await expect(selectedToolbar).toHaveCount(0);
});

test("custom Bible highlights can be cleared and persist in the palette", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/GYSApp-Tauri/bible");
  await expect(page.getByRole("heading", { name: /Kejadian 1/ })).toBeVisible({
    timeout: 15_000,
  });
  const verse = page.locator(".verse-row").nth(0);
  await page.locator(".verse-text").nth(0).click();
  const toolbar = page.getByRole("toolbar", { name: "Aksi ayat terpilih" });
  const touchTargetControls = toolbar.locator("button, input[type='color']");
  await expect
    .poll(async () => {
      const sizes = await touchTargetControls.evaluateAll((elements) =>
        elements.map((element) => {
          const { width, height } = element.getBoundingClientRect();
          return Math.min(width, height);
        }),
      );
      return Math.min(...sizes);
    })
    .toBeGreaterThanOrEqual(44);
  const touchTargets = await touchTargetControls.evaluateAll((elements) =>
    elements.map((element) => {
      const { width, height } = element.getBoundingClientRect();
      return { width, height };
    }),
  );
  expect(touchTargets.length).toBeGreaterThan(0);
  for (const target of touchTargets) {
    expect(target.width).toBeGreaterThanOrEqual(44);
    expect(target.height).toBeGreaterThanOrEqual(44);
  }
  const blue = toolbar.getByRole("button", { name: "Sorot biru" });
  await blue.click();
  await expect(verse).toHaveClass(/is-highlight-blue/);
  await toolbar.getByRole("button", { name: "Hapus sorot biru" }).click();
  await expect(verse).not.toHaveClass(/is-highlight/);

  await toolbar.getByLabel("Warna khusus sorotan").evaluate((element) => {
    const input = element as HTMLInputElement;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(input, "#ca7231");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(verse).toHaveClass(/is-highlight-custom/);
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(
          localStorage.getItem("gys-bible-highlight-palette-v1") ?? "[]",
        ),
      ),
    )
    .toContain("#ca7231");

  await page.reload();
  await expect(page.getByRole("heading", { name: /Kejadian 1/ })).toBeVisible({
    timeout: 15_000,
  });
  const restoredVerse = page.locator(".verse-row").nth(0);
  await expect(restoredVerse).toHaveClass(/is-highlight-custom/);
  await expect
    .poll(() =>
      restoredVerse.evaluate((element) =>
        getComputedStyle(element).getPropertyValue("--verse-highlight-color"),
      ),
    )
    .toBe("#ca7231");
});
