import { expect, test, type Page } from "@playwright/test";

async function hasNoHorizontalOverflow(page: Page) {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth <=
      document.documentElement.clientWidth + 1,
  );
}

async function touchSwipe(page: Page, fromX = 300, toX = 210) {
  await page.locator(".lyrics-sheet").evaluate(
    (element, points) => {
      const event = (type: string, x: number) =>
        element.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            pointerId: 1,
            pointerType: "touch",
            isPrimary: true,
            buttons: type === "pointerup" ? 0 : 1,
            clientX: x,
            clientY: 420,
          }),
        );
      event("pointerdown", points.fromX);
      event("pointermove", points.toX);
      event("pointerup", points.toX);
    },
    { fromX, toX },
  );
}

test.describe("responsive reader navigation", () => {
  test("mobile Bible chrome stays contained in normal and split views", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      localStorage.setItem("gys-bible-book", "1");
      localStorage.setItem("gys-bible-chapter", "1");
    });
    await page.goto("/GYSApp-Tauri/bible");
    await expect(page.getByRole("heading", { name: "Alkitab" })).toBeVisible();

    const nav = page.locator(".navigation-shell");
    const navBox = await nav.boundingBox();
    expect(navBox).not.toBeNull();
    expect(navBox!.x).toBeGreaterThanOrEqual(0);
    expect(navBox!.x + navBox!.width).toBeLessThanOrEqual(390);
    const firstNavItem = page.locator(".navigation-shell .nav-item").first();
    const [iconBox, labelBox] = await Promise.all([
      firstNavItem.locator("svg").boundingBox(),
      firstNavItem.locator(".nav-copy strong").boundingBox(),
    ]);
    expect(iconBox).not.toBeNull();
    expect(labelBox).not.toBeNull();
    expect(iconBox!.y + iconBox!.height).toBeLessThanOrEqual(labelBox!.y);
    await expect(
      page.locator(".bible-pericope-heading .bible-crossref-trigger"),
    ).toHaveCount(0);
    await expect(page.locator(".bible-crossref-inline")).toHaveCount(5);
    await expect(
      page.locator(
        '.verse-content > .verse-text + .bible-crossref-inline[title="54 rujukan silang"]',
      ),
    ).toHaveCount(1);
    await expect(page.locator(".bible-crossref-inline").first()).toHaveCSS(
      "min-width",
      "0px",
    );
    await expect(page.locator(".bible-crossref-count").first()).toHaveCSS(
      "position",
      "absolute",
    );
    expect(
      await page
        .locator(".verse-content")
        .first()
        .evaluate((content) => {
          const text = content.querySelector(".verse-text");
          const marker = content.querySelector(".bible-crossref-inline");
          if (!text || !marker) return false;
          const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
          let lastText: Text | null = null;
          while (walker.nextNode()) lastText = walker.currentNode as Text;
          if (!lastText?.length) return false;
          const range = document.createRange();
          range.setStart(lastText, lastText.length - 1);
          range.setEnd(lastText, lastText.length);
          const finalCharacter = range.getBoundingClientRect();
          const star = marker.getBoundingClientRect();
          return (
            star.bottom > finalCharacter.top && star.top < finalCharacter.bottom
          );
        }),
    ).toBe(true);
    const headerControlHeights = await page
      .locator(
        ".reader-context-book-picker, .reader-version-select-wrap .control-select-trigger, .reader-context-actions > .reader-context-button, .reader-hamburger-btn",
      )
      .evaluateAll((controls) =>
        controls
          .map((control) => control.getBoundingClientRect().height)
          .filter((height) => height > 0),
      );
    expect(headerControlHeights).toEqual(headerControlHeights.map(() => 44));
    await expect(page.locator(".bible-reader")).toHaveCSS(
      "border-top-width",
      "0px",
    );
    await page
      .getByRole("button", {
        name: "Lihat 54 rujukan silang untuk Kejadian 1:1",
      })
      .click();
    await expect(
      page.getByText(
        /Sebab enam hari lamanya TUHAN menjadikan langit dan bumi/,
      ),
    ).toBeVisible();
    await page.getByRole("button", { name: "Tutup rujukan" }).click();

    await page.getByRole("button", { name: "Menu Alkitab" }).click();
    await expect(
      page.getByRole("radiogroup", { name: "Pilih Warna Aksen" }),
    ).toHaveCount(0);
    await page.getByText("Tampilan Belah", { exact: true }).click();

    const panes = page.locator(".bible-pane");
    await expect(panes).toHaveCount(2);
    const boxes = await panes.evaluateAll((elements) =>
      elements.map((element) => {
        const box = element.getBoundingClientRect();
        return { top: box.top, bottom: box.bottom };
      }),
    );
    expect(boxes[0]!.bottom).toBeLessThanOrEqual(boxes[1]!.top);
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);

    await page.goto("/GYSApp-Tauri/lainnya");
    await expect(
      page.getByRole("radiogroup", { name: "Pilih Warna Aksen" }),
    ).toBeVisible();
  });

  test("dashboard uses an adaptive compact scale without wasting desktop space", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    // Deterministic Sauh entry keeps layout assertions independent of live
    // upstream latency; skeleton/stale-policy is covered by dedicated specs.
    const todaySlug = `sbj${new Date().toISOString().slice(2, 10).replaceAll("-", "")}`;
    const todaySauh = {
      id: todaySlug,
      title: "Renungan hari ini",
      reference: "Yohanes 3:16",
      verse: "Karena begitu besar kasih Allah akan dunia ini.",
      body: "Isi renungan resmi untuk pengujian tata letak beranda.",
      url: `https://tjc.org/id/gerakan-baca-alkitab/${todaySlug}/`,
      updatedAt: new Date().toISOString(),
      source: "tjc.org",
    };
    await page.route("**/offline/sauh.json", (route) =>
      route.fulfill({ json: { items: [todaySauh] } }),
    );
    await page.route("**/wp-json/wp/v2/posts**", (route) =>
      route.fulfill({ json: [todaySauh] }),
    );
    await page.goto("/GYSApp-Tauri/");
    await expect(page.locator(".home-grid")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".verse-actions > *")).toHaveCount(1);
    const phone = await page.evaluate(() => {
      const action = document.querySelector(".verse-actions > *")!;
      return {
        heading: Number.parseFloat(
          getComputedStyle(document.querySelector(".home-page h1")!).fontSize,
        ),
        actionTop: action ? action.getBoundingClientRect().top : 0,
        mediaTop: document
          .querySelector(".home-media-section")!
          .getBoundingClientRect().top,
      };
    });
    expect(phone.heading).toBeLessThanOrEqual(23);
    expect(phone.actionTop).toBeGreaterThan(0);
    expect(phone.mediaTop).toBeLessThan(720);
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);

    await page.setViewportSize({ width: 1440, height: 900 });
    const desktop = await page.evaluate(() => ({
      heading: Number.parseFloat(
        getComputedStyle(document.querySelector(".home-page h1")!).fontSize,
      ),
      continueHeight: document
        .querySelector(".continue-panel")!
        .getBoundingClientRect().height,
      verseRight: document
        .querySelector(".verse-panel")!
        .getBoundingClientRect().right,
      mediaLeft: document
        .querySelector(".home-media-section")!
        .getBoundingClientRect().left,
    }));
    expect(desktop.heading).toBeLessThanOrEqual(34);
    expect(desktop.continueHeight).toBeLessThan(180);
    expect(desktop.mediaLeft).toBeGreaterThan(desktop.verseRight);
  });

  test("Kidung catalog keeps search and collection controls usable on mobile", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/GYSApp-Tauri/kidung");
    await expect(
      page.getByRole("heading", { name: "Kidung", exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".reader-context-bar")).toBeVisible();
    await expect(page.locator(".brand-mark")).toHaveCount(0);

    const search = page.getByRole("textbox", { name: "Cari lagu" });
    await expect(search).toBeVisible();
    await expect
      .poll(() =>
        search.evaluate((element) => element.getBoundingClientRect().width),
      )
      .toBeGreaterThan(200);
    await expect(page.getByRole("button", { name: "Koleksi" })).toBeVisible();
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);

    await page.getByRole("button", { name: "Buka pencarian lagu" }).click();
    await expect(search).toBeFocused();
    await search.fill("Allah Pujilah");
    await expect(
      page.getByRole("button", {
        name: "Pujilah Allah Yang Maha Esa",
        exact: true,
      }),
    ).toBeVisible();
  });

  test("focused hymn reader keeps navigation and actions accessible", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/GYSApp-Tauri/kidung/hymn-001");
    await expect(
      page.getByRole("heading", { name: /Pujilah Allah Yang Maha Esa/ }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".reader-context-bar")).toBeHidden();
    await expect(page.locator(".app-frame .topbar")).toBeHidden();
    await expect(page.locator(".app-frame .navigation-shell")).toBeHidden();
    await expect(page.locator(".hymn-text-toolbar")).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole("button", { name: "Tampilkan chord" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Buka PDF" })).toBeVisible();
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
    await expect(
      page.locator(".hymn-detail-page .detail-actions .hymn-action-primary"),
    ).toHaveCount(0);
  });

  test("mobile hymn text mode folds secondary actions and reader settings", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/GYSApp-Tauri/kidung/hymn-001");
    await expect(
      page.getByRole("heading", { name: /Pujilah Allah Yang Maha Esa/ }),
    ).toBeVisible({ timeout: 15_000 });

    await expect(
      page.locator(".hymn-detail-page .detail-actions .hymn-action"),
    ).toHaveCount(3);
    await expect(page.locator(".hymn-more-actions")).toBeVisible();
    await expect(
      page.locator(".hymn-more-actions .hymn-more-actions-panel"),
    ).toBeHidden();
    await expect(page.locator(".hymn-reader-settings")).toBeVisible();
    await expect(
      page.locator(".hymn-reader-settings .song-controls"),
    ).toBeHidden();

    await expect(page.locator(".hymn-text-toolbar")).toBeVisible();
    await expect(page.locator(".lyrics-sheet")).toBeVisible();
    await expect(page.locator(".hymn-text-footer")).toBeVisible();
    const geometry = await page.evaluate(() => {
      const sheet = document.querySelector(".lyrics-sheet")!;
      const footer = document.querySelector(".hymn-text-footer")!;
      return {
        sheet: sheet.getBoundingClientRect().toJSON(),
        footer: footer.getBoundingClientRect().toJSON(),
        bodyHeight: document.body.scrollHeight,
      };
    });
    expect(geometry.sheet.top).toBeLessThan(180);
    expect(geometry.sheet.height).toBeGreaterThan(400);
    expect(geometry.sheet.bottom).toBeLessThanOrEqual(geometry.footer.top + 1);
    expect(geometry.footer.bottom).toBeLessThanOrEqual(844);
    expect(geometry.bodyHeight).toBeLessThanOrEqual(844);
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
  });

  test("hymn swipe changes one verse at a time and crosses songs at the boundary", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/GYSApp-Tauri/kidung/hymn-001");
    await expect(page.getByText("Bait 1 dari 3", { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    await touchSwipe(page);
    await expect(
      page.getByText("Bait 2 dari 3", { exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(/hymn-001$/);
    await touchSwipe(page);
    await expect(
      page.getByText("Bait 3 dari 3", { exact: true }),
    ).toBeVisible();
    await touchSwipe(page);
    await expect(page).toHaveURL(/hymn-002$/);
  });

  test("hymn pinch zoom is smooth and persists its text size", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/GYSApp-Tauri/kidung/hymn-001");
    const lyrics = page.locator(".lyrics-sheet");
    await expect(lyrics).toBeVisible({ timeout: 15_000 });
    const initialSize = await lyrics.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).fontSize),
    );

    await lyrics.evaluate((element) => {
      const fire = (type: string, pointerId: number, clientX: number) =>
        element.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            pointerId,
            pointerType: "touch",
            isPrimary: pointerId === 1,
            buttons: type === "pointerup" ? 0 : 1,
            clientX,
            clientY: 420,
          }),
        );
      fire("pointerdown", 1, 120);
      fire("pointerdown", 2, 220);
      fire("pointermove", 2, 280);
      fire("pointerup", 2, 280);
      fire("pointerup", 1, 120);
    });

    await expect
      .poll(() =>
        lyrics.evaluate((element) =>
          Number.parseFloat(getComputedStyle(element).fontSize),
        ),
      )
      .toBeGreaterThan(initialSize);
    const persistedSize = await page.evaluate(() => {
      const saved = localStorage.getItem("gys-hymn-typography-v1");
      return saved
        ? JSON.parse(saved).songs?.["hymn-001"]?.fontSize
        : undefined;
    });
    expect(persistedSize).toBeGreaterThan(initialSize);
    await page.reload();
    await expect(lyrics).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(() =>
        lyrics.evaluate((element) =>
          Number.parseFloat(getComputedStyle(element).fontSize),
        ),
      )
      .toBeGreaterThan(initialSize);
  });

  test("Kidung local navigation keeps playlist and settings in the same space", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/GYSApp-Tauri/kidung?section=playlist");
    await expect(
      page.getByRole("heading", { name: "Playlist", exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    const localNav = page.locator(".kidung-local-nav");
    await expect(localNav.getByRole("link", { name: "Kidung" })).toBeVisible();
    await expect(
      localNav.getByRole("link", { name: "Playlist" }),
    ).toHaveAttribute("aria-current", "page");
    await localNav.getByRole("link", { name: "Pengaturan" }).click();
    await expect(
      page.getByRole("heading", { name: "Pengaturan", exact: true }),
    ).toBeVisible();
    await localNav.getByRole("link", { name: "Kidung" }).click();
    await expect(page.locator(".pujian-list > li").first()).toBeVisible({
      timeout: 15_000,
    });
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
  });

  test("Kidung hides MIDI transport until its SoundFont is installed", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/GYSApp-Tauri/kidung/hymn-001");
    await expect(
      page.getByRole("heading", { name: /Pujilah Allah Yang Maha Esa/ }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("button", { name: "Putar MIDI", exact: true }),
    ).toHaveCount(0);
    await expect(page.locator(".media-surface")).toHaveCount(0);
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
  });

  test("text reader exposes the active SoundFont and instrument before playback", async ({
    page,
  }) => {
    await page.goto("/GYSApp-Tauri/");
    await page.evaluate(async () => {
      const cacheName = "gys-distributed-v1-GeneralUser-GS-e2e";
      const cacheKey =
        "https://gysapp.local/distributed-assets/GeneralUser-GS/e2e";
      const cache = await caches.open(cacheName);
      await cache.put(cacheKey, new Response(new Uint8Array(1_000_000)));
      localStorage.setItem(
        "gys-distributed-assets-v1",
        JSON.stringify({
          "GeneralUser-GS": {
            code: "GeneralUser-GS",
            kind: "soundfont",
            version: "e2e",
            releaseTag: "e2e",
            installFileName: "GeneralUser-GS.sf2",
            packageSizeBytes: 1_000_000,
            packageChecksumSha256: "e2e",
            cacheName,
            cacheKey,
            payloadBytes: 1_000_000,
            installedAt: "2026-08-19T00:00:00.000Z",
          },
        }),
      );
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/GYSApp-Tauri/kidung/hymn-001");
    await expect(
      page.getByRole("button", { name: "Putar MIDI", exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await page.locator(".hymn-reader-settings-summary").click();
    await expect(page.getByText("SoundFont aktif")).toBeVisible();
    await expect(
      page.getByText("GeneralUser-GS", { exact: true }),
    ).toBeVisible();
    const instrument = page.getByLabel("Instrumen MIDI");
    await expect(instrument).toHaveValue("-1");
    await instrument.selectOption("40");
    await expect(instrument).toHaveValue("40");
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
  });

  test("Kidung PDF mode presents a compact viewer chrome before the sheet", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/GYSApp-Tauri/kidung/hymn-001");
    await expect(
      page.getByRole("heading", { name: /Pujilah Allah Yang Maha Esa/ }),
    ).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Buka PDF" }).click();

    await expect(page.locator(".pdf-reader-hymn")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator(".hymn-pdf-viewer-chrome")).toBeVisible();
    await expect(page.locator(".app-frame .topbar")).toBeHidden();
    await expect(page.locator(".app-frame .navigation-shell")).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Kembali ke lirik" }),
    ).toBeVisible();
    await expect
      .poll(
        () =>
          page
            .locator(".pdf-pages canvas")
            .first()
            .evaluate((canvas) => canvas.height),
        { timeout: 30_000 },
      )
      .toBeGreaterThan(0);

    const stageTop = await page
      .locator(".pdf-reader-hymn .pdf-stage")
      .evaluate((element) => element.getBoundingClientRect().top);
    expect(stageTop).toBeLessThan(844);
    await expect
      .poll(() =>
        page
          .locator(".pdf-reader-hymn .pdf-stage")
          .evaluate((element) => element.getBoundingClientRect().height),
      )
      .toBeGreaterThan(650);
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);

    await expect(page.locator(".pdf-advanced-controls.is-open")).toBeVisible();
  });

  test("Bible mobile toolbar keeps secondary controls compact", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/GYSApp-Tauri/bible");
    await expect(page.getByRole("heading", { name: /Kejadian 1/ })).toBeVisible(
      {
        timeout: 15_000,
      },
    );
    await expect(page.locator(".reader-context-bar")).toBeVisible();
    await expect(page.locator(".brand-mark")).toHaveCount(0);

    const scrubber = page.locator(".chapter-scrubber input");
    await expect(scrubber).toBeHidden();
    await expect(page.locator(".bible-reader article").first()).toBeVisible();
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);

    const handle = page.getByRole("button", {
      name: "Geser judul untuk berpindah pasal",
    });
    await handle.click();
    const searchInput = page.getByPlaceholder("Cari kitab atau isi ayat…");
    await expect(searchInput).toBeVisible();
    await searchInput.fill("Kejadian");
    await page.getByRole("button", { name: "Tutup", exact: false }).click();

    await page.locator(".reader-hamburger-btn").click();
    const speechToggle = page.locator(
      ".reader-hamburger-drawer .speech-settings-toggle",
    );
    await expect(speechToggle).toBeVisible();
    await expect(speechToggle).toHaveAttribute("aria-expanded", "false");
    await speechToggle.click();
    const engine = page.getByLabel("Mesin");
    await expect(engine).toBeVisible();
    await expect(engine.locator("option")).toHaveText([
      "Edge TTS",
      "TTS lokal",
    ]);
  });

  test("Bible navigation dialog supports verse content search and scope filter", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/GYSApp-Tauri/bible");
    await expect(page.getByRole("heading", { name: /Kejadian 1/ })).toBeVisible({
      timeout: 15_000,
    });

    // Tap title picker to open navigation modal
    await page.getByRole("button", { name: "Geser judul untuk berpindah pasal" }).click();
    const dialog = page.getByRole("dialog", { name: "Pilih Kitab & Pasal" });
    await expect(dialog).toBeVisible();

    // Verify scope pills: Semua, PL, PB, and active book (Kejadian Saja)
    await expect(page.getByRole("button", { name: "Semua (66)" })).toBeVisible();
    await expect(page.getByRole("button", { name: "PL (39)" })).toBeVisible();
    await expect(page.getByRole("button", { name: "PB (27)" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Kejadian Saja" })).toBeVisible();

    // Search by verse text inside active book
    await page.getByRole("button", { name: "Kejadian Saja" }).click();
    await page.getByPlaceholder("Cari kitab atau isi ayat…").fill("menciptakan langit");

    // Results show matched verse item
    const verseResult = page.locator(".bible-picker-verse-item").first();
    await expect(verseResult).toBeVisible();
    await expect(verseResult).toContainText("Kejadian 1:1");
    await expect(verseResult).not.toContainText("<pb/>");
    await expect(verseResult).not.toContainText("<");
    await verseResult.click();

    // Navigates and closes modal
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("heading", { name: /Kejadian 1/ })).toBeVisible();
  });
});
