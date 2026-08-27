import { expect, test } from "@playwright/test";

test("shell navigation and locale switch are usable", async ({ page }) => {
  await page.goto("/GYSApp-Tauri/");
  await expect(page.locator("nav.primary-nav")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "Selamat datang kembali" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Bahasa" }).click();
  await page.getByRole("option", { name: "EN" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  await page.getByRole("link", { name: /Hymns/ }).first().click();
  await expect(page).toHaveURL(/\/kidung$/);
  await expect(
    page.getByRole("heading", { name: "Hymns", exact: true }).first(),
  ).toBeVisible();
});

test("feature-critical hymn actions follow the selected locale", async ({
  page,
}) => {
  await page.goto("/GYSApp-Tauri/kidung");
  await page.getByRole("button", { name: "Bahasa" }).click();
  await page.getByRole("option", { name: "EN" }).click();
  await page.goto("/GYSApp-Tauri/kidung/hymn-001");
  await expect(
    page.getByRole("heading", { name: /Pujilah Allah/ }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Show chords" })).toBeVisible();
  await page.goto("/GYSApp-Tauri/kidung");
  await page.getByRole("button", { name: "Language" }).click();
  await page.getByRole("option", { name: "中文" }).click();
  await page.goto("/GYSApp-Tauri/kidung/hymn-001");
  await expect(page.getByRole("button", { name: "显示和弦" })).toBeVisible();
});

test("compact section headings stay smaller than page and catalog titles", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/GYSApp-Tauri/literatur");
  const sectionHeading = page
    .locator(".literature-featured .section-title-row h2")
    .first();
  await expect(sectionHeading).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(() =>
      sectionHeading.evaluate((node) => getComputedStyle(node).fontSize),
    )
    .toBe("14px");

  await page.setViewportSize({ width: 1440, height: 960 });
  await expect
    .poll(() =>
      sectionHeading.evaluate((node) => getComputedStyle(node).fontSize),
    )
    .toBe("14px");
  await expect
    .poll(() =>
      page
        .locator(".page-intro h1")
        .first()
        .evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize)),
    )
    .toBeGreaterThan(14);
});

test("responsive shell keeps one navigation and no horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/GYSApp-Tauri/");
  await expect(page.locator("nav.primary-nav")).toHaveCount(1);
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await expect(page.getByRole("link", { name: "Beranda" })).toBeVisible();
});

