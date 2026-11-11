import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// The quick-navigation sheet and the book/chapter dialog are new surfaces that
// the route-level audit never sees open. Both open on top of the reader, so the
// audit also has to run with the overlay visible.

async function prepare(
  page: Page,
  viewport: { width: number; height: number },
) {
  await page.setViewportSize(viewport);
  await page.emulateMedia({ reducedMotion: "reduce" });
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

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .options({ rules: { "target-size": { enabled: true } } })
    .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
    .analyze();
  expect(
    results.violations,
    JSON.stringify(results.violations, null, 2),
  ).toEqual([]);
}

// `region` is best-practice, not WCAG: it only fires when fixed layers sit
// outside the page landmarks. Both drag states have to stay clean.
async function expectNoBestPracticeViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "best-practice"])
    .analyze();
  expect(
    results.violations,
    JSON.stringify(results.violations, null, 2),
  ).toEqual([]);
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
}

test("the book/chapter dialog is axe clean and Escape returns focus", async ({
  page,
}) => {
  await prepare(page, { width: 390, height: 844 });
  await page.locator(".picker-book-title").click();
  const dialog = page.getByRole("dialog", { name: "Pilih Kitab & Pasal" });
  await expect(dialog).toBeVisible();

  await expectNoAxeViolations(page);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.locator(".reader-context-book-picker")).toBeFocused();
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test(`the quick-navigation sheet is axe clean while open at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await prepare(page, viewport);
    await startQuickNav(page);

    // The cells are plain divs inside one continuous drag surface, so axe never
    // treats them as pointer targets and its target-size rule cannot see them.
    // Measure them here so the touch-target size is recorded with the audit.
    const cells = await page.locator(".quick-nav-item").evaluateAll((nodes) =>
      nodes
        .map((node) => node.getBoundingClientRect())
        .filter((box) => box.width > 0 && box.height > 0)
        .map((box) => ({ width: box.width, height: box.height })),
    );
    if (cells.length === 0)
      throw new Error("Quick navigation rendered no measurable cells");
    const smallestCell = cells.reduce((smallest, cell) => ({
      width: Math.min(smallest.width, cell.width),
      height: Math.min(smallest.height, cell.height),
    }));
    test.info().annotations.push({
      type: "quick-nav-cell",
      description: `${cells.length} cells, smallest ${smallestCell.width.toFixed(1)}x${smallestCell.height.toFixed(1)}px at ${viewport.width}x${viewport.height}`,
    });

    await expectNoAxeViolations(page);
    await expectNoBestPracticeViolations(page);

    await page.mouse.up();
    await expect(page.locator(".quick-nav-drag-overlay")).toBeHidden();
    await expectNoAxeViolations(page);
    await expectNoBestPracticeViolations(page);
  });
}
