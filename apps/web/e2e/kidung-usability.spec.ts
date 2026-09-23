import { createHash } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block" });

// Contextual Kidung menus share the same 44px minimum target as primary chrome.
async function expectTarget(locator: Locator, min = 44) {
  const box = await locator.boundingBox();
  expect(box, "control should be visible and measurable").not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(min - 0.5);
  expect(box!.height).toBeGreaterThanOrEqual(min - 0.5);
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
}

async function expectLyricsGeometry(panel: Locator, page: Page) {
  const controls = panel.locator("button:visible, input:visible, select:visible");
  const controlCount = await controls.count();
  expect(controlCount).toBeGreaterThan(15);
  for (let index = 0; index < controlCount; index += 1)
    await expectTarget(controls.nth(index));

  const viewport = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  const boxes = await controls.evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, right: box.right, bottom: box.bottom };
    }),
  );
  for (const box of boxes) {
    expect(box.x).toBeGreaterThanOrEqual(-0.5);
    expect(box.y).toBeGreaterThanOrEqual(-0.5);
    expect(box.right).toBeLessThanOrEqual(viewport.width + 0.5);
    expect(box.bottom).toBeLessThanOrEqual(viewport.height + 0.5);
  }

  const headerRegions = await panel
    .locator(".lyrics-title, .lyrics-transport, .lyrics-header-actions")
    .evaluateAll((elements) =>
      elements.map((element) => {
        const box = element.getBoundingClientRect();
        return { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
      }),
    );
  for (let left = 0; left < headerRegions.length; left += 1) {
    for (let right = left + 1; right < headerRegions.length; right += 1) {
      const a = headerRegions[left]!;
      const b = headerRegions[right]!;
      const overlaps =
        Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
        Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
      expect(overlaps, `header regions ${left}/${right} must not overlap`).toBe(
        false,
      );
    }
  }
}

async function expectMediaDockGeometry(
  media: Locator,
  viewportWidth: number,
) {
  const geometry = await media.evaluate((element) => {
    const rect = (selector: string) => {
      const node =
        selector === ":scope"
          ? element
          : element.querySelector<HTMLElement>(selector);
      const box = node?.getBoundingClientRect();
      return box
        ? { x: box.x, y: box.y, width: box.width, height: box.height }
        : null;
    };
    return {
      media: rect(":scope"),
      transport: rect(":scope > .media-transport-controls"),
      previous: rect(":scope > .media-transport-controls .media-previous-control"),
      play: rect(":scope > .media-transport-controls .media-primary-control"),
      next: rect(":scope > .media-transport-controls .media-next-control"),
      stop: rect(":scope > .media-stop-control"),
      mute: rect(":scope > .media-mute-control"),
      minimize: rect(":scope > .media-minimize"),
      advanced: rect(".media-advanced-summary"),
    };
  });

  for (const [name, box] of Object.entries(geometry)) {
    expect(box, `${name} should stay measurable`).not.toBeNull();
  }

  for (const name of [
    "previous",
    "play",
    "next",
    "stop",
    "mute",
    "minimize",
    "advanced",
  ]) {
    const box = geometry[name as keyof typeof geometry]!;
    expect(box.width, `${name} width`).toBeGreaterThanOrEqual(44 - 0.5);
    expect(box.height, `${name} height`).toBeGreaterThanOrEqual(44 - 0.5);
  }

  const controls = [
    geometry.previous!,
    geometry.play!,
    geometry.next!,
    geometry.stop!,
    geometry.mute!,
    geometry.minimize!,
  ];
  if (viewportWidth >= 360) {
    expect(Math.max(...controls.map((box) => box.y)) - Math.min(...controls.map((box) => box.y))).toBeLessThan(1.5);
  } else {
    expect(geometry.transport!.y).toBeLessThan(geometry.stop!.y - 10);
    expect(Math.max(geometry.stop!.y, geometry.mute!.y, geometry.minimize!.y) - Math.min(geometry.stop!.y, geometry.mute!.y, geometry.minimize!.y)).toBeLessThan(1.5);
  }
}

