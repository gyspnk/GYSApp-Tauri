import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("a new reader can start from Home without an empty activity dead end", async ({
  page,
}) => {
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/GYSApp-Tauri/");
  const start = page.getByRole("link", { name: "Mulai membaca", exact: true });
  await expect(start).toBeVisible();
  await start.click();
  await expect(page).toHaveURL(/\/bible$/);
  await expect(page.locator(".verse-row").first()).toBeVisible();
});

test("tablet literature shelves keep readable titles and reachable last cards", async ({
  page,
}, testInfo) => {
  await page.route(/^https:\/\//, (route) => route.abort());
  for (const width of [600, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/GYSApp-Tauri/literatur");
    const cards = page.locator(".literature-shelf-item");
    await expect(cards.first()).toBeVisible();
    const title = (await cards.first().locator("strong").boundingBox())!;
    expect(title.width).toBeGreaterThanOrEqual(130);
    await cards.last().scrollIntoViewIfNeeded();
    const last = (await cards.last().boundingBox())!;
    expect(last.x).toBeGreaterThanOrEqual(0);
    expect(last.x + last.width).toBeLessThanOrEqual(width);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`literature-tablet-${width}.png`),
      animations: "disabled",
    });
  }
});

for (const width of [390, 1440]) {
  test(`review complete UI surfaces at ${width}px`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route(/^https:\/\//, (route) => route.abort());
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const [name, route, ready] of [
      ["home", "/", ".home-grid"],
      ["bible", "/bible", ".verse-row"],
      ["kidung", "/kidung", ".pujian-title"],
      ["hymn-text", "/kidung/hymn-001?mode=lyrics", ".lyrics-sheet"],
      ["playlist", "/kidung?section=playlist", ".kidung-queue-surface"],
      ["hymn-settings", "/kidung?section=settings", ".kidung-settings-layout"],
      ["faith", "/iman", ".faith-row"],
      ["literature", "/literatur", ".literature-row"],
      ["suara", "/suara", ".suara-library-item"],
      ["sauh", "/sauh", ".sauh-page"],
      ["settings", "/lainnya", ".more-setting-row"],
    ]) {
      await page.goto(`/GYSApp-Tauri${route}`);
      await expect(page.locator(ready!).first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`${name}-${width}.png`),
        animations: "disabled",
      });
    }
    expect(errors).toEqual([]);
  });
}

test("route motion leaves fixed reading dialogs attached to the viewport", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/GYSApp-Tauri/bible");
  await expect(page.locator(".verse-text").first()).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".route-view")
        .evaluate((element) => getComputedStyle(element).transform),
    )
    .toBe("none");
  await page.locator(".verse-text").first().click();
  await page.getByRole("button", { name: "Catatan ayat", exact: true }).click();
  const backdrop = page.locator(".bible-notes-backdrop");
  await expect(backdrop).toBeVisible();
  const box = (await backdrop.boundingBox())!;
  expect(box.x).toBe(0);
  expect(box.y).toBe(0);
  expect(box.width).toBe(390);
  expect(box.height).toBe(844);
});

test("search entrance motion preserves its 44px close target", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/GYSApp-Tauri/iman");
  await page.locator(".search-trigger").click();
  const dialog = page.locator(".global-search");
  await expect(dialog).toBeVisible();
  await dialog.evaluate((element) => {
    for (const animation of element.getAnimations()) {
      animation.pause();
      animation.currentTime = 0;
    }
  });
  const close = (await dialog.locator(".global-search-close").boundingBox())!;
  expect(close.width).toBeGreaterThanOrEqual(44);
  expect(close.height).toBeGreaterThanOrEqual(44);
  await dialog.locator("input").press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".search-trigger")).toBeFocused();
});

test("missing daily artwork stays compact while keeping the reading action", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-01T08:00:00+07:00"));
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.route("**/offline/sauh.json", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: "sbj261001",
            title: "Renungan hari ini",
            reference: "Yohanes 3:16",
            verse: "Karena begitu besar kasih Allah akan dunia ini.",
            body: "Renungan.",
            url: "https://tjc.org/id/gerakan-baca-alkitab/sbj261001/",
            updatedAt: "2026-10-01T01:00:00Z",
            source: "tjc.org",
          },
        ],
      },
    }),
  );
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/GYSApp-Tauri/");
    await expect(
      page.locator('.sauh-image-wrap[data-image-state="missing"]'),
    ).toBeVisible();
    const media = (await page.locator(".sauh-card-media").boundingBox())!;
    expect(media.height).toBeCloseTo(72, 1);
    await expect(
      page.getByRole("link", { name: "Baca Lebih Lanjut →" }),
    ).toBeVisible();
  }
});