test("shell remains usable across the release viewport matrix", async ({
  page,
}) => {
  for (const viewport of [
    { width: 320, height: 720 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/GYSApp-Tauri/");
    await expect(
      page.getByRole("heading", { name: "Selamat datang kembali" }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("nav.primary-nav")).toHaveCount(1);
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await expect(page.locator(".nav-item").first()).toBeVisible();
  }
});

test("offline reader packs open without a network request", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/GYSApp-Tauri/bible");
  await expect(
    page.getByRole("heading", { name: "Alkitab", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: /Yohanes 3/ })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("link", { name: /Iman/ }).first().click();
  await expect(
    page.getByRole("region", { name: "Dasar Kepercayaan" }),
  ).toBeVisible();
  await expect(page.locator(".faith-row-heading").first()).toBeVisible({
    timeout: 15_000,
  });
});

test.describe("offline Bible recovery", () => {
  test.use({ serviceWorkers: "block" });

  test("Bible reader retries a transient offline-pack failure", async ({
    page,
  }) => {
    let attempts = 0;
    await page.route("**/offline/bible/tb-reader.json", async (route) => {
      attempts += 1;
      if (attempts === 1) {
        await route.fulfill({ status: 503, body: "temporarily unavailable" });
        return;
      }
      await route.continue();
    });

    await page.goto("/GYSApp-Tauri/bible");
    await expect(page.getByRole("alert")).toContainText(
      "Paket Alkitab belum tersedia",
    );
    await page.getByRole("button", { name: "Coba lagi" }).click();
    await expect(page.getByRole("heading", { name: /Yohanes 3/ })).toBeVisible({
      timeout: 15_000,
    });
    expect(attempts).toBeGreaterThanOrEqual(2);
  });
});

test("faith topics search, select, and persist a personal note", async ({
  page,
}) => {
  await page.goto("/GYSApp-Tauri/iman");
  await expect(
    page.getByRole("region", { name: "Dasar Kepercayaan" }),
  ).toBeVisible();
  const rows = page.locator(".faith-row-heading");
  await expect(rows.first()).toBeVisible({ timeout: 15_000 });
  const initialCount = await rows.count();
  expect(initialCount).toBeGreaterThan(0);

  // The vertical list keeps one active selection at a time.
  await rows.nth(1).click();
  await expect(rows.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(rows.first()).toHaveAttribute("aria-pressed", "false");

  // Search filters the list using real content.
  await page.getByLabel("Cari pokok iman").fill("Allah");
  await expect
    .poll(async () => page.locator(".faith-row-heading").count())
    .toBeLessThan(initialCount);

  // A note on the selected topic persists across reloads.
  await page.getByLabel("Cari pokok iman").fill("");
  await page
    .getByRole("dialog", { name: /Pokok/ })
    .getByRole("button", { name: "Catatan pribadi" })
    .click();
  await page
    .getByLabel("Catatan pribadi")
    .fill("Renungan dari pokok dasar kepercayaan.");
  await page.getByRole("button", { name: "Simpan catatan" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "disimpan" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Dasar Kepercayaan" }),
  ).toBeVisible({
    timeout: 15_000,
  });
  // The note is keyed per topic, so reopen the same topic after the reload.
  await page.locator(".faith-row-heading").nth(1).click();
  await page
    .getByRole("dialog", { name: /Pokok/ })
    .getByRole("button", { name: "Catatan pribadi" })
    .click();
  await expect(page.getByLabel("Catatan pribadi")).toHaveValue(
    "Renungan dari pokok dasar kepercayaan.",
  );
});

test("offline pack manager keeps one update action and reports manifest status", async ({
  page,
}) => {
  await page.goto("/GYSApp-Tauri/lainnya?section=data");
  await expect(
    page.getByRole("heading", { name: "Paket lokal", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /Verifikasi & simpan paket|Unduh .* pembaruan/,
    }),
  ).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Periksa versi" })).toHaveCount(
    1,
  );
  await expect(page.locator(".pack-manager-actions button")).toHaveCount(2);
  await expect(page.locator(".pack-manager-actions small")).toContainText(
    /Manifest v1/,
  );
});

test("Bible reader keeps search, split reading, and verse annotations local", async ({
  page,
}) => {
  await page.goto("/GYSApp-Tauri/bible");
  await expect(page.getByRole("heading", { name: /Yohanes 3/ })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByLabel("Cari Alkitab").fill("begitu besar");
  await page.getByLabel("Frasa tepat").check();
  await page.getByRole("button", { name: "Cari", exact: true }).click();
  await expect(page.locator(".result-item").first()).toBeVisible();
  await page.getByRole("button", { name: "Dua kolom" }).click();
  await expect(page.locator(".bible-pane")).toHaveCount(2);
  const splitDivider = page.getByRole("separator", {
    name: "Atur lebar kolom bacaan",
  });
  await splitDivider.focus();
  await splitDivider.press("ArrowRight");
  await expect(splitDivider).toHaveAttribute("aria-valuenow", "52");
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("gys-bible-split-ratio-v1")),
    )
    .toBe("52");
  await page
    .getByRole("button", { name: /Karena begitu besar kasih Allah/ })
    .first()
    .click();
  await page.getByRole("button", { name: /Buka catatan ayat/ }).click();
  await expect(page.getByLabel("Catatan pribadi")).toBeVisible();
  await page
    .getByLabel("Catatan pribadi")
    .fill("Kasih Tuhan menjadi dasar pengharapan.");
  await page.getByRole("button", { name: "Simpan catatan" }).click();
  await page.getByRole("button", { name: "Tutup catatan ayat" }).click();
  await page.getByRole("button", { name: "Sorot blue" }).click();
  await expect(page.locator(".verse-row.is-highlight-blue")).toHaveCount(1);
});
test("Bible search narrows results to a testament", async ({ page }) => {
  await page.goto("/GYSApp-Tauri/bible");
  await expect(page.getByRole("heading", { name: /Yohanes 3/ })).toBeVisible({
    timeout: 15_000,
  });
  await page
    .getByRole("button", { name: "Buka pencarian ayat di Alkitab" })
    .click();
  const searchBook = page.locator(
    ".bible-search-options .control-select-trigger",
  );
  await searchBook.click();
  await page.getByRole("option", { name: "Perjanjian Lama (39)" }).click();
  await page.getByLabel("Cari Alkitab").fill("Allah");
  await page.getByRole("button", { name: "Cari", exact: true }).click();
  await expect(page.locator(".result-item").first()).toBeVisible({
    timeout: 15_000,
  });
  await expect
    .poll(() =>
      page
        .locator(".result-item strong")
        .allTextContents()
        .then((texts) => ({
          hasOldTestament: texts.some((text) => text.startsWith("Kejadian ")),
          hasNewTestament: texts.some((text) => text.startsWith("Yohanes ")),
        })),
    )
    .toEqual({ hasOldTestament: true, hasNewTestament: false });

  await searchBook.click();
  await page.getByRole("option", { name: "Perjanjian Baru (27)" }).click();
  await page.getByRole("button", { name: "Cari", exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator(".result-item strong")
        .allTextContents()
        .then((texts) => ({
          hasOldTestament: texts.some((text) => text.startsWith("Kejadian ")),
          hasNewTestament: texts.some((text) => text.startsWith("Matius ")),
        })),
    )
    .toEqual({ hasOldTestament: false, hasNewTestament: true });
});

test("Bible search matches book names from the offline pack", async ({
  page,
}) => {
  await page.goto("/GYSApp-Tauri/bible");
  await expect(page.getByRole("heading", { name: /Yohanes 3/ })).toBeVisible({
    timeout: 15_000,
  });
  // A bare book name must surface verses from that book even though other
  // books also mention the name in their verse text (Matius 3:1 begins with
  // "Yohanes Pembaptis"); the book-name index entry is what makes the book of
  // Yohanes itself appear.
  await page.getByLabel("Cari Alkitab").fill("Yohanes");
  await page.getByRole("button", { name: "Cari", exact: true }).click();
  const results = page.locator(".result-item");
  await expect(results.first()).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(() =>
      page
        .locator(".result-item strong")
        .allTextContents()
        .then((texts) => texts.some((text) => text.startsWith("Yohanes "))),
    )
    .toBe(true);
  // AND matching combines the book name with verse text.
  await page.getByLabel("Cari Alkitab").fill("Yohanes kasih");
  await page.getByRole("button", { name: "Cari", exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator(".result-item strong")
        .allTextContents()
        .then((texts) => texts.some((text) => text.startsWith("Yohanes "))),
    )
    .toBe(true);
});

test("Bible reader typography persists across reloads", async ({ page }) => {
  await page.goto("/GYSApp-Tauri/bible");
  await expect(page.getByRole("heading", { name: /Yohanes 3/ })).toBeVisible({
    timeout: 15_000,
  });
  const verseText = page.locator(".verse-text").first();
  const initialSize = Number(
    await verseText.evaluate((element) =>
      getComputedStyle(element).fontSize.replace("px", ""),
    ),
  );
  const typoToggle = page.getByRole("button", { name: "Ukuran teks bacaan" });
  if (await typoToggle.isVisible()) {
    await typoToggle.click();
  }
  await page.getByRole("button", { name: "Perbesar teks" }).click();
  await page.getByRole("button", { name: "Perbesar teks" }).click();
  await expect
    .poll(() =>
      verseText.evaluate((element) =>
        Number(getComputedStyle(element).fontSize.replace("px", "")),
      ),
    )
    .toBe(initialSize + 2);
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("gys-bible-typography-v1")),
    )
    .toContain(String(initialSize + 2));
  // The preference survives a full reload.
  await page.reload();
  await expect(page.getByRole("heading", { name: /Yohanes 3/ })).toBeVisible({
    timeout: 15_000,
  });
  if (await typoToggle.isVisible()) {
    await typoToggle.click();
  }
  await expect
    .poll(() =>
      page
        .locator(".verse-text")
        .first()
        .evaluate((element) =>
          Number(getComputedStyle(element).fontSize.replace("px", "")),
        ),
    )
    .toBe(initialSize + 2);
  // The bounded controls expose their state and stay keyboard-usable.
  await expect(
    page.getByRole("group", { name: "Ukuran teks bacaan" }),
  ).toBeVisible();
});

test("Bible title drag advances through book, chapter, and verse before commit", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/GYSApp-Tauri/bible");
  await expect(page.getByRole("heading", { name: /Yohanes 3/ })).toBeVisible({
    timeout: 15_000,
  });
  const handle = page.locator(".quick-nav-handle");
  const box = await handle.boundingBox();
  if (!box) throw new Error("Bible quick navigation handle is not measurable");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 8, box.y + box.height / 2);
  await expect(page.locator(".quick-nav-floater")).toBeVisible();
  const fieldBox = await page
    .locator(".quick-nav-columns-container")
    .boundingBox();
  expect(fieldBox).not.toBeNull();
  expect(fieldBox!.height).toBeGreaterThan(500);
  await expect(page.locator(".quick-nav-multistep")).toHaveAttribute(
    "data-step",
    "book",
  );
  const matthew = page.locator('[data-quick-nav-value="40"]');
  const matthewBox = await matthew.boundingBox();
  if (!matthewBox) throw new Error("Quick navigation book is not measurable");
  await page.mouse.move(
    matthewBox.x + matthewBox.width / 2,
    matthewBox.y + matthewBox.height / 2,
  );
  await expect(matthew).toHaveClass(/is-selected/);
  await page.waitForTimeout(600);
  const mark = page.locator('[data-quick-nav-value="41"]');
  const markBox = await mark.boundingBox();
  if (!markBox) throw new Error("Quick navigation book is not measurable");
  await page.mouse.move(
    markBox.x + markBox.width / 2,
    markBox.y + markBox.height / 2,
  );
  await page.waitForTimeout(600);
  await expect(page.locator(".quick-nav-multistep")).toHaveAttribute(
    "data-step",
    "book",
  );
  await page.mouse.move(
    matthewBox.x + matthewBox.width / 2,
    matthewBox.y + matthewBox.height / 2,
  );
  await page.waitForTimeout(1_100);
  await expect(page.locator(".quick-nav-multistep")).toHaveAttribute(
    "data-step",
    "chapter",
  );
  const chapterFive = page.locator('[data-quick-nav-value="5"]');
  const chapterBox = await chapterFive.boundingBox();
  if (!chapterBox)
    throw new Error("Quick navigation chapter is not measurable");
  await page.mouse.move(
    chapterBox.x + chapterBox.width / 2,
    chapterBox.y + chapterBox.height / 2,
  );
  await expect(chapterFive).toHaveClass(/is-selected/);
  await page.waitForTimeout(1_100);
  await expect(page.locator(".quick-nav-multistep")).toHaveAttribute(
    "data-step",
    "verse",
  );
  const verseThree = page.locator('[data-quick-nav-value="3"]');
  const verseBox = await verseThree.boundingBox();
  if (!verseBox) throw new Error("Quick navigation verse is not measurable");
  await page.mouse.move(
    verseBox.x + verseBox.width / 2,
    verseBox.y + verseBox.height / 2,
  );
  await expect(verseThree).toHaveClass(/is-selected/);
  await page.mouse.up();
  await expect(
    page.getByRole("dialog", { name: "Pilih Kitab & Pasal" }),
  ).toBeHidden();
  await expect(page.getByRole("heading", { name: /Matius 5/ })).toBeVisible();
  await expect(page.locator(".verse-row.is-selected")).toContainText(
    "Berbahagialah",
  );
  await handle.focus();
  await handle.press("ArrowDown");
  await expect(page.getByRole("heading", { name: /Matius 6/ })).toBeVisible();
});

test("Bible drag release defaults incomplete book and chapter choices to verse one", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/GYSApp-Tauri/bible");
  await expect(page.getByRole("heading", { name: /Yohanes 3/ })).toBeVisible({
    timeout: 15_000,
  });

  const dragTo = async (value: number) => {
    const handle = page.locator(".quick-nav-handle");
    const handleBox = await handle.boundingBox();
    if (!handleBox)
      throw new Error("Bible quick navigation handle is not measurable");
    await page.mouse.move(
      handleBox.x + handleBox.width / 2,
      handleBox.y + handleBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      handleBox.x + handleBox.width / 2 + 16,
      handleBox.y + handleBox.height / 2,
    );
    await expect(page.locator(".quick-nav-floater")).toBeVisible();
    const item = page.locator(`[data-quick-nav-value="${value}"]`);
    const itemBox = await item.boundingBox();
    if (!itemBox) throw new Error("Quick navigation item is not measurable");
    await page.mouse.move(
      itemBox.x + itemBox.width / 2,
      itemBox.y + itemBox.height / 2,
    );
  };

  await dragTo(40);
  await page.mouse.up();
  await expect(page.getByRole("heading", { name: /Matius 1/ })).toBeVisible();
  await expect(page.locator(".verse-row.is-selected")).toContainText(
    "silsilah",
  );

  await dragTo(40);
  await page.waitForTimeout(1_100);
  await expect(page.locator(".quick-nav-multistep")).toHaveAttribute(
    "data-step",
    "chapter",
  );
  const chapterFive = page.locator('[data-quick-nav-value="5"]');
  const chapterBox = await chapterFive.boundingBox();
  if (!chapterBox)
    throw new Error("Quick navigation chapter is not measurable");
  await page.mouse.move(
    chapterBox.x + chapterBox.width / 2,
    chapterBox.y + chapterBox.height / 2,
  );
  await page.mouse.up();
  await expect(page.getByRole("heading", { name: /Matius 5/ })).toBeVisible();
  await expect(page.locator(".verse-row.is-selected")).toContainText(
    "Ketika Yesus melihat orang banyak",
  );
  await expect(
    page.getByRole("dialog", { name: "Pilih Kitab & Pasal" }),
  ).toBeHidden();
});

