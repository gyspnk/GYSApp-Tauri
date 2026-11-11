import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

// Beranda, Alkitab, Suara, and Lainnya were the last routes still outside the
// full-tag audit. The Bible surfaces only exist while open, so each one is
// audited in the state the reader actually sees.

const AXE_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
  "best-practice",
];

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(
    results.violations,
    JSON.stringify(results.violations, null, 2),
  ).toEqual([]);
}

const transparentPixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X2NDWQAAAABJRU5ErkJggg==",
  "base64",
);

// SuaraSejatiFeedSchema requires generatedAt; without it the feed parses to [].
const suaraFeed = {
  source: "tjc.org",
  generatedAt: "2026-10-02T00:00:00.000Z",
  items: [
    {
      id: "a11y-suara-satu",
      title: "Kesaksian Penyertaan Tuhan",
      excerpt: "Cuplikan kesaksian untuk audit.",
      url: "https://tjc.org/id/suarasejati/a11y-suara-satu/",
      publishedAt: "2026-10-01T00:00:00.000Z",
      source: "tjc.org",
    },
    {
      id: "a11y-suara-dua",
      title: "Kesaksian Keluarga",
      excerpt: "Cuplikan kesaksian kedua.",
      url: "https://tjc.org/id/suarasejati/a11y-suara-dua/",
      publishedAt: "2026-09-01T00:00:00.000Z",
      source: "tjc.org",
    },
  ],
};

function todaySauh() {
  const date = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .map((part) => [part.type, part.value]),
  );
  const slug = `sbj${date.year?.slice(-2)}${date.month}${date.day}`;
  return {
    id: slug,
    title: "Renungan hari ini",
    reference: "Yohanes 3:16",
    verse: "Karena begitu besar kasih Allah akan dunia ini.",
    body: "Fixture audit aksesibilitas beranda.",
    url: `https://tjc.org/id/gerakan-baca-alkitab/${slug}/`,
    updatedAt: new Date().toISOString(),
    source: "tjc.org" as const,
  };
}

/** Beranda needs today's Sauh plus both shelves painted before axe runs. */
async function prepareHome(page: Page) {
  const sauh = todaySauh();
  await page.route("**/offline/sauh.json", (route) =>
    route.fulfill({ json: { items: [sauh] } }),
  );
  await page.route("**/wp-json/wp/v2/posts**", (route) =>
    route.fulfill({ json: [sauh] }),
  );
  await page.route("**/offline/suara-sejati.json", (route) =>
    route.fulfill({ json: suaraFeed }),
  );
  await page.route("**/offline/literature.json", (route) =>
    route.fulfill({
      json: {
        source: "tjc.org",
        generatedAt: "2026-09-15T00:00:00.000Z",
        items: [
          {
            id: "a11y-literatur-satu",
            category: "kesaksian",
            title: "Kesaksian Dalam Penyertaan Tuhan",
            description: "Bacaan pembinaan keluarga.",
            url: "https://tjc.org/id/kesaksian/a11y-literatur-satu/",
            format: "article",
            publishedAt: "2026-09-01T00:00:00.000Z",
            updatedAt: "2026-09-01T00:00:00.000Z",
            source: "tjc.org",
          },
        ],
      },
    }),
  );
  await page.route(/^https:\/\//, async (route) => {
    if (route.request().resourceType() === "image") {
      await route.fulfill({ body: transparentPixel, contentType: "image/png" });
      return;
    }
    await route.abort();
  });
}

async function openBible(
  page: Page,
  viewport: { width: number; height: number },
) {
  await page.setViewportSize(viewport);
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
  await page.waitForSelector(".picker-book-title", { timeout: 30_000 });
}

async function startQuickNav(page: Page) {
  const handle = page.locator(".quick-nav-handle");
  const handleBox = await handle.boundingBox();
  if (!handleBox)
    throw new Error("Bible quick navigation handle is not measurable");
  const centreX = handleBox.x + handleBox.width / 2;
  const centreY = handleBox.y + handleBox.height / 2;
  await page.mouse.move(centreX, centreY);
  await page.mouse.down();
  await page.mouse.move(centreX + 2, centreY, { steps: 2 });
  await page.mouse.move(centreX + 10, centreY, { steps: 3 });
  await expect(page.locator(".quick-nav-drag-overlay")).toBeVisible();
  await expect(
    page.locator(".quick-nav-drag-overlay .quick-nav-item").first(),
  ).toBeVisible();
}

/** The drawer animates on entry; measure the typography card once settled. */
async function settled(locator: Locator) {
  await locator.evaluate(async (element) => {
    await Promise.all(
      element.getAnimations().map((animation) => animation.finished),
    );
  });
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`Beranda is axe clean at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await prepareHome(page);
    await page.setViewportSize(viewport);
    await page.goto("/GYSApp-Tauri/");
    await expect(
      page.getByRole("heading", { name: "Bacaan & nyanyian" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".verse-panel .sauh-card-body")).toBeVisible();
    await expect(
      page.locator(".home-suara-section .suara-library-item").first(),
    ).toBeVisible();
    await expect(
      page.locator(".home-literature-section .suara-library-item").first(),
    ).toBeVisible();

    await expectNoAxeViolations(page);
  });

  test(`Alkitab reader, typography panel, and quick picker are axe clean at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await openBible(page, viewport);

    await expectNoAxeViolations(page);

    await page.locator(".reader-hamburger-btn").click();
    const drawer = page.locator(".reader-hamburger-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer.locator(".hamburger-typography-stepper")).toBeVisible();
    await settled(drawer);
    await expectNoAxeViolations(page);

    await drawer.locator(".hamburger-drawer-close").click();
    await expect(drawer).toBeHidden();

    await startQuickNav(page);
    await expectNoAxeViolations(page);

    await page.mouse.up();
    await expect(page.locator(".quick-nav-drag-overlay")).toBeHidden();
  });
}

test("Suara list and search field are axe clean on a phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/offline/suara-sejati.json", (route) =>
    route.fulfill({ json: suaraFeed }),
  );
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/GYSApp-Tauri/suara");

  await expect(page.getByTestId("suara-page")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator(".catalog-search")).toBeVisible();
  await expect(
    page.getByRole("searchbox", { name: "Cari kesaksian" }),
  ).toBeVisible();
  await expect(page.locator(".suara-library-item").first()).toBeVisible();

  await expectNoAxeViolations(page);
});

test("Lainnya settings groups and one open panel are axe clean on a phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/GYSApp-Tauri/lainnya");

  await expect(page.locator(".more-page")).toBeVisible({ timeout: 30_000 });
  const groups = page.locator(
    ".more-settings-list details.more-setting-section",
  );
  await expect
    .poll(() => groups.count(), { timeout: 30_000 })
    .toBeGreaterThanOrEqual(6);
  for (let index = 0; index < (await groups.count()); index += 1) {
    await expect(groups.nth(index).locator("summary")).toBeVisible();
  }

  const appearance = page.locator('[data-setting="appearance"]');
  await appearance.locator("> summary").click();
  await expect(appearance.locator(".appearance-card")).toBeVisible();

  await expectNoAxeViolations(page);
});

test("the reading menu is a dialog: focus moves in, Escape closes it", async ({
  page,
}) => {
  await openBible(page, { width: 390, height: 844 });
  const trigger = page.locator(".reader-hamburger-btn");
  const drawer = page.locator(".reader-hamburger-drawer");

  await trigger.click();
  await expect(drawer).toBeVisible();
  await expect(drawer.locator(".hamburger-drawer-close")).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(trigger).toBeFocused();
});