async function openCatalog(page: Page) {
  await page.goto("/GYSApp-Tauri/kidung");
  await expect(page).toHaveURL(/\/kidung$/);
  await expect(
    page.getByRole("heading", { name: "Kidung", exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  await page
    .locator(".pujian-list > li")
    .first()
    .waitFor({ state: "visible", timeout: 20_000 });
}

async function openFirstHymn(page: Page) {
  await page.goto("/GYSApp-Tauri/kidung/hymn-001");
  await expect(
    page.getByRole("heading", { name: "Pujilah Allah Yang Maha Esa" }),
  ).toBeVisible({ timeout: 20_000 });
}

async function openPlaylistWithSong(page: Page) {
  await openCatalog(page);
  await page.locator(".add-to-playlist-btn").first().click();
  await page.goto("/GYSApp-Tauri/kidung?section=playlist");
  await page
    .locator(".kidung-playlist-list > li")
    .first()
    .waitFor({ state: "visible", timeout: 20_000 });
}

async function openFirstHymnPdf(page: Page) {
  await openFirstHymn(page);
  await page.getByRole("tab", { name: "PDF" }).click();
  await page.locator(".gys-pdf-overlay").waitFor({
    state: "visible",
    timeout: 20_000,
  });
  await page.locator(".pdf-reader").waitFor({
    state: "visible",
    timeout: 30_000,
  });

  const renderedPage = page.locator('.pdf-reader canvas[data-pdf-rendered="true"]').first();
  await expect(renderedPage).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(
      () =>
        renderedPage.evaluate((canvas) => {
          const pageCanvas = canvas as HTMLCanvasElement;
          return pageCanvas.width > 0 && pageCanvas.height > 0;
        }),
      { timeout: 30_000 },
    )
    .toBe(true);
  await expect(page.locator(".gys-pdf-overlay > .loading-panel")).toHaveCount(0);
}

const MIDI_FIXTURE = Buffer.from([
  0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x01,
  0x01, 0xe0, 0x4d, 0x54, 0x72, 0x6b, 0x00, 0x00, 0x00, 0x17, 0x00, 0xff,
  0x51, 0x03, 0x07, 0xa1, 0x20, 0x00, 0xc0, 0x00, 0x00, 0x90, 0x3c, 0x64,
  0x83, 0x60, 0x80, 0x3c, 0x40, 0x00, 0xff, 0x2f, 0x00,
]);
const MIDI_FIXTURE_HASH = createHash("sha256")
  .update(MIDI_FIXTURE)
  .digest("hex");

async function prepareMidiDockFixture(page: Page) {
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (url.endsWith("/offline/music-lock.json")) {
      try {
        const response = await route.fetch();
        const lock = (await response.json()) as {
          items: Array<{
            kind: string;
            path: string;
            size: number;
            sha256: string;
          }>;
        };
        const firstMidi = lock.items.find(
          (item) =>
            item.kind === "midi" &&
            item.path === "assets/midi/001_Pujilah Allah Yang Maha Esa.mid",
        );
        if (!firstMidi) throw new Error("MIDI fixture target is missing");
        firstMidi.size = MIDI_FIXTURE.byteLength;
        firstMidi.sha256 = MIDI_FIXTURE_HASH;
        await route.fulfill({ json: lock });
      } catch {
        await route.continue().catch(() => undefined);
      }
      return;
    }
    if (
      /\.mid(?:\?|$)/i.test(url) ||
      url.includes("/api/v1/content/music")
    ) {
      await route.fulfill({
        body: MIDI_FIXTURE,
        headers: { "content-type": "application/octet-stream" },
      });
      return;
    }
    await route.continue();
  });

  await page.goto("/GYSApp-Tauri/");
  await page.evaluate(async () => {
    const cacheName = "gys-distributed-v1-GeneralUser-GS-e2e";
    const cacheKey =
      "https://gysapp.local/distributed-assets/GeneralUser-GS/e2e";
    const cache = await caches.open(cacheName);
    await cache.put(cacheKey, new Response(new Uint8Array([0])));
    localStorage.setItem(
      "gys-distributed-assets-v1",
      JSON.stringify({
        "GeneralUser-GS": {
          code: "GeneralUser-GS",
          kind: "soundfont",
          version: "e2e",
          releaseTag: "e2e",
          installFileName: "GeneralUser-GS.sf2",
          packageSizeBytes: 1,
          packageChecksumSha256: "e2e",
          cacheName,
          cacheKey,
          payloadBytes: 1,
          installedAt: "2026-09-20T00:00:00.000Z",
        },
      }),
    );
  });
  await page.goto("/GYSApp-Tauri/kidung/hymn-001");
  await expect(
    page.getByRole("button", { name: "Putar MIDI", exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Putar MIDI", exact: true }).click();
  await expect(page.locator(".media-surface.is-kidung-media")).toBeVisible({
    timeout: 20_000,
  });
}

test("Kidung MIDI dock keeps core playback visible and discloses advanced controls", async ({
  page,
}) => {
  test.setTimeout(45_000);
  await prepareMidiDockFixture(page);

  for (const viewport of [
    { width: 320, height: 720, name: "small-phone" },
    { width: 390, height: 844, name: "phone" },
    { width: 768, height: 1024, name: "tablet" },
    { width: 1440, height: 900, name: "desktop" },
  ]) {
    await page.setViewportSize(viewport);
    const media = page.locator(".media-surface.is-kidung-media");
    const advanced = media.locator(".media-advanced-controls");
    await expect(media.locator(".media-queue-badge")).toBeVisible();
    await expect(media.locator(".media-transport-controls")).toBeVisible();
    await expect(media.locator(".media-stop-control")).toBeVisible();
    await expect(media.locator(".media-mute-control")).toBeVisible();
    await expect(media.locator(".media-minimize")).toBeVisible();
    await expect(advanced).not.toHaveAttribute("open", "");
    await expect(media.locator(".media-advanced-summary")).toBeVisible();
    await expectMediaDockGeometry(media, viewport.width);
    await expectNoHorizontalOverflow(page);

    await page.screenshot({
      path: `test-results/ui-preview/kidung-density/media-dock-${viewport.name}.png`,
      fullPage: false,
      animations: "disabled",
    });

    const summary = media.locator(".media-advanced-summary");
    await summary.click();
    await expect(advanced).toHaveAttribute("open", "");
    await expect(media.getByLabel("Instrumen MIDI")).toBeVisible();
    for (const control of await media
      .locator(".media-advanced-panel button, .media-advanced-panel select")
      .all()) {
      await expectTarget(control);
    }
    await expectNoHorizontalOverflow(page);
    await summary.click();
  }
});

test("Kidung desktop dock keeps metadata and adjustments in compact bands", async ({
  page,
}) => {
  test.setTimeout(45_000);
  await prepareMidiDockFixture(page);

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
  ]) {
    await page.setViewportSize(viewport);
    const media = page.locator(".media-surface.is-kidung-media");
    const main = media.locator(":scope > .media-main");
    await expect(main).toBeVisible();

    const geometry = await main.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const children = Array.from(element.children).map((child) => {
        const box = child.getBoundingClientRect();
        return { top: box.top, bottom: box.bottom };
      });
      return {
        height: rect.height,
        bands: new Set(children.map((child) => Math.round(child.top))).size,
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
      };
    });

    expect(geometry.height, `${viewport.width}px dock height`).toBeLessThanOrEqual(128);
    expect(geometry.bands, `${viewport.width}px content bands`).toBeLessThanOrEqual(2);
    expect(geometry.scrollWidth, `${viewport.width}px dock content width`).toBeLessThanOrEqual(geometry.clientWidth);
  }
});

