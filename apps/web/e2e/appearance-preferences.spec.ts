import { expect, test, type Locator, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// This contract deliberately writes screenshots from real Chromium so visual
// acceptance is based on the rendered application rather than a mockup.
const previewDir = path.resolve("test-results", "ui-preview");

/**
 * Doubling the root size reflows every surface, so wait for the font set and
 * two frames before judging overflow. The assertion is unchanged; only the
 * settle window grows, because a loaded runner can take longer than the
 * default expect timeout to finish the reflow.
 */
async function expectContainedAtDoubleText(page: Page) {
  await page.evaluate(async () => {
    document.documentElement.style.fontSize = "200%";
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      { timeout: 10_000 },
    )
    .toBe(true);
}

async function openAppearance(page: Page): Promise<Locator> {
  await page.goto("/GYSApp-Tauri/lainnya");
  await page.locator('[data-setting="appearance"] > summary').click();
  const card = page.locator(".appearance-card");
  await expect(card).toBeVisible();
  return card;
}

/** The shared listbox needs a real click on its trigger, then a click on the
 * option; the trigger is a combobox named by the row label. */
async function choosePreference(
  page: Page,
  label: string,
  option: string,
): Promise<void> {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function savePreview(page: Page, name: string): Promise<void> {
  fs.mkdirSync(previewDir, { recursive: true });
  await page.screenshot({
    path: path.join(previewDir, name),
    fullPage: false,
    animations: "disabled",
  });
}

test("density and font are inline rows in the appearance group, not a modal", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const card = await openAppearance(page);

  // The old design opened a second surface for the same two choices; the
  // appearance group must stay one list of label/control rows.
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(card.locator(".ui-preferences-open")).toHaveCount(0);

  const rows = card.locator(".appearance-setting-row");
  await expect(rows).toHaveCount(4);
  const labels = await rows
    .locator(".appearance-setting-name")
    .allTextContents();
  expect(labels.map((label) => label.trim())).toEqual([
    "Tema Layar",
    "Warna Aksen",
    "Kepadatan",
    "Gaya huruf",
  ]);

  // Every row keeps the same label column; the accent row shows a value and
  // puts its 44px targets in the palette underneath, the other three carry a
  // select trigger.
  const geometry = await rows.evaluateAll((elements) =>
    elements.map((element) => {
      const name = element.querySelector(".appearance-setting-name");
      const trigger = element.querySelector(".control-select-trigger");
      const rowBox = element.getBoundingClientRect();
      return {
        rowHeight: rowBox.height,
        nameLeft: name ? name.getBoundingClientRect().left : -1,
        triggerHeight: trigger ? trigger.getBoundingClientRect().height : null,
      };
    }),
  );
  const lefts = new Set(geometry.map((row) => Math.round(row.nameLeft)));
  expect(lefts.size, "every row starts its label at the same x").toBe(1);
  for (const row of geometry) {
    expect(row.rowHeight).toBeGreaterThanOrEqual(44);
    if (row.triggerHeight !== null) {
      expect(row.triggerHeight).toBeGreaterThanOrEqual(43.5);
    }
  }
  const swatches = await card
    .locator('.accent-palette-grid [role="radio"]')
    .evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().height),
    );
  expect(swatches.length).toBeGreaterThan(0);
  for (const height of swatches) expect(height).toBeGreaterThanOrEqual(43.5);
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
});

test("appearance preferences apply immediately and survive reload/navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await openAppearance(page);

  await expect(page.locator("html")).toHaveAttribute(
    "data-ui-density",
    "standard",
  );
  await expect(page.locator("html")).toHaveAttribute("data-ui-font", "auto");

  await choosePreference(page, "Kepadatan", "Nyaman");
  await expect(page.locator("html")).toHaveAttribute(
    "data-ui-density",
    "comfortable",
  );
  await choosePreference(page, "Gaya huruf", "Himne");
  await expect(page.locator("html")).toHaveAttribute("data-ui-font", "hymnal");

  await savePreview(page, "appearance-comfortable-tablet-768x1024.png");

  await page.goto("/GYSApp-Tauri/bible");
  await expect(page.locator("html")).toHaveAttribute(
    "data-ui-density",
    "comfortable",
  );
  await expect(page.locator("html")).toHaveAttribute("data-ui-font", "hymnal");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute(
    "data-ui-density",
    "comfortable",
  );
  await expect(page.locator("html")).toHaveAttribute("data-ui-font", "hymnal");

  const headingFont = await page
    .locator("h1")
    .evaluate((element) => getComputedStyle(element).fontFamily);
  expect(headingFont.toLowerCase()).toContain("source serif 4");
});