test("Bible text selection exposes contextual copy/share/note actions", async ({
  page,
}) => {
  await page.goto("/GYSApp-Tauri/bible");
  await expect(page.getByRole("heading", { name: /Yohanes 3/ })).toBeVisible({
    timeout: 15_000,
  });
  await page.evaluate(() => {
    const node = document.querySelector(".verse-text");
    if (!node) throw new Error("Verse text is not rendered");
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await expect(
    page.getByRole("toolbar", { name: "Tindakan teks terpilih" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Catat", exact: true }).click();
  await page
    .getByRole("toolbar", { name: "Aksi ayat terpilih" })
    .getByRole("button", { name: "Catatan", exact: true })
    .click();
  await expect(page.getByLabel("Catatan pribadi")).toBeVisible();
});

test("selected Bible verse exposes a floating bottom action toolbar", async ({
  page,
}) => {
  await page.goto("/GYSApp-Tauri/bible");
  await expect(page.getByRole("heading", { name: /Yohanes 3/ })).toBeVisible({
    timeout: 15_000,
  });
  await page
    .getByRole("button", { name: /Adalah seorang Farisi yang bernama/ })
    .click();

  const toolbar = page.getByRole("toolbar", { name: "Aksi ayat terpilih" });
  await expect(toolbar).toBeVisible();
  await expect(toolbar).toHaveCSS("position", "fixed");
  await expect(toolbar).toContainText("Yohanes 3:1");
});

test("Bible header and selected verse toolbar stay adaptive on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/GYSApp-Tauri/bible");
  await expect(
    page.getByRole("heading", { name: "Alkitab", exact: true }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".bible-search")).toBeVisible();
  await expect(page.locator(".quick-nav-handle")).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.getByText(
      "Buka bacaan terakhir atau cari ayat di seluruh Alkitab TB.",
    ),
  ).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);

  await page
    .getByRole("button", { name: /Adalah seorang Farisi yang bernama/ })
    .dispatchEvent("click");
  const toolbar = page.getByRole("toolbar", { name: "Aksi ayat terpilih" });
  await expect(toolbar).toBeVisible();
  const bounds = await toolbar.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds?.x).toBeGreaterThanOrEqual(0);
  expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(390);
  expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThanOrEqual(844);
});

