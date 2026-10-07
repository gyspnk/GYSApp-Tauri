import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("unavailable reflection preserves readable columns at desktop breakpoints", async ({
  page,
}) => {
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.route("**/offline/sauh.json", (route) =>
    route.fulfill({ json: { items: [] } }),
  );
  for (const width of [960, 1024, 1199, 1200, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/GYSApp-Tauri/");
    await expect(page.locator(".sauh-offline-state")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.locator(".home-grid").evaluate(async (element) => {
      await Promise.all(
        element
          .getAnimations({ subtree: true })
          .filter(
            (animation) =>
              animation.effect?.getTiming().iterations !== Infinity,
          )
          .map((animation) => animation.finished.catch(() => undefined)),
      );
    });
    const verse = (await page.locator(".verse-panel").boundingBox())!;
    const reading = (await page.locator(".continue-panel").boundingBox())!;
    const shelf = (await page.locator(".home-suara-section").boundingBox())!;
    if (
      width < 1200 ||
      (await page.locator(".continue-panel .empty-inline").count())
    ) {
      expect(verse.width).toBeGreaterThan(500);
      expect(reading.y).toBeGreaterThanOrEqual(verse.y + verse.height + 19);
    } else {
      expect(Math.abs(verse.y - reading.y)).toBeLessThan(1);
      expect(reading.x).toBeGreaterThanOrEqual(verse.x + verse.width);
      expect(shelf.x).toBe(verse.x);
      expect(shelf.x + shelf.width).toBeGreaterThanOrEqual(
        reading.x + reading.width - 1,
      );
      expect(shelf.y).toBeGreaterThanOrEqual(
        Math.max(verse.y + verse.height, reading.y + reading.height),
      );
    }
  }
});

for (const theme of ["light", "dark", "sepia", "amoled", "system"] as const) {
  test(`editorial reading remains accessible on ${theme} paper`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
    await page.addInitScript(
      (theme) =>
        localStorage.setItem(
          "gys-shell-settings-v1",
          JSON.stringify({ version: 1, locale: "id", theme }),
        ),
      theme,
    );
    await page.route(/^https:\/\//, (route) => route.abort());
    for (const [route, ready] of [
      ["/", ".home-portals"],
      ["/iman", ".faith-row"],
      ["/literatur", ".literature-row"],
    ]) {
      await page.goto(`/GYSApp-Tauri${route}`);
      await expect(page.locator(ready!).first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator("h1")).toBeVisible();
      const results = await new AxeBuilder({ page }).analyze();
      expect(
        results.violations,
        JSON.stringify(results.violations, null, 2),
      ).toEqual([]);
    }
  });
}

test("first visit offers working reading destinations and a visible hymn index title", async ({
  page,
}) => {
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/GYSApp-Tauri/");
  const start = page.locator(".home-portals");
  await start.getByRole("link", { name: "Alkitab" }).click();
  await expect(page.locator(".verse-row").first()).toBeVisible();
  await page.goto("/GYSApp-Tauri/");
  // Reading history appears below the persistent direct actions.
  await expect(
    page.locator(".continue-panel").getByRole("link").first(),
  ).toHaveAttribute("href", /bible/);
  await page.goto("/GYSApp-Tauri/kidung");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("desktop chapter and split readers fill the available content width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/GYSApp-Tauri/bible");
  await expect(page.locator(".verse-row").first()).toBeVisible();
  const single = await page.locator(".bible-reader").boundingBox();
  const region = await page.locator(".bible-page").boundingBox();
  expect(single!.width).toBeGreaterThan(region!.width - 48);
  expect(single!.x).toBeGreaterThanOrEqual(region!.x);
  expect(single!.x + single!.width).toBeLessThanOrEqual(
    region!.x + region!.width,
  );
  await page.getByRole("button", { name: "Menu Alkitab" }).click();
  await page.getByText("Tampilan Belah", { exact: true }).click();
  await expect(page.locator(".bible-pane")).toHaveCount(2);
  const split = await page.locator(".bible-reader").boundingBox();
  expect(Math.abs(split!.width - single!.width)).toBeLessThanOrEqual(1);
  const panes = await page
    .locator(".bible-pane")
    .evaluateAll((elements) =>
      elements.map((el) => el.getBoundingClientRect().width),
    );
  expect(Math.abs(panes[0]! - panes[1]!)).toBeLessThanOrEqual(1);
});

test("offline cover placeholders stay legible and rows do not move on hover", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/GYSApp-Tauri/literatur");
  const row = page.locator(".literature-row").first();
  await expect(row).toBeVisible();
  const cover = row.locator(
    '.literature-cover[data-image-state="error"], .literature-cover[data-image-state="missing"]',
  );
  await expect(cover.locator(".img-fallback-art")).toBeVisible();
  const title = row.locator(".literature-copy");
  const before = await title.boundingBox();
  await row.hover();
  const after = await title.boundingBox();
  expect(after?.x).toBe(before?.x);
  expect(
    await cover
      .locator(".img-fallback-placeholder")
      .evaluate((element) => getComputedStyle(element, "::before").content),
  ).toBe("none");
});

test("bundled fonts load with all external requests blocked", async ({
  page,
}) => {
  const fonts: string[] = [];
  page.on("response", (response) => {
    if (response.url().endsWith(".woff2") && response.ok())
      fonts.push(response.url());
  });
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/GYSApp-Tauri/kidung");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(fonts.some((url) => url.includes("gys-reading-sans"))).toBe(true);
  expect(
    await page.evaluate(() => document.fonts.check('16px "GYS Reading Sans"')),
  ).toBe(true);
  await page.goto("/GYSApp-Tauri/iman");
  await expect(page.locator(".faith-statement").first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(fonts.some((url) => url.includes("source-serif-4"))).toBe(true);
  expect(
    await page.evaluate(() => document.fonts.check('18px "Source Serif 4"')),
  ).toBe(true);
});

for (const [locale, close] of [
  ["id", "Tutup rujukan"],
  ["en", "Close references"],
  ["zh", "关闭引用"],
] as const) {
  test(`inline cross-reference stays with the verse and supports the keyboard (${locale})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(
      (locale) =>
        localStorage.setItem(
          "gys-shell-settings-v1",
          JSON.stringify({ version: 1, locale, theme: "light" }),
        ),
      locale,
    );
    await page.goto("/GYSApp-Tauri/bible");
    const reference = page.locator(".bible-crossref-inline").first();
    await expect(reference).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const sameLine = await reference.evaluate((element) => {
      const text = element.previousElementSibling!;
      const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
      let last: Text | null = null;
      while (walker.nextNode()) last = walker.currentNode as Text;
      const range = document.createRange();
      range.setStart(last!, last!.length - 1);
      range.setEnd(last!, last!.length);
      const character = range.getBoundingClientRect(),
        star = element.getBoundingClientRect();
      return star.top < character.bottom && star.bottom > character.top;
    });
    expect(sameLine).toBe(true);
    await reference.focus();
    await expect(reference).toBeFocused();
    await reference.press("Enter");
    await expect(page.locator(".bible-crossref-modal")).toBeVisible();
    await page.locator(".bible-crossref-header button").click();
    await reference.focus();
    await reference.press("Space");
    await expect(page.locator(".bible-crossref-modal")).toBeVisible();
    await expect(
      page.locator(".bible-crossref-header button"),
    ).toHaveAccessibleName(close);
  });
}

for (const theme of ["light", "dark", "sepia", "amoled", "system"] as const) {
  test(`all settings disclosures remain accessible on ${theme}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
    await page.addInitScript(
      (theme) =>
        localStorage.setItem(
          "gys-shell-settings-v1",
          JSON.stringify({ version: 1, locale: "id", theme }),
        ),
      theme,
    );
    await page.route(/^https:\/\//, (route) => route.abort());
    await page.goto("/GYSApp-Tauri/lainnya");
    const sections = page.locator(
      ".more-settings-list > .more-setting-section",
    );
    await expect(sections).toHaveCount(7);
    for (const section of await sections.all()) {
      await section.locator(":scope > summary").click();
      await page.evaluate(() => document.fonts.ready);
      const results = await new AxeBuilder({ page }).analyze();
      expect(
        results.violations,
        JSON.stringify(results.violations, null, 2),
      ).toEqual([]);
      await section.locator(":scope > summary").click();
    }
  });
}

for (const accent of ["#ffff00", "#797979"]) {
  test(`custom accent ${accent} keeps the login action readable across themes`, async ({
    page,
  }) => {
    await page.addInitScript(
      (accent) => localStorage.setItem("gys-accent-color", accent),
      accent,
    );
    await page.route(/^https:\/\//, (route) => route.abort());
    await page.goto("/GYSApp-Tauri/lainnya");
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (theme) => (document.documentElement.dataset.theme = theme),
        theme,
      );
      await expect(
        page.getByRole("button", { name: "Login dengan Google", exact: true }),
      ).toBeVisible();
      const results = await new AxeBuilder({ page }).analyze();
      expect(
        results.violations,
        JSON.stringify(results.violations, null, 2),
      ).toEqual([]);
    }
  });
}