test("wide Kidung catalog shares navigation and filters in one top row", async ({
  page,
}) => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1241, height: 958 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
    { width: 320, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    await openCatalog(page);

    const topbar = page.locator(".kidung-catalog-topbar");
    const nav = topbar.locator(":scope > .kidung-local-nav");
    const header = topbar.locator(":scope > .hymn-page-header");
    await expect(topbar).toBeVisible();
    await expect(nav).toBeVisible();
    await expect(header).toBeVisible();

    const geometry = await topbar.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const nav = element.querySelector<HTMLElement>(".kidung-local-nav")!;
      const header = element.querySelector<HTMLElement>(".hymn-page-header")!;
      const navBox = nav.getBoundingClientRect();
      const headerBox = header.getBoundingClientRect();
      return {
        wrapper: { top: rect.top, bottom: rect.bottom, height: rect.height },
        nav: { top: navBox.top, bottom: navBox.bottom, height: navBox.height },
        header: {
          top: headerBox.top,
          bottom: headerBox.bottom,
          height: headerBox.height,
        },
      };
    });

    if (viewport.width >= 1200) {
      expect(Math.abs(geometry.nav.top - geometry.header.top)).toBeLessThanOrEqual(2);
      expect(geometry.wrapper.height).toBeLessThanOrEqual(
        Math.max(geometry.nav.height, geometry.header.height) + 2,
      );
    } else {
      expect(geometry.header.top).toBeGreaterThanOrEqual(geometry.nav.bottom - 1);
    }

    for (const control of await topbar
      .locator("a, input, .control-select-trigger")
      .all()) {
      if (await control.isVisible()) await expectTarget(control);
    }
    await expectNoHorizontalOverflow(page);
  }
});