test("home uses Sauh for the daily verse and keeps one continue surface", async ({
  page,
}) => {
  await page.goto("/GYSApp-Tauri/");
  await expect(page.locator(".continue-panel")).toHaveCount(1);
  await expect(page.locator(".home-page .home-media-section")).toHaveCount(2);
  await expect(
    page.getByRole("heading", { name: "Suara Sejati" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Literatur Terbaru" }),
  ).toBeVisible();
  await expect(page.locator(".verse-panel .section-heading")).toContainText(
    "Sauh hari ini",
  );
  await expect(page.locator(".sauh-image")).toHaveCount(1);
  await expect(
    page.getByRole("link", { name: /Baca Lebih Lanjut/i }),
  ).toBeVisible();
});

test("online content opens inside the application shell", async ({ page }) => {
  await page.goto("/GYSApp-Tauri/");
  await page.getByRole("link", { name: /Baca Lebih Lanjut/i }).click();
  await expect(page).toHaveURL(/\/sauh$/);
  await expect(page.getByTestId("sauh-page")).toBeVisible();
  await page.goto("/GYSApp-Tauri/suara");
  await page.locator(".suara-library-item").first().click();
  await expect(page).toHaveURL(/\/suara\//);
  await expect(page.getByTestId("suara-detail-page")).toBeVisible();
});

test("Sauh article adapts from split desktop layout to a single mobile column", async ({
  page,
}) => {
  const fixture = {
    id: "sbj260817",
    title: "Orang Biasa yang Luar Biasa",
    reference: "Hakim-Hakim 3:31",
    verse:
      "Sesudah dia, bangkitlah Samgar bin Anat; ia menewaskan orang Filistin.",
    body: "Di dalam Alkitab, kita belajar untuk bangkit dan memakai apa yang ada di tangan kita. https://tjc.org/id/wp-content/uploads/sites/43/2026/08/sbj260817.mp3",
    url: "https://tjc.org/id/gerakan-baca-alkitab/sbj260817/",
    imageUrl: "https://tjc.org/id/wp-content/uploads/sites/43/2026/08/sauh.png",
    updatedAt: new Date().toISOString(),
    source: "tjc.org",
  };
  const payload = JSON.stringify({ items: [fixture] });
  await page.route("**/offline/sauh.json", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: payload,
    }),
  );
  await page.route("**/wp-json/wp/v2/posts**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([fixture]),
    }),
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/GYSApp-Tauri/sauh");
  await expect(page.locator(".sauh-article")).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  const mobileColumns = await page
    .locator(".sauh-article")
    .evaluate((element) => getComputedStyle(element).gridTemplateColumns);
  expect(mobileColumns.split(" ")).toHaveLength(1);

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.reload();
  await expect(page.locator(".sauh-article")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  const desktopColumns = await page
    .locator(".sauh-article")
    .evaluate((element) => getComputedStyle(element).gridTemplateColumns);
  expect(desktopColumns.split(" ").length).toBeGreaterThanOrEqual(2);
});

test("literature behaves as a searchable ebook shelf and hymn opens by detail route", async ({
  page,
}) => {
  await page.goto("/GYSApp-Tauri/literatur");
  await expect(
    page.getByRole("heading", { name: "Literatur", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".literature-shelf-item").first()).toBeVisible({
    timeout: 15_000,
  });
  await page
    .getByRole("link", { name: /Kidung/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/kidung$/);
  await page
    .getByRole("button", {
      name: "Pujilah Allah Yang Maha Esa",
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/\/kidung\/hymn-001$/);
  await expect(page.getByText("Bait 1 dari 3", { exact: true })).toBeVisible();
});

test("hymn search uses indexed AND matching instead of lyric rescans", async ({
  page,
}) => {
  await page.goto("/GYSApp-Tauri/kidung");
  await expect(
    page.getByRole("heading", { name: "Kidung", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Cari lagu").fill("Allah Pujilah 001");
  await expect(
    page.getByRole("button", {
      name: "Pujilah Allah Yang Maha Esa",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".pujian-list > li")).toHaveCount(1);
});

test("hymn catalog keeps search and collection controls in its header", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/GYSApp-Tauri/kidung");
  await expect(
    page.getByRole("heading", { name: "Kidung", exact: true }),
  ).toBeVisible({ timeout: 15_000 });
  const header = page.locator(".hymn-page-header");
  await expect(header).toBeVisible();
  await expect(header.getByLabel("Cari lagu")).toBeVisible();
  await expect(header.getByRole("button", { name: "Koleksi" })).toBeVisible();
  await expect(
    page.getByText(
      "Pilih satu pujian untuk membuka lirik per bait, chord, PDF, atau iringan MIDI.",
    ),
  ).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
});

test("home shows Bible and hymn history side by side when both coexist", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "gys-activity-v1",
      JSON.stringify({
        version: 1,
        bible: {
          book: "Yohanes",
          chapter: 3,
          updatedAt: "2026-08-14T01:00:00.000Z",
        },
        hymn: {
          id: "hymn-001",
          title: "Pujilah Allah Yang Maha Esa",
          number: 1,
          verseIndex: 0,
          updatedAt: "2026-08-14T02:00:00.000Z",
        },
      }),
    );
  });
  await page.goto("/GYSApp-Tauri/");
  await expect(page.locator(".continue-item")).toHaveCount(2);
});

test("device reset clears browser preferences, durable blobs, and app caches", async ({
  page,
}) => {
  await page.goto("/GYSApp-Tauri/");
  await page.evaluate(async () => {
    localStorage.setItem("gys-reset-test-v1", "preference");
    const cache = await caches.open("gysapp-reset-test-v1");
    await cache.put(
      "/GYSApp-Tauri/reset-test",
      new Response("cached", { headers: { "content-type": "text/plain" } }),
    );

    const request = indexedDB.open("gysapp-platform-v1", 2);
    await new Promise<void>((resolve, reject) => {
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("key-value"))
          db.createObjectStore("key-value");
        if (!db.objectStoreNames.contains("blobs"))
          db.createObjectStore("blobs");
      };
      request.onerror = () =>
        reject(request.error ?? new Error("IDB open failed"));
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(["key-value", "blobs"], "readwrite");
        transaction
          .objectStore("key-value")
          .put("preference", "gys-reset-test-v1");
        transaction
          .objectStore("blobs")
          .put(new Uint8Array([1, 2, 3]), "gys-reset-test-v1");
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        transaction.onerror = () =>
          reject(transaction.error ?? new Error("IDB write failed"));
      };
    });
  });

  await page.goto("/GYSApp-Tauri/lainnya?section=data");
  await page.getByRole("button", { name: "Reset perangkat" }).click();
  await expect(
    page.getByText(/Preferensi dan cache GYS sudah direset/),
  ).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const cachesLeft = (await caches.keys()).filter(
            (name) =>
              name.startsWith("gys-") ||
              name.startsWith("gysapp-") ||
              name.startsWith("gys-midi-"),
          );
          const request = indexedDB.open("gysapp-platform-v1", 2);
          const counts = await new Promise<[number, number]>(
            (resolve, reject) => {
              request.onerror = () =>
                reject(request.error ?? new Error("IDB open failed"));
              request.onsuccess = () => {
                const db = request.result;
                const transaction = db.transaction(
                  ["key-value", "blobs"],
                  "readonly",
                );
                const keyValue = transaction.objectStore("key-value").count();
                const blobs = transaction.objectStore("blobs").count();
                transaction.oncomplete = () => {
                  db.close();
                  resolve([keyValue.result, blobs.result]);
                };
                transaction.onerror = () =>
                  reject(transaction.error ?? new Error("IDB read failed"));
              };
            },
          );
          return {
            local: localStorage.getItem("gys-reset-test-v1"),
            cachesLeft,
            counts,
          };
        }),
      { timeout: 5_000 },
    )
    .toEqual({ local: null, cachesLeft: [], counts: [0, 0] });
});