test("compact mode stays touch-safe and keeps the appearance rows reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const card = await openAppearance(page);
  await choosePreference(page, "Kepadatan", "Ringkas");
  await expect(page.locator("html")).toHaveAttribute(
    "data-ui-density",
    "compact",
  );

  const fontRow = card
    .locator(".appearance-setting-row")
    .filter({ hasText: "Gaya huruf" });
  await fontRow.scrollIntoViewIfNeeded();
  await expect(fontRow).toBeInViewport();

  const navTargets = page.locator(".navigation-shell .nav-item");
  const undersized = await navTargets.evaluateAll((elements) =>
    elements.flatMap((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 &&
        rect.height > 0 &&
        (rect.width < 43.5 || rect.height < 43.5)
        ? [`${rect.width}x${rect.height}`]
        : [];
    }),
  );
  expect(undersized).toEqual([]);
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);

  await savePreview(page, "appearance-compact-phone-390x844.png");
});

test("standard desktop, automatic font, and sans font remain readable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const card = await openAppearance(page);
  await choosePreference(page, "Kepadatan", "Standar");
  await choosePreference(page, "Gaya huruf", "Sans modern");
  await expect(page.locator("html")).toHaveAttribute("data-ui-font", "sans");
  const sansHeadingFont = await card
    .locator(".appearance-setting-name")
    .first()
    .evaluate((element) => getComputedStyle(element).fontFamily);
  expect(sansHeadingFont.toLowerCase()).not.toContain("source serif 4");

  await choosePreference(page, "Gaya huruf", "Otomatis");
  await expect(page.locator("html")).toHaveAttribute(
    "data-ui-density",
    "standard",
  );
  await expect(page.locator("html")).toHaveAttribute("data-ui-font", "auto");
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await savePreview(page, "appearance-standard-desktop-1440x900.png");
});

test("appearance controls stay legible with the existing dark theme", async ({
  page,
}) => {
  await page.addInitScript(() => {
    // The versioned envelope wins over the legacy `gys-theme` key.
    window.localStorage.setItem(
      "gys-shell-settings-v1",
      JSON.stringify({
        version: 1,
        locale: "id",
        theme: "dark",
        onboarded: true,
      }),
    );
  });
  await page.setViewportSize({ width: 768, height: 1024 });
  await openAppearance(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await choosePreference(page, "Kepadatan", "Nyaman");
  await expect(page.locator("html")).toHaveAttribute(
    "data-ui-density",
    "comfortable",
  );
  await savePreview(page, "appearance-dark-comfortable-tablet-768x1024.png");
});

test("the density listbox is keyboard operable and closes on Escape", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openAppearance(page);
  const trigger = page.getByRole("combobox", {
    name: "Kepadatan",
    exact: true,
  });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute(
    "data-ui-density",
    "compact",
  );
  await expect(trigger).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("html")).toHaveAttribute(
    "data-ui-density",
    "compact",
  );
});

test("reduced motion keeps the appearance rows usable without nonessential animation", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  const card = await openAppearance(page);
  const transitionDuration = await card.evaluate(
    (element) => getComputedStyle(element).transitionDuration,
  );
  expect(
    transitionDuration.split(",").every((value) => value.trim() === "0s"),
  ).toBe(true);
  await choosePreference(page, "Gaya huruf", "Himne");
  await expect(page.locator("html")).toHaveAttribute("data-ui-font", "hymnal");
});

test("every preference row is visible on a small phone before any selection", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  const card = await openAppearance(page);
  for (const label of [
    "Tema Layar",
    "Warna Aksen",
    "Kepadatan",
    "Gaya huruf",
  ]) {
    const row = card
      .locator(".appearance-setting-row")
      .filter({ hasText: label });
    await row.scrollIntoViewIfNeeded();
    await expect(row).toBeVisible();
  }
});

test("preferences contain enlarged text without document overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  const card = await openAppearance(page);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await card
    .locator(".appearance-setting-row")
    .filter({ hasText: "Gaya huruf" })
    .scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
});

