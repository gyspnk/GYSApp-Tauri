import { expect, test, type Page } from "@playwright/test";

// The settings page used to hide its title and split the list into two columns,
// so every other chevron sat in the middle of the screen and an opened panel
// was wider than the rows above it. It now paints the destination name and
// keeps one centred column, like every other surface.

const TITLE = "Pengaturan & perangkat";

async function open(page: Page, path = "/GYSApp-Tauri/lainnya") {
  await page.addInitScript(() => {
    localStorage.setItem(
      "gys-shell-settings-v1",
      JSON.stringify({
        version: 1,
        locale: "id",
        theme: "light",
        onboarded: true,
      }),
    );
  });
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto(path);
  await expect(page.locator(".more-setting-row").first()).toBeVisible({
    timeout: 30_000,
  });
}

test("the settings title and list share one axis", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);

  const heading = page.locator(".more-page > .page-intro h1");
  await expect(heading).toHaveCount(1);
  await expect(heading).toHaveText(TITLE);
  const headingBox = await heading.boundingBox();
  if (!headingBox) throw new Error("missing heading box");
  expect(headingBox.height).toBeGreaterThan(28);

  const intro = await page.locator(".more-page > .page-intro").boundingBox();
  const hub = await page.locator(".more-library-grid").boundingBox();
  const list = await page.locator(".more-settings-list").boundingBox();
  if (!intro || !hub || !list) throw new Error("missing settings boxes");
  for (const box of [hub, list]) {
    expect(Math.abs(box.x - intro.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(box.width - intro.width)).toBeLessThanOrEqual(1);
  }

  // One column: every row starts on the same edge.
  const rows = await page.locator(".more-setting-row").evaluateAll((nodes) =>
    nodes.map((node) => {
      const box = node.getBoundingClientRect();
      const chevron = node.lastElementChild;
      const chevronBox =
        chevron instanceof SVGElement
          ? chevron.getBoundingClientRect()
          : undefined;
      return {
        x: box.x,
        width: box.width,
        height: box.height,
        right: box.right,
        chevronRight: chevronBox ? chevronBox.right : null,
      };
    }),
  );
  expect(rows.length).toBeGreaterThan(4);
  for (const row of rows) {
    expect(Math.abs(row.x - rows[0]!.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(row.width - rows[0]!.width)).toBeLessThanOrEqual(1);
    expect(row.height).toBeGreaterThanOrEqual(43.5);
    if (row.chevronRight !== null) {
      expect(row.right - row.chevronRight).toBeLessThanOrEqual(24);
    }
  }

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("an expanded panel keeps the column's edges", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, "/GYSApp-Tauri/lainnya?section=appearance");

  const panel = page.locator('[data-setting="appearance"]');
  await expect(panel).toHaveAttribute("open", "");
  const panelBox = await panel.boundingBox();
  const listBox = await page.locator(".more-settings-list").boundingBox();
  if (!panelBox || !listBox) throw new Error("missing boxes");
  expect(panelBox.x).toBeGreaterThanOrEqual(listBox.x - 1);
  expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(
    listBox.x + listBox.width + 1,
  );

  const rows = await page
    .locator('[data-setting="appearance"] .appearance-setting-row')
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect().x),
    );
  expect(rows.length).toBe(4);
  for (const x of rows) expect(Math.abs(x - rows[0]!)).toBeLessThanOrEqual(1);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("a phone keeps the title and one column", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);

  const heading = page.locator(".more-page > .page-intro h1");
  await expect(heading).toHaveCount(1);
  await expect(heading).toBeVisible();
  const headingBox = await heading.boundingBox();
  if (!headingBox) throw new Error("missing heading box");
  expect(headingBox.height).toBeGreaterThan(28);

  const rows = await page.locator(".more-setting-row").evaluateAll((nodes) =>
    nodes.map((node) => {
      const box = node.getBoundingClientRect();
      return { x: box.x, width: box.width, height: box.height };
    }),
  );
  for (const row of rows) {
    expect(Math.abs(row.x - rows[0]!.x)).toBeLessThanOrEqual(1);
    expect(row.height).toBeGreaterThanOrEqual(43.5);
  }
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