test("the shared read-aloud surface can be minimized without losing the session", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("gys-speech-engine-v1", "local");
    const voice = {
      voiceURI: "gys-test-id",
      name: "GYS test voice",
      lang: "id-ID",
      localService: true,
      default: true,
    };
    const synthesis = {
      getVoices: () => [voice],
      speak: (utterance: { onend?: () => void }) => {
        window.setTimeout(() => utterance.onend?.(), 1_200);
      },
      cancel: () => undefined,
      pause: () => undefined,
      resume: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    };
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: synthesis,
    });
    class TestUtterance {
      public text: string;
      public onend?: () => void;
      public onerror?: () => void;
      public rate = 1;
      public pitch = 1;
      public volume = 1;
      public voice: unknown = null;
      public constructor(text: string) {
        this.text = text;
      }
    }
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: TestUtterance,
    });
  });
  await page.goto("/GYSApp-Tauri/bible");
  await page.getByRole("heading", { name: "Alkitab" }).waitFor();
  const readButton = page.getByRole("button", { name: "Bacakan" });
  await expect(readButton).toBeEnabled({ timeout: 15_000 });
  await readButton.click();
  await expect(page.locator(".media-surface")).toBeVisible();
  await expect(page.locator(".verse-row.is-speaking")).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.getByRole("button", { name: "Ayat berikutnya" }),
  ).toBeVisible();
  const firstSpokenVerse = await page
    .locator(".verse-row.is-speaking")
    .getAttribute("id");
  await page.getByRole("button", { name: "Ayat berikutnya" }).click();
  await expect
    .poll(() => page.locator(".verse-row.is-speaking").getAttribute("id"))
    .not.toBe(firstSpokenVerse);
  await page.locator(".media-context-link").click();
  await expect(page).toHaveURL(/\/bible#bible-verse-/);
  await page.getByRole("button", { name: "Menu Alkitab" }).click();
  await page.getByRole("button", { name: /Pengaturan Suara/i }).click();
  const pitch = page.getByLabel("Nada bacaan suara");
  const volume = page.getByLabel("Volume bacaan suara");
  await pitch.fill("1.4");
  await volume.fill("0.65");
  await expect(pitch).toHaveValue("1.4");
  await expect(volume).toHaveValue("0.65");
  await page.getByRole("button", { name: "Tutup menu" }).click();
  const dragHandle = page.locator(".media-drag-handle");
  const dragBox = await dragHandle.boundingBox();
  if (!dragBox) throw new Error("Media drag handle is not measurable");
  await page.mouse.move(
    dragBox.x + dragBox.width / 2,
    dragBox.y + dragBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    dragBox.x + dragBox.width / 2 + 24,
    dragBox.y + dragBox.height / 2 + 12,
  );
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("gys-media-position-v1")),
    )
    .not.toBeNull();
  // A saved position must be re-clamped when the viewport shrinks so the
  // floating surface never leaves the visible area.
  await page.setViewportSize({ width: 320, height: 480 });
  await expect
    .poll(async () => {
      const box = await page.locator(".media-surface").boundingBox();
      return box
        ? box.x >= 0 &&
            box.y >= 0 &&
            box.x + box.width <= 320 &&
            box.y + box.height <= 480
        : false;
    })
    .toBe(true);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole("link", { name: "Beranda" }).click();
  await expect(page.locator(".media-surface")).toBeVisible();
  await page.getByRole("button", { name: "Minimalkan pemutar" }).click();
  await expect(page.locator(".media-surface.is-minimized")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Perbesar pemutar" }),
  ).toBeVisible();

  await page.goto("/GYSApp-Tauri/bible");
  await expect(page.getByRole("heading", { name: "Alkitab" })).toBeVisible();
  await page.getByRole("button", { name: "Menu Alkitab" }).click();
  await page.getByRole("button", { name: /Pengaturan Suara/i }).click();
  await expect(page.getByLabel("Nada bacaan suara")).toHaveValue("1.4");
  await expect(page.getByLabel("Volume bacaan suara")).toHaveValue("0.65");
});