test("MIDI session keeps its source, queue, and minimized state across routes", async ({
  page,
}) => {
  test.setTimeout(45_000);
  await page.addInitScript(() => {
    localStorage.removeItem("gys-media-position-v1");
    localStorage.setItem("gys-media-minimized", "0");
  });
  await prepareMidiDockFixture(page);

  const media = page.locator(".media-surface");
  await expect(media).toHaveCount(1);
  await expect(media).toHaveClass(/is-kidung-media/);
  await expect(media.locator(".media-queue-badge")).toBeVisible();
  const title = await media.locator(".media-context-link strong").textContent();
  expect(title).toBe("Pujilah Allah Yang Maha Esa");

  await page.evaluate(() => {
    window.history.pushState({}, "", "/GYSApp-Tauri/");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page.getByRole("heading", { name: /Selamat datang/i })).toBeVisible({
    timeout: 15_000,
  });
  await expect(media).toHaveCount(1);
  await expect(media).toHaveClass(/is-kidung-media/);
  await expect(media.locator(".media-context-link strong")).toHaveText(title!);

  await media.getByRole("button", { name: "Minimalkan pemutar" }).click();
  await expect(media).toHaveClass(/is-minimized/);
  await page.evaluate(() => {
    window.history.pushState({}, "", "/GYSApp-Tauri/bible");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page.getByRole("heading", { name: "Alkitab" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(media).toHaveCount(1);
  await expect(media).toHaveClass(/is-kidung-media/);
  await expect(media.locator(".media-mini-context strong")).toHaveText(title!);
  await media.getByRole("button", { name: /Buka Pujilah Allah Yang Maha Esa/ }).click();
  await expect(page).toHaveURL(/\/kidung\/hymn-001$/);
});

test(
  "phone Kidung catalog prioritizes search, compact filtering, and large library rows",
  async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openCatalog(page);

    const localLinks = page.locator(".kidung-local-nav a");
    for (let index = 0; index < (await localLinks.count()); index += 1) {
      await expectTarget(localLinks.nth(index));
    }

    const search = page.locator(".hymn-catalog-controls .search-field");
    const searchBox = await search.boundingBox();
    expect(searchBox).not.toBeNull();
    expect(searchBox!.width).toBeGreaterThanOrEqual(340);

    await expect(page.locator(".kidung-desktop-filter")).toBeHidden();
    const filterTrigger = page.locator(
      'summary[aria-label="Koleksi"]',
    );
    await expectTarget(filterTrigger);
    await filterTrigger.click();
    const filterPanel = page.locator(".kidung-mobile-filter-panel");
    await expect(filterPanel).toBeVisible();
    await expectTarget(filterPanel.locator(".control-select-trigger"));

    const firstOpen = page.locator(".pujian-title").first();
    const firstNumber = page.locator(".pujian-nomor").first();
    await expect(firstOpen).toBeVisible();
    const openBox = await firstOpen.boundingBox();
    const numberBox = await firstNumber.boundingBox();
    expect(openBox).not.toBeNull();
    expect(numberBox).not.toBeNull();
    expect(openBox!.height).toBeGreaterThanOrEqual(56);
    expect(openBox!.width).toBeGreaterThanOrEqual(230);
    expect(openBox!.x).toBeLessThanOrEqual(numberBox!.x);
    expect(openBox!.x + openBox!.width).toBeGreaterThanOrEqual(
      numberBox!.x + numberBox!.width,
    );
    await expect(firstOpen).toContainText("Pujilah Allah Yang Maha Esa");

    await expectTarget(page.locator(".add-to-playlist-btn").first());
    await expectNoHorizontalOverflow(page);
  },
);

test("fullscreen lyrics keeps its controls localized and contained", async ({
  page,
}) => {
  const copies = {
    id: {
      open: "Mode lirik layar penuh",
      mode: "Mode lirik",
      previousSong: "Lagu sebelumnya",
      play: "Putar",
      close: "Tutup lirik",
      hideControls: "Sembunyikan kontrol lain",
      instrument: "Pilih alat musik",
      tempo: "Tempo dalam BPM",
      previousVerse: "Bait sebelumnya",
      verse: "Bait 1 dari",
    },
    en: {
      open: "Full-screen lyrics mode",
      mode: "Lyrics mode",
      previousSong: "Previous song",
      play: "Play",
      close: "Close lyrics",
      hideControls: "Hide more controls",
      instrument: "Choose an instrument",
      tempo: "Tempo in BPM",
      previousVerse: "Previous verse",
      verse: "Verse 1 of",
    },
    zh: {
      open: "全屏歌词模式",
      mode: "歌词模式",
      previousSong: "上一首",
      play: "播放",
      close: "关闭歌词",
      hideControls: "隐藏更多控制",
      instrument: "选择乐器",
      tempo: "BPM 速度",
      previousVerse: "上一节",
      verse: "第 1 节，共",
    },
  } as const;

  await page.addInitScript(() => {
    const locale = new URLSearchParams(window.location.search).get(
      "__gys_locale",
    );
    if (locale !== "id" && locale !== "en" && locale !== "zh") return;
    localStorage.setItem("gys-locale", locale);
    localStorage.setItem(
      "gys-shell-settings-v1",
      JSON.stringify({ version: 1, locale, theme: "light" }),
    );
  });

  for (const locale of ["id", "en", "zh"] as const) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/GYSApp-Tauri/kidung/hymn-001?__gys_locale=${locale}`);
    await expect(
      page.getByRole("heading", { name: /Pujilah Allah/ }),
    ).toBeVisible({ timeout: 20_000 });
    await page.locator(".hymn-more-actions-summary").click();
    await page.getByRole("button", { name: copies[locale].open }).click();

    const panel = page.getByRole("dialog", { name: copies[locale].mode });
    await expect(panel).toBeVisible();
    await expect(
      panel.getByRole("button", { name: copies[locale].previousSong }),
    ).toBeVisible();
    await expect(
      panel.getByRole("button", { name: copies[locale].play }),
    ).toBeVisible();
    await expect(
      panel.getByRole("button", { name: copies[locale].close }),
    ).toBeVisible();
    await expect(
      panel.getByRole("button", { name: copies[locale].hideControls }),
    ).toBeVisible();
    await expect(
      panel.getByRole("combobox", { name: copies[locale].instrument }),
    ).toBeVisible();
    await expect(
      panel.getByRole("spinbutton", { name: copies[locale].tempo }),
    ).toBeVisible();
    await expect(
      panel.getByRole("button", { name: copies[locale].previousVerse }),
    ).toBeVisible();
    await expect(panel).toContainText(copies[locale].verse);
    await expectNoHorizontalOverflow(page);

    await panel.getByRole("button", { name: copies[locale].close }).click();
    await expect(panel).toHaveCount(0);
  }

  for (const viewport of [
    { width: 320, height: 720 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(
      `/GYSApp-Tauri/kidung/hymn-001?__gys_locale=en&__gys_viewport=${viewport.width}`,
    );
    await expect(
      page.getByRole("heading", { name: /Pujilah Allah/ }),
    ).toBeVisible({ timeout: 20_000 });
    await page.locator(".hymn-more-actions-summary").click();
    await page
      .getByRole("button", { name: copies.en.open })
      .click();
    const panel = page.getByRole("dialog", { name: copies.en.mode });
    await expect(panel).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await panel.getByRole("button", { name: copies.en.close }).click();
  }
});

test("fullscreen lyrics controls keep 44px targets at every reader width", async ({
  page,
}) => {
  for (const viewport of [
    { width: 320, height: 720 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await openFirstHymn(page);
    await page.locator(".hymn-more-actions-summary").click();
    await page
      .getByRole("button", { name: "Mode lirik layar penuh" })
      .click();

    const panel = page.getByRole("dialog", { name: "Mode lirik" });
    await expect(panel).toBeVisible();
    await expectLyricsGeometry(panel, page);
    await expectNoHorizontalOverflow(page);

    await panel.getByRole("button", { name: "Pilih nada dasar" }).click();
    const keyOptions = panel.locator(".lyrics-key-dropdown [role=option]");
    await expect(keyOptions).toHaveCount(12);
    for (let index = 0; index < await keyOptions.count(); index += 1)
      await expectTarget(keyOptions.nth(index));
    await expectNoHorizontalOverflow(page);

    await panel.getByRole("button", { name: "Pilih nada dasar" }).click();
    await panel.getByRole("button", { name: "Tutup lirik" }).click();
  }
});

test("Kidung playlist and reader semantic chrome stays localized", async ({
  page,
}) => {
  const copies = {
    id: {
      playlist: "Playlist",
      import: "Impor",
      export: "Ekspor",
      midiPlaylist: "Playlist MIDI",
      playNext: "Putar berikutnya",
      off: "Tidak ada (stop di akhir)",
      showChords: "Tampilkan chord",
      chordLayer: "Lapisan chord",
      displayedKey: "Nada tampil ·",
      lowerCapo: "Turunkan Capo",
      raiseCapo: "Naikkan Capo",
    },
    en: {
      playlist: "Playlist",
      import: "Import",
      export: "Export",
      midiPlaylist: "MIDI playlist",
      playNext: "Play next",
      off: "None (stop at end)",
      showChords: "Show chords",
      chordLayer: "Chord layer",
      displayedKey: "Displayed key ·",
      lowerCapo: "Lower capo",
      raiseCapo: "Raise capo",
    },
    zh: {
      playlist: "播放列表",
      import: "导入",
      export: "导出",
      midiPlaylist: "MIDI 播放列表",
      playNext: "播放下一首",
      off: "无（结束时停止）",
      showChords: "显示和弦",
      chordLayer: "和弦层",
      displayedKey: "当前调性 ·",
      lowerCapo: "降低变调夹",
      raiseCapo: "升高变调夹",
    },
  } as const;

  await page.addInitScript(() => {
    const locale = new URLSearchParams(window.location.search).get(
      "__gys_locale",
    );
    if (locale !== "id" && locale !== "en" && locale !== "zh") return;
    localStorage.setItem("gys-locale", locale);
    localStorage.setItem(
      "gys-shell-settings-v1",
      JSON.stringify({ version: 1, locale, theme: "light" }),
    );
  });

  for (const locale of ["id", "en", "zh"] as const) {
    const copy = copies[locale];
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(
      `/GYSApp-Tauri/kidung?section=playlist&__gys_locale=${locale}`,
    );
    await expect(
      page.getByRole("heading", { name: copy.playlist, exact: true }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: copy.import })).toBeVisible();
    await expect(page.getByRole("button", { name: copy.export })).toBeVisible();
    await expect(
      page.getByRole("region", { name: copy.midiPlaylist }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: copy.playNext, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(copy.off, { exact: true }),
    ).toBeVisible();

    await page.goto(`/GYSApp-Tauri/kidung/hymn-001?__gys_locale=${locale}`);
    await expect(
      page.getByRole("heading", { name: "Pujilah Allah Yang Maha Esa" }),
    ).toBeVisible({ timeout: 20_000 });
    const showChords = page.getByRole("button", {
      name: copy.showChords,
      exact: true,
    });
    if ((await showChords.count()) > 0) await showChords.click();
    await expect(page.locator(".chord-capability").first()).toHaveAttribute(
      "aria-label",
      copy.chordLayer,
      { timeout: 20_000 },
    );

    await page.locator(".hymn-reader-settings-summary").click();
    await page.locator(".hymn-music-settings > summary").click();
    await expect(
      page.getByText(copy.displayedKey, { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: copy.lowerCapo, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: copy.raiseCapo, exact: true }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
});

test(
  "small-phone hymn titles stay readable instead of shrinking to fit one line",
  async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await openCatalog(page);

    const titles = page.locator(".pujian-title");
    for (let index = 0; index < Math.min(5, await titles.count()); index += 1) {
      const title = titles.nth(index);
      const computed = await title.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          fontSize: Number.parseFloat(style.fontSize),
          lineHeight: Number.parseFloat(style.lineHeight),
          whiteSpace: style.whiteSpace,
        };
      });
      expect(computed.fontSize).toBeGreaterThanOrEqual(13);
      expect(computed.lineHeight).toBeGreaterThanOrEqual(16);
      expect(computed.whiteSpace).not.toBe("nowrap");
      await expectTarget(title, 44);
    }
    await expectNoHorizontalOverflow(page);
  },
);

test(
  "catalog branding and title metrics stay stable through font readiness",
  async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openCatalog(page);

    await expect(page.locator(".brand-mark")).toBeVisible();
    await expect(page.locator(".reader-context-title")).toHaveCount(0);

    const before = await page.locator(".pujian-title").evaluateAll((elements) =>
      elements.slice(0, 8).map((element) => {
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        return {
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          lineHeight: style.lineHeight,
          height: box.height,
        };
      }),
    );
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });
    const after = await page.locator(".pujian-title").evaluateAll((elements) =>
      elements.slice(0, 8).map((element) => {
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        return {
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          lineHeight: style.lineHeight,
          height: box.height,
        };
      }),
    );
    expect(after).toEqual(before);

    const controls = await page.locator(".hymn-catalog-controls").evaluate((element) => {
      const search = element.querySelector<HTMLInputElement>(".search-field input")!;
      const collection = element.querySelector<HTMLElement>(".control-select-trigger")!;
      const labels = [
        element.querySelector<HTMLElement>(".search-field > span"),
        element.querySelector<HTMLElement>(
          ".kidung-desktop-filter .control-select-label",
        ),
      ].filter((label): label is HTMLElement => Boolean(label));
      return {
        searchHeight: search.getBoundingClientRect().height,
        collectionHeight: collection.getBoundingClientRect().height,
        labels: labels.map((label) => ({
          fontSize: getComputedStyle(label).fontSize,
          fontWeight: getComputedStyle(label).fontWeight,
          textTransform: getComputedStyle(label).textTransform,
        })),
      };
    });
    expect(controls.searchHeight).toBe(controls.collectionHeight);
    expect(controls.labels).toHaveLength(2);
    expect(new Set(controls.labels.map((label) => label.fontSize)).size).toBe(1);
    expect(new Set(controls.labels.map((label) => label.fontWeight)).size).toBe(1);
    expect(new Set(controls.labels.map((label) => label.textTransform)).size).toBe(1);
    await expectNoHorizontalOverflow(page);
  },
);

test(
  "phone hymn reader keeps only contextual primary actions on the surface",
  async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openFirstHymn(page);

    const actions = page.locator(
      ".hymn-text-toolbar .detail-actions .hymn-action",
    );
    const actionCount = await actions.count();
    expect(actionCount).toBeGreaterThan(0);
    expect(actionCount).toBeLessThanOrEqual(2);
    for (let index = 0; index < actionCount; index += 1) {
      await expectTarget(actions.nth(index));
    }

    const labels = page.locator(
      ".hymn-text-toolbar .detail-actions .hymn-action-label",
    );
    for (let index = 0; index < (await labels.count()); index += 1) {
      await expect(labels.nth(index)).toBeVisible();
    }

    const more = page.locator(".hymn-more-actions-summary");
    await expectTarget(more);
    await more.click();
    await expect(
      page.getByRole("button", { name: "Mode lirik layar penuh" }),
    ).toBeVisible();

    await expectTarget(page.locator(".hymn-reader-settings-summary"));
    await expectNoHorizontalOverflow(page);
  },
);

test(
  "playlist rows keep low-frequency actions behind one touch-friendly menu",
  async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPlaylistWithSong(page);

    const row = page.locator(".kidung-playlist-list > li").first();
    const menu = row.locator('summary[aria-label^="Opsi"]');
    await expectTarget(menu);
    await menu.click();
    const panel = row.locator(".kidung-row-menu-panel");
    await expect(panel).toBeVisible();

    const buttons = panel.getByRole("button");
    expect(await buttons.count()).toBeGreaterThanOrEqual(4);
    for (let index = 0; index < (await buttons.count()); index += 1) {
      await expectTarget(buttons.nth(index));
    }

    await expect(panel.getByRole("button", { name: "Naikkan" })).toBeVisible();
    await expect(
      panel.getByRole("button", { name: "Turunkan" }),
    ).toBeVisible();
    await expect(
      panel.getByRole("button", { name: "Buka kidung" }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  },
);

test("Kidung dropdown surfaces stay anchored inside the viewport", async ({
  page,
}) => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await openCatalog(page);

    let menu: Locator;
    if (viewport.width < 768) {
      await page.locator('summary[aria-label="Koleksi"]').click();
      const filter = page.locator(".kidung-mobile-filter");
      await filter.locator(".control-select-trigger").click();
      menu = filter.locator(".control-select-menu");
    } else {
      await page
        .locator(".kidung-desktop-filter .control-select-trigger")
        .click();
      menu = page.locator(".kidung-desktop-filter .control-select-menu");
    }
    await expect(menu).toBeVisible();
    const catalogMenuBox = await menu.boundingBox();
    expect(catalogMenuBox).not.toBeNull();
    expect(catalogMenuBox!.x).toBeGreaterThanOrEqual(-1);
    expect(catalogMenuBox!.x + catalogMenuBox!.width).toBeLessThanOrEqual(
      viewport.width + 1,
    );

    if (viewport.width >= 768) {
      await page.goto("/GYSApp-Tauri/kidung?section=settings");
      await expect(
        page.getByRole("heading", { name: "Pengaturan", exact: true }),
      ).toBeVisible({ timeout: 20_000 });
      await page.evaluate(() => window.scrollTo(0, 0));
      const lowerSelect = page
        .locator(".control-select")
        .filter({ hasText: "Jumlah preload" });
      await lowerSelect.getByRole("button", { name: "Jumlah preload" }).click();
      const lowerMenu = lowerSelect.locator(".control-select-menu");
      await expect(lowerMenu).toHaveClass(/is-open-up/);
      const lowerBox = await lowerMenu.boundingBox();
      expect(lowerBox).not.toBeNull();
      expect(lowerBox!.y).toBeGreaterThanOrEqual(-1);
      expect(lowerBox!.y + lowerBox!.height).toBeLessThanOrEqual(
        viewport.height + 1,
      );
    }

    await openFirstHymn(page);
    for (const [summary, panel] of [
      [".hymn-more-actions-summary", ".hymn-more-actions-panel"],
      [
        ".hymn-reader-settings-summary",
        ".hymn-reader-settings > .song-controls",
      ],
    ] as const) {
      await page.locator(summary).click();
      const surface = page.locator(panel);
      await expect(surface).toBeVisible();
      const box = await surface.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(-1);
      expect(box!.y).toBeGreaterThanOrEqual(-1);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
      await page.locator(summary).click();
    }

    await openPlaylistWithSong(page);
    const row = page.locator(".kidung-playlist-list > li").first();
    await row.locator('summary[aria-label^="Opsi"]').click();
    const rowMenu = row.locator(".kidung-row-menu-panel");
    await expect(rowMenu).toBeVisible();
    const rowBox = await rowMenu.boundingBox();
    expect(rowBox).not.toBeNull();
    expect(rowBox!.x).toBeGreaterThanOrEqual(-1);
    expect(rowBox!.y).toBeGreaterThanOrEqual(-1);
    expect(rowBox!.x + rowBox!.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(rowBox!.y + rowBox!.height).toBeLessThanOrEqual(viewport.height + 1);
    await expectNoHorizontalOverflow(page);
  }
});

test(
  "PDF reader exposes contextual music controls with direct song navigation",
  async ({ page }) => {
    test.setTimeout(75_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await openFirstHymnPdf(page);

    const chrome = page.locator(".hymn-pdf-viewer-chrome");
    await expect(
      chrome.getByRole("button", { name: "Sebelumnya", exact: true }),
    ).toBeVisible();
    await expect(
      chrome.getByRole("button", { name: "Berikutnya", exact: true }),
    ).toBeVisible();

    const music = chrome.locator('summary[aria-label="Opsi musik"]');
    await expectTarget(music);
    await music.click();
    const panel = chrome.locator(".pdf-music-menu-panel");
    await expect(panel).toBeVisible();
    await expect(page.locator(".hymn-detail-page > .toast")).toHaveCount(0);
    await expect(panel.locator(".pdf-transpose-inline")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  },
);

test(
  "phone hymn reader keeps only frequent actions visible and moves fullscreen lyrics into overflow",
  async ({ page }) => {
    for (const viewport of [
      { width: 320, height: 720 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await openFirstHymn(page);

      for (const tab of await page.getByRole("tab").all()) {
        await expectTarget(tab);
      }

      const actions = page.locator(
        ".hymn-text-toolbar .detail-actions .hymn-action:visible",
      );
      // MIDI is intentionally hidden until the optional SoundFont is
      // installed. The chord control remains available, so the compact
      // toolbar should expose one or two contextual primary actions depending
      // on the device's installed capabilities.
      const actionCount = await actions.count();
      expect(actionCount).toBeGreaterThanOrEqual(1);
      expect(actionCount).toBeLessThanOrEqual(2);
      for (let index = 0; index < actionCount; index += 1) {
        await expectTarget(actions.nth(index));
      }

      const labels = actions.locator(".hymn-action-label");
      await expect(labels).toHaveCount(actionCount);
      for (let index = 0; index < (await labels.count()); index += 1) {
        await expect(labels.nth(index)).toBeVisible();
      }

      const toolbarBox = await page
        .locator(".hymn-text-toolbar")
        .boundingBox();
      expect(toolbarBox).not.toBeNull();
      expect(toolbarBox!.height).toBeLessThanOrEqual(118);

      const fullscreenLyrics = page.getByRole("button", {
        name: "Mode lirik layar penuh",
      });
      await expect(fullscreenLyrics).toBeHidden();

      const overflow = page.locator(".hymn-more-actions-summary");
      await expectTarget(overflow);
      await overflow.click();
      await expect(fullscreenLyrics).toBeVisible();
      await expectTarget(fullscreenLyrics);

      const panel = page.locator(".hymn-more-actions-panel");
      await expect(panel).toBeVisible();
      const panelBox = await panel.boundingBox();
      const fullscreenBox = await fullscreenLyrics.boundingBox();
      expect(panelBox).not.toBeNull();
      expect(fullscreenBox).not.toBeNull();
      expect(fullscreenBox!.x).toBeGreaterThanOrEqual(panelBox!.x);
      expect(fullscreenBox!.x + fullscreenBox!.width).toBeLessThanOrEqual(
        panelBox!.x + panelBox!.width,
      );
      expect(fullscreenBox!.y).toBeGreaterThanOrEqual(panelBox!.y);
      expect(fullscreenBox!.y + fullscreenBox!.height).toBeLessThanOrEqual(
        panelBox!.y + panelBox!.height,
      );

      await expectTarget(page.locator(".hymn-reader-settings-summary"));
      await expectNoHorizontalOverflow(page);
    }
  },
);

test(
  "tablet and desktop hymn actions preserve labels without crowding",
  async ({ page }) => {
    for (const viewport of [
      { width: 768, height: 1024 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await openFirstHymn(page);
      const labels = page.locator(
        ".hymn-text-toolbar .detail-actions .hymn-action-label",
      );
      for (let index = 0; index < (await labels.count()); index += 1) {
        await expect(labels.nth(index)).toBeVisible();
      }
      await expectNoHorizontalOverflow(page);
    }
  },
);

test(
  "wide hymn text reader keeps controls in a compact, non-overlapping toolbar",
  async ({ page }) => {
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 1241, height: 958 },
      { width: 768, height: 1024 },
    ]) {
      await page.setViewportSize(viewport);
      await openFirstHymn(page);

      const toolbar = page.locator(".hymn-text-toolbar");
      const box = await toolbar.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeLessThanOrEqual(88);

      const geometry = await toolbar.evaluate((element) => {
        const controls = [
          ...element.querySelectorAll<HTMLElement>(
            "button:where(:not([hidden])), select:where(:not([hidden]))",
          ),
        ].filter((control) => {
          const style = getComputedStyle(control);
          const rect = control.getBoundingClientRect();
          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            rect.width > 0 &&
            rect.height > 0
          );
        });
        const boxes = controls.map((control) => {
          const rect = control.getBoundingClientRect();
          return {
            x: rect.x,
            y: rect.y,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          };
        });
        const rowTops = [...new Set(boxes.map((control) => Math.round(control.y)))];
        const overlaps = boxes.some((left, leftIndex) =>
          boxes.some((right, rightIndex) => {
            if (leftIndex >= rightIndex) return false;
            return (
              Math.min(left.right, right.right) - Math.max(left.x, right.x) > 1 &&
              Math.min(left.bottom, right.bottom) - Math.max(left.y, right.y) > 1
            );
          }),
        );
        return { boxes, rowTops, overlaps };
      });

      expect(geometry.rowTops.length).toBeLessThanOrEqual(2);
      expect(geometry.overlaps).toBe(false);
      for (const control of geometry.boxes) {
        expect(control.width).toBeGreaterThanOrEqual(44 - 0.5);
        expect(control.height).toBeGreaterThanOrEqual(44 - 0.5);
      }
      await expectNoHorizontalOverflow(page);
    }
  },
);

test(
  "hymn lyric sheets stay centered in verse and all-verses modes",
  async ({ page }) => {
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 1241, height: 958 },
      { width: 768, height: 1024 },
    ]) {
      await page.setViewportSize(viewport);
      await openFirstHymn(page);
      await page.evaluate(() =>
        localStorage.setItem("gys-hymn-view-scope", "verse"),
      );
      await page.reload();
      await expect(
        page.getByRole("heading", { name: "Pujilah Allah Yang Maha Esa" }),
      ).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(300);

      const verseGeometry = await page.evaluate(() => {
        const surface = document.querySelector<HTMLElement>(
          ".hymn-detail-page.is-text-viewer .hymn-detail-surface",
        )!;
        const sheet = document.querySelector<HTMLElement>(
          ".hymn-detail-page.is-text-viewer .lyrics-sheet",
        )!;
        const surfaceBox = surface.getBoundingClientRect();
        const sheetBox = sheet.getBoundingClientRect();
        return {
          surfaceCenter: (surfaceBox.left + surfaceBox.right) / 2,
          sheetCenter: (sheetBox.left + sheetBox.right) / 2,
        };
      });
      expect(Math.abs(verseGeometry.surfaceCenter - verseGeometry.sheetCenter)).toBeLessThanOrEqual(1);

      await page.getByRole("button", { name: "Semua", exact: true }).click();
      const allVersesGeometry = await page.evaluate(() => {
        const surface = document.querySelector<HTMLElement>(
          ".hymn-detail-page.is-text-viewer .hymn-detail-surface",
        )!;
        const surfaceBox = surface.getBoundingClientRect();
        return Array.from(
          document.querySelectorAll<HTMLElement>(
            ".hymn-detail-page.is-text-viewer .lyrics-sheet.is-continuous",
          ),
        ).map((sheet) => {
          const sheetBox = sheet.getBoundingClientRect();
          return {
            surfaceCenter: (surfaceBox.left + surfaceBox.right) / 2,
            sheetCenter: (sheetBox.left + sheetBox.right) / 2,
          };
        });
      });
      expect(allVersesGeometry.length).toBeGreaterThan(0);
      for (const geometry of allVersesGeometry) {
        expect(Math.abs(geometry.surfaceCenter - geometry.sheetCenter)).toBeLessThanOrEqual(1);
      }
      await expectNoHorizontalOverflow(page);
    }
  },
);

test("all-verses text mode renders canonical chords for every verse", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFirstHymn(page);
  await page.getByRole("button", { name: "Tampilkan chord", exact: true }).click();
  await page.getByRole("button", { name: "Semua", exact: true }).click();

  await expect
    .poll(
      () =>
        page.locator(".hymn-all-verses-container article").evaluateAll((articles) =>
          articles.map((article) => article.querySelectorAll(".chord-capability").length),
        ),
      { timeout: 30_000 },
    )
    .toEqual([4, 4, 4]);
  await expect(page.locator(".hymn-all-verses-container .chord-visual-row")).toHaveCount(12);
  await expectNoHorizontalOverflow(page);
});

test("all-verses mode uses one scroll surface for every complete stanza", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem("gys-hymn-view-scope", "all");
  });
  await page.goto("/GYSApp-Tauri/kidung/hymn-004");
  await expect(
    page.getByRole("heading", { name: "Pujilah Bapa Yang di Surga" }),
  ).toBeVisible({ timeout: 20_000 });

  const geometry = await page.evaluate(() => {
    const container = document.querySelector<HTMLElement>(
      ".hymn-all-verses-container",
    );
    const articles = [
      ...document.querySelectorAll<HTMLElement>(
        ".hymn-all-verses-container > article",
      ),
    ];
    return {
      container: container
        ? {
            clientHeight: container.clientHeight,
            scrollHeight: container.scrollHeight,
            overflowY: getComputedStyle(container).overflowY,
          }
        : null,
      articles: articles.map((article) => ({
        clientHeight: article.clientHeight,
        scrollHeight: article.scrollHeight,
        overflowY: getComputedStyle(article).overflowY,
      })),
    };
  });

  expect(geometry.container?.overflowY).toBe("auto");
  expect(geometry.container?.scrollHeight).toBeGreaterThan(
    geometry.container?.clientHeight ?? 0,
  );
  expect(geometry.articles.length).toBeGreaterThan(1);
  for (const article of geometry.articles) {
    expect(article.overflowY).toBe("visible");
    expect(article.scrollHeight).toBeLessThanOrEqual(article.clientHeight + 1);
  }
  await expectNoHorizontalOverflow(page);
});

const visualCases = [
  ["catalog-small-phone-320x720", 320, 720, "catalog", "light"],
  ["catalog-phone-390x844", 390, 844, "catalog", "light"],
  ["catalog-large-phone-430x932", 430, 932, "catalog", "light"],
  ["catalog-tablet-768x1024", 768, 1024, "catalog", "light"],
  ["catalog-landscape-1024x768", 1024, 768, "catalog", "light"],
  ["catalog-desktop-1440x900", 1440, 900, "catalog", "light"],
  ["playlist-phone-390x844", 390, 844, "playlist", "light"],
  ["playlist-tablet-768x1024", 768, 1024, "playlist", "light"],
  ["reader-text-small-phone-320x720", 320, 720, "reader", "light"],
  ["reader-text-phone-390x844", 390, 844, "reader", "light"],
  ["reader-text-tablet-768x1024", 768, 1024, "reader", "light"],
  ["reader-text-desktop-1440x900", 1440, 900, "reader", "light"],
  ["reader-text-wide-1920x1080", 1920, 1080, "reader", "light"],
  ["reader-pdf-phone-390x844", 390, 844, "pdf", "light"],
  ["reader-pdf-tablet-768x1024", 768, 1024, "pdf", "light"],
  ["reader-pdf-desktop-1440x900", 1440, 900, "pdf", "light"],
  ["reader-dark-phone-390x844", 390, 844, "reader", "dark"],
  ["reader-dark-tablet-768x1024", 768, 1024, "reader", "dark"],
  ["playlist-menu-phone-390x844", 390, 844, "playlist-menu", "light"],
  ["reader-more-phone-390x844", 390, 844, "reader-more", "light"],
  ["reader-settings-phone-390x844", 390, 844, "reader-settings", "light"],
  ["pdf-music-phone-390x844", 390, 844, "pdf-music", "light"],
] as const;

for (const [name, width, height, surface, theme] of visualCases) {
  test(`Kidung visual ${name}`, async ({ page }) => {
    test.setTimeout(surface === "pdf" || surface === "pdf-music" ? 75_000 : 45_000);
    await page.setViewportSize({ width, height });

    if (surface === "catalog") await openCatalog(page);
    if (surface === "playlist") await openPlaylistWithSong(page);
    if (surface === "reader") await openFirstHymn(page);
    if (surface === "pdf") await openFirstHymnPdf(page);
    if (surface === "playlist-menu") {
      await openPlaylistWithSong(page);
      const row = page.locator(".kidung-playlist-list > li").first();
      await row.locator('summary[aria-label^="Opsi"]').click();
      await expect(row.locator(".kidung-row-menu-panel")).toBeVisible();
    }
    if (surface === "reader-more") {
      await openFirstHymn(page);
      await page.locator(".hymn-more-actions-summary").click();
      await expect(page.locator(".hymn-more-actions-panel")).toBeVisible();
    }
    if (surface === "reader-settings") {
      await openFirstHymn(page);
      await page.locator(".hymn-reader-settings-summary").click();
      await expect(
        page.locator(".hymn-reader-settings > .song-controls"),
      ).toBeVisible();
    }
    if (surface === "pdf-music") {
      await openFirstHymnPdf(page);
      await page.locator('summary[aria-label="Opsi musik"]').click();
      await expect(page.locator(".pdf-music-menu-panel")).toBeVisible();
    }

    await page.evaluate((nextTheme) => {
      document.documentElement.dataset.theme = nextTheme;
    }, theme);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: `test-results/ui-preview/kidung-density/${name}.png`,
      fullPage: false,
      animations: "disabled",
    });
  });
}
