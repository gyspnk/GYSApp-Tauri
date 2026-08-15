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
    ).toBeVisible();
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
  await page.goto("/GYSApp-Tauri/bible");
  await expect(
    page.getByRole("heading", { name: "Alkitab", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: /Yohanes 3/ })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("link", { name: /Iman/ }).first().click();
  await expect(
    page.getByRole("heading", { name: "Iman", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Dasar Kepercayaan" }),
  ).toBeVisible();
});

test("offline pack manager keeps one update action and reports manifest status", async ({
  page,
}) => {
  await page.goto("/GYSApp-Tauri/lainnya");
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
  await expect(splitDivider).toHaveAttribute("aria-valuenow", "60");
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("gys-bible-split-ratio-v1")),
    )
    .toBe("60");
  await page
    .getByRole("button", { name: /Karena begitu besar kasih Allah/ })
    .first()
    .click();
  await expect(page.getByLabel("Catatan pribadi")).toBeVisible();
  await page
    .getByLabel("Catatan pribadi")
    .fill("Kasih Tuhan menjadi dasar pengharapan.");
  await page.getByRole("button", { name: "Simpan catatan" }).click();
  await page.getByRole("button", { name: "Sorot blue" }).click();
  await expect(page.locator(".verse-row.is-highlight-blue")).toHaveCount(1);
});

test("Bible title drag exposes quick chapter navigation with keyboard fallback", async ({
  page,
}) => {
  await page.goto("/GYSApp-Tauri/bible");
  await expect(page.getByRole("heading", { name: /Yohanes 3/ })).toBeVisible({
    timeout: 15_000,
  });
  const handle = page.getByRole("button", {
    name: "Geser judul untuk berpindah pasal",
  });
  const box = await handle.boundingBox();
  if (!box) throw new Error("Bible quick navigation handle is not measurable");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 96);
  await expect(page.locator(".quick-nav-floater")).toBeVisible();
  await page.mouse.up();
  await expect(page.getByRole("heading", { name: /Yohanes 5/ })).toBeVisible();
  await handle.focus();
  await handle.press("ArrowUp");
  await expect(page.getByRole("heading", { name: /Yohanes 4/ })).toBeVisible();
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
  await page.getByRole("button", { name: "Catat" }).click();
  await expect(page.getByLabel("Catatan pribadi")).toBeVisible();
});

test("home surfaces today's Sauh and canonical Suara Sejati feed", async ({
  page,
}) => {
  await page.goto("/GYSApp-Tauri/");
  await expect(page.getByRole("heading", { name: "Suara Sejati" })).toBeVisible(
    { timeout: 15_000 },
  );
  await expect(page.locator(".sauh-image")).toHaveCount(1);
});

test("online content opens inside the application shell", async ({ page }) => {
  await page.goto("/GYSApp-Tauri/");
  await page.getByRole("link", { name: "Baca Sauh" }).click();
  await expect(page).toHaveURL(/\/sauh$/);
  await expect(page.getByTestId("sauh-page")).toBeVisible();
  await page.getByRole("link", { name: "Beranda" }).first().click();
  await page.locator(".suara-item").first().click();
  await expect(page).toHaveURL(/\/suara\//);
  await expect(page.getByTestId("suara-detail-page")).toBeVisible();
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
    .getByRole("button", { name: /Pujilah Allah Yang Maha Esa/ })
    .click();
  await expect(page).toHaveURL(/\/kidung\/hymn-001$/);
  await expect(page.getByRole("tab", { name: "1" })).toBeVisible();
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
    page.getByRole("button", { name: /Pujilah Allah Yang Maha Esa/ }),
  ).toBeVisible();
  await expect(page.locator(".pujian-list > li")).toHaveCount(1);
});

test("home keeps one continue item when Bible and hymn history coexist", async ({
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
  await expect(page.locator(".continue-item")).toHaveCount(1);
});

test("the shared read-aloud surface can be minimized without losing the session", async ({
  page,
}) => {
  await page.addInitScript(() => {
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
  await expect(readButton).toBeEnabled({ timeout: 5_000 });
  await readButton.click();
  await expect(page.locator(".media-surface")).toBeVisible();
  await page.locator(".media-context-link").click();
  await expect(page).toHaveURL(/\/bible#bible-verse-/);
  const pitch = page.getByLabel("Nada bacaan suara");
  const volume = page.getByLabel("Volume bacaan suara");
  await pitch.fill("1.4");
  await volume.fill("0.65");
  await expect(pitch).toHaveValue("1.4");
  await expect(volume).toHaveValue("0.65");
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
  await page.getByRole("link", { name: "Beranda" }).click();
  await expect(page.locator(".media-surface")).toBeVisible();
  await page.getByRole("button", { name: "Minimalkan pemutar" }).click();
  await expect(page.locator(".media-surface.is-minimized")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Perbesar pemutar" }),
  ).toBeVisible();

  await page.goto("/GYSApp-Tauri/bible");
  await expect(page.getByRole("heading", { name: "Alkitab" })).toBeVisible();
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
    .getByLabel("Cari Kidung, Literatur, Iman, atau media")
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
  await page.getByRole("button", { name: "Tambah antrean MIDI" }).click();
  await page.getByRole("link", { name: "Lainnya" }).click();
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