test("global search indexes real offline content and navigates to a result", async ({
  page,
}) => {
  await page.goto("/GYSApp-Tauri/");
  await page.getByRole("button", { name: /Cari di seluruh aplikasi/ }).click();
  await expect(
    page.getByRole("dialog", { name: "Temukan sesuatu" }),
  ).toBeVisible();
  await page
    .getByLabel("Cari Alkitab, Kidung, Literatur, Iman, atau media")
    .fill("Pujilah Allah Yang Maha Esa");
  await expect(
    page.getByRole("button", { name: /Pujilah Allah Yang Maha Esa/ }).first(),
  ).toBeVisible({ timeout: 15_000 });
  await page
    .getByRole("button", { name: /Pujilah Allah Yang Maha Esa/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/kidung\/hymn-001$/);
});

test("global search finds Bible verses and deep-links into the internal reader", async ({
  page,
}) => {
  await page.goto("/GYSApp-Tauri/");
  await page.getByRole("button", { name: /Cari di seluruh aplikasi/ }).click();
  await expect(
    page.getByRole("dialog", { name: "Temukan sesuatu" }),
  ).toBeVisible();
  await page
    .getByLabel("Cari Alkitab, Kidung, Literatur, Iman, atau media")
    .fill("begitu besar kasih Allah akan dunia ini");
  const bibleResult = page
    .getByRole("button", { name: /Yohanes 3:16/ })
    .first();
  await expect(bibleResult).toBeVisible({ timeout: 15_000 });
  await bibleResult.click();
  await expect(page).toHaveURL(/\/bible\?book=43&chapter=3&verse=16$/);
  await expect(
    page.getByRole("heading", { name: "Yohanes 3" }).first(),
  ).toBeVisible({ timeout: 15_000 });
  const verseButton = page
    .getByRole("button", { name: /Karena begitu besar kasih Allah/ })
    .first();
  await expect(verseButton).toBeVisible();
  await expect(verseButton).toHaveAttribute("aria-pressed", "true");
});

test("literature detail persists favorite and progress controls", async ({
  page,
}) => {
  await page.goto("/GYSApp-Tauri/literatur");
  await page.locator(".literature-row").first().click();
  await expect(page.locator('[data-testid="literature-detail"]')).toBeVisible();
  await page.getByRole("button", { name: /Simpan favorit/ }).click();
  await expect(page.getByRole("button", { name: /Favorit/ })).toBeVisible();
  await page.getByRole("button", { name: "Tandai dibuka" }).click();
  await expect(page.locator("progress")).toHaveAttribute("value", "1");
  await page.goto("/GYSApp-Tauri/literatur");
  await expect(
    page.getByRole("heading", { name: "Terakhir dilihat" }),
  ).toBeVisible();
  await expect(page.locator(".literature-recent-item")).toHaveCount(1);
});

test("literature history removes one selected reading", async ({ page }) => {
  await page.goto("/GYSApp-Tauri/literatur");
  await page.locator(".literature-row").first().click();
  await expect(page.locator('[data-testid="literature-detail"]')).toBeVisible();
  await page.getByRole("button", { name: "Tandai dibuka" }).click();
  await page.goto("/GYSApp-Tauri/literatur");
  const recent = page.locator(".literature-recent-item").first();
  await expect(recent).toBeVisible();
  await recent.getByRole("button", { name: /Hapus/ }).click();
  await expect(page.locator(".literature-recent-item")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Terakhir dilihat" }),
  ).toHaveCount(0);
});

test("literature article primary action stays in the internal reader", async ({
  page,
}) => {
  await page.goto("/GYSApp-Tauri/literatur");
  await page.locator(".literature-row").first().click();
  await expect(page.locator('[data-testid="literature-detail"]')).toBeVisible();
  await page.getByRole("button", { name: "Baca di aplikasi" }).click();
  await expect(page.getByTestId("literature-article-reader")).toBeVisible();
  await expect(page).toHaveURL(/\/literatur\//);
});

test("literature article exposes an explicit jump to the saved scroll position", async ({
  page,
}) => {
  await page.goto("/GYSApp-Tauri/literatur");
  await page.locator(".literature-row").first().click();
  await expect(page.locator('[data-testid="literature-detail"]')).toBeVisible();
  await page.evaluate(() => {
    const raw = JSON.parse(
      window.localStorage.getItem("gys-literature-progress-v2") ?? "{}",
    ) as Record<string, Record<string, unknown>>;
    const first = Object.entries(raw)[0];
    if (!first) throw new Error("literature progress was not initialized");
    const [id, progress] = first;
    raw[id] = {
      ...progress,
      percent: 55,
      resourceVersion: "legacy",
      location: { kind: "scroll", ratio: 0.55 },
    };
    window.localStorage.setItem(
      "gys-literature-progress-v2",
      JSON.stringify(raw),
    );
    window.dispatchEvent(new CustomEvent("gys-literature-progress-change"));
  });
  await page.reload();
  await page.getByRole("button", { name: "Lanjutkan membaca" }).click();
  await expect(page.getByTestId("literature-article-reader")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Kembali ke posisi/ }),
  ).toBeVisible();
});