test("reduced motion covers search, settings disclosures, menus and loading artwork", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/GYSApp-Tauri/lainnya");
  await page.locator('[data-setting="appearance"] > summary').click();
  await page.getByRole("combobox", { name: "Pilih Tema", exact: true }).click();
  await expect(page.getByRole("listbox")).toBeVisible();
  for (const selector of [
    ".route-view",
    ".more-setting-row > svg",
    ".control-select-menu",
  ]) {
    expect(
      await page
        .locator(selector)
        .first()
        .evaluate((element) => ({
          animation: getComputedStyle(element).animationName,
          transition: getComputedStyle(element).transitionDuration,
        })),
    ).toEqual({ animation: "none", transition: "0s" });
  }
});

for (const [locale, label] of [
  ["id", "Jelajahi koleksi"],
  ["en", "Explore the collection"],
  ["zh", "探索馆藏"],
] as const) {
  test(`collection hub remains discoverable and usable (${locale})`, async ({
    page,
  }, testInfo) => {
    await page.addInitScript(
      (locale) =>
        localStorage.setItem(
          "gys-shell-settings-v1",
          JSON.stringify({ version: 1, locale, theme: "light" }),
        ),
      locale,
    );
    await page.route(/^https:\/\//, (route) => route.abort());
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/GYSApp-Tauri/lainnya");
      const hub = page.getByRole("navigation", { name: label, exact: true });
      await expect(hub.getByRole("link")).toHaveCount(3);
      for (const route of ["literatur", "suara", "sauh"]) {
        const link = hub.locator(`a[href$='/${route}']`);
        await expect(link).toBeVisible();
        const box = (await link.boundingBox())!;
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
      }
      await page.screenshot({
        path: testInfo.outputPath(`hub-${locale}-${width}.png`),
        animations: "disabled",
      });
      await hub.locator("a[href$='/literatur']").click();
      await expect(page).toHaveURL(/\/literatur$/);
      await expect(page.locator(".literature-row").first()).toBeVisible();
    }
  });
}

for (const theme of ["light", "dark"] as const) {
  test(`header and active navigation remain readable across layouts on ${theme}`, async ({
    page,
  }) => {
    await page.addInitScript(
      (theme) =>
        localStorage.setItem(
          "gys-shell-settings-v1",
          JSON.stringify({ version: 1, locale: "id", theme }),
        ),
      theme,
    );
    await page.route(/^https:\/\//, (route) => route.abort());
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/GYSApp-Tauri/kidung");
      await expect(page.locator(".pujian-item").first()).toBeVisible();
      const result = await new AxeBuilder({ page })
        .include(".topbar")
        .include(".navigation-shell")
        .withRules(["color-contrast"])
        .analyze();
      expect(result.violations).toEqual([]);
    }
  });
}

test("reader icons stay centered and secondary actions retain readable labels", async ({
  page,
}) => {
  await page.route(/^https:\/\//, (route) => route.abort());
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=lyrics");
    const toolbar = page.locator(".hymn-text-toolbar");
    await expect(toolbar).toBeVisible();
    const offsets = await toolbar
      .locator(".detail-actions > .hymn-action")
      .evaluateAll((buttons) =>
        buttons.map((button) => {
          const box = button.getBoundingClientRect();
          const icon = button.querySelector("svg")!.getBoundingClientRect();
          return {
            x: Math.abs(box.x + box.width / 2 - icon.x - icon.width / 2),
            y: Math.abs(box.y + box.height / 2 - icon.y - icon.height / 2),
          };
        }),
      );
    for (const offset of offsets) {
      expect(offset.x).toBeLessThanOrEqual(1);
      expect(offset.y).toBeLessThanOrEqual(1);
    }
    await toolbar.locator(".hymn-more-actions-summary").click();
    const labels = toolbar.locator(
      ".hymn-more-actions-panel .hymn-action-label",
    );
    expect(await labels.count()).toBeGreaterThan(0);
    for (const label of await labels.all()) {
      await expect(label).toBeVisible();
      const box = (await label.boundingBox())!;
      expect(box.width).toBeGreaterThan(20);
      expect(box.height).toBeGreaterThan(10);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.goto("/GYSApp-Tauri/bible");
    const picker = page.locator(".reader-context-book-picker");
    await expect(picker).toContainText("Kejadian 1");
    const button = (await picker.boundingBox())!;
    const chevron = (await picker
      .locator(".picker-chevron svg")
      .boundingBox())!;
    expect(
      Math.abs(button.y + button.height / 2 - chevron.y - chevron.height / 2),
    ).toBeLessThanOrEqual(1);
  }
});