test("Bible and Kidung stay within a phone viewport for every locale and theme at 200% text", async ({
  page,
}) => {
  // 3 locales x 5 themes x 2 routes, each with a reflow settle window.
  test.setTimeout(180_000);
  const locales = [
    { value: "id", bible: "Alkitab", kidung: "Kidung" },
    { value: "en", bible: "Bible", kidung: "Hymns" },
    { value: "zh", bible: "圣经", kidung: "诗歌" },
  ] as const;
  const themes = ["light", "dark", "system", "amoled", "sepia"] as const;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/GYSApp-Tauri/lainnya");

  for (const locale of locales) {
    for (const theme of themes) {
      await page.evaluate(
        ({ locale: nextLocale, theme: nextTheme }) => {
          const settings = JSON.stringify({
            version: 1,
            locale: nextLocale,
            theme: nextTheme,
          });
          localStorage.setItem("gys-shell-settings-v1", settings);
          localStorage.setItem("gys-locale", nextLocale);
          localStorage.setItem("gys-theme", nextTheme);
        },
        { locale: locale.value, theme },
      );

      for (const route of [
        { path: "/GYSApp-Tauri/bible", title: locale.bible },
        { path: "/GYSApp-Tauri/kidung", title: locale.kidung },
      ]) {
        await page.goto(route.path);
        await expect(page.locator("html")).toHaveAttribute(
          "lang",
          locale.value,
        );
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        const heading = page.getByRole("heading", {
          level: 1,
          name: route.title,
          exact: true,
        });
        await expect(heading).toBeVisible();
        await expectContainedAtDoubleText(page);
        await expect(heading).toBeVisible();
      }
    }
  }
});

test("content routes stay contained across every locale and theme at 200% text", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const locales = ["id", "en", "zh"] as const;
  const themes = ["light", "dark", "system", "amoled", "sepia"] as const;
  const routes = [
    { path: "/GYSApp-Tauri/", selector: ".home-grid" },
    { path: "/GYSApp-Tauri/iman", selector: ".faith-page" },
    { path: "/GYSApp-Tauri/literatur", selector: ".literature-page" },
    { path: "/GYSApp-Tauri/sauh", selector: "[data-testid='sauh-page']" },
    { path: "/GYSApp-Tauri/suara", selector: ".suara-page" },
    { path: "/GYSApp-Tauri/lainnya", selector: ".more-page" },
  ] as const;

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/GYSApp-Tauri/lainnya");

  for (const locale of locales) {
    for (const theme of themes) {
      await page.evaluate(
        ({ nextLocale, nextTheme }) => {
          const settings = JSON.stringify({
            version: 1,
            locale: nextLocale,
            theme: nextTheme,
          });
          localStorage.setItem("gys-shell-settings-v1", settings);
          localStorage.setItem("gys-locale", nextLocale);
          localStorage.setItem("gys-theme", nextTheme);
        },
        { nextLocale: locale, nextTheme: theme },
      );

      for (const route of routes) {
        await page.goto(route.path);
        await expect(page.locator(route.selector)).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expectContainedAtDoubleText(page);
      }
    }
  }
});

// The forest palette kept tinting every dark surface long after the accent was
// fixed, so the tokens themselves are measured here, in the browser, per theme.
test("dark surfaces stay cool slate under a Blue GYS accent", async ({
  page,
}) => {
  await page.goto("/GYSApp-Tauri/");
  for (const theme of ["dark", "amoled"] as const) {
    // The versioned envelope wins over the legacy keys, so both are written.
    await page.evaluate((next) => {
      localStorage.setItem(
        "gys-shell-settings-v1",
        JSON.stringify({ version: 1, locale: "id", theme: next }),
      );
      localStorage.setItem("gys-theme", next);
    }, theme);
    await page.goto("/GYSApp-Tauri/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const tokens = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      const read = (name: string) => style.getPropertyValue(name).trim();
      return {
        canvas: read("--canvas"),
        surface: read("--surface"),
        accent: read("--blue"),
      };
    });
    const rgb = (value: string) => {
      const hex =
        value.length === 4
          ? `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`
          : value;
      return [1, 3, 5].map((offset) =>
        parseInt(hex.slice(offset, offset + 2), 16),
      );
    };
    for (const name of ["canvas", "surface"] as const) {
      const [red, green, blue] = rgb(tokens[name]);
      expect(
        blue,
        `${theme}: ${name} ${tokens[name]} must stay cool, not green`,
      ).toBeGreaterThanOrEqual(green!);
      expect(green).toBeGreaterThanOrEqual(red!);
    }
    const [red, green, blue] = rgb(tokens.accent);
    expect(
      blue,
      `${theme}: accent ${tokens.accent} must lead with blue`,
    ).toBeGreaterThan(green!);
    expect(green).toBeGreaterThan(red!);
  }
});