test("MIDI queue persists from a hymn detail into the utility surface", async ({
  page,
}) => {
  await page.goto("/GYSApp-Tauri/kidung/hymn-001");
  await expect(
    page.getByRole("heading", { name: "Pujilah Allah Yang Maha Esa" }),
  ).toBeVisible({ timeout: 15_000 });
  await page.locator("summary.hymn-more-actions-summary").click();
  await page.getByRole("button", { name: "Tambah antrean MIDI" }).click();
  await page.goto("/GYSApp-Tauri/lainnya?section=data");
  await page.getByRole("button", { name: "Antrean MIDI" }).click();
  await expect(page.locator(".playlist-list li")).toHaveCount(1);
  await expect(
    page.locator(".playlist-item-main", {
      hasText: "Pujilah Allah Yang Maha Esa",
    }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Antrean MIDI" }).click();
  await expect(page.locator(".playlist-list li")).toHaveCount(1);
});

test("Bible title tap opens standard book/chapter/verse picker dialog and navigates", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/GYSApp-Tauri/bible");
  await expect(page.getByRole("heading", { name: /Yohanes 3/ })).toBeVisible({
    timeout: 15_000,
  });
  const handle = page.getByRole("button", {
    name: "Geser judul untuk berpindah pasal",
  });
  // Single click / tap without dragging opens picker dialog
  await handle.click();
  const dialog = page.getByRole("dialog", { name: "Pilih Kitab & Pasal" });
  await expect(dialog).toBeVisible();
  await expect
    .poll(() =>
      dialog.evaluate(
        (element) =>
          element.getBoundingClientRect().right <= innerWidth &&
          element.scrollWidth <= element.clientWidth,
      ),
    )
    .toBe(true);
  const longBook = page.getByRole("button", { name: "Kidung Agung" });
  await expect(longBook).toBeVisible();
  expect(
    await longBook.evaluate(
      (element) => getComputedStyle(element).whiteSpace === "normal",
    ),
  ).toBe(true);

  // Filter book by name and select
  await page.getByPlaceholder("Cari nama kitab…").fill("Matius");
  await page.getByRole("button", { name: "Matius", exact: true }).click();

  // Select Chapter 5
  await page.getByRole("button", { name: "5", exact: true }).click();

  // Select Verse 3 (Beatitudes)
  await page.getByRole("button", { name: "3", exact: true }).click();

  // Modal dialog closes and reader navigates to Matius 5 with verse 3 selected
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("heading", { name: /Matius 5/ })).toBeVisible();
  await expect(page.locator(".verse-row.is-selected")).toContainText(
    "Berbahagialah orang yang miskin di hadapan Allah",
  );
});

test("Bible split reader supports synchronized scrolling mode and persists preference", async ({
  page,
}) => {
  await page.goto("/GYSApp-Tauri/bible");
  await expect(page.getByRole("heading", { name: /Yohanes 3/ })).toBeVisible({
    timeout: 15_000,
  });

  // Enable split view
  await page.getByRole("button", { name: "Dua kolom" }).click();
  await expect(page.locator(".bible-pane")).toHaveCount(2);

  // Sync scroll toggle is visible and active by default
  const syncToggle = page.getByRole("button", { name: "Gulir sinkron" });
  await expect(syncToggle).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        localStorage.getItem("gys-bible-split-sync-scroll-v1"),
      ),
    )
    .toBe("1");

  // Toggle sync scroll off (Independent scrolling)
  await syncToggle.click();
  await expect(
    page.getByRole("button", { name: "Gulir mandiri" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        localStorage.getItem("gys-bible-split-sync-scroll-v1"),
      ),
    )
    .toBe("0");

  // Toggle sync scroll back on
  await page.getByRole("button", { name: "Gulir mandiri" }).click();
  await expect(
    page.getByRole("button", { name: "Gulir sinkron" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        localStorage.getItem("gys-bible-split-sync-scroll-v1"),
      ),
    )
    .toBe("1");
});
