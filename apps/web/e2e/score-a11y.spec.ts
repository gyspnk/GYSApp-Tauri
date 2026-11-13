import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// The score reader is the newest surface and the only one the route audits
// never opened: `kidung-a11y.spec.ts` stops at the text reader, the catalogue
// and the playlist menus. Its chrome, dock and canvas get the same six tags.

const AUDIT_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
  "best-practice",
];

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(AUDIT_TAGS).analyze();
  expect
    .soft(results.violations, JSON.stringify(results.violations, null, 2))
    .toEqual([]);
}

async function openScore(page: Page) {
  await page.goto("/GYSApp-Tauri/kidung/hymn-001");
  const partitur = page.getByRole("button", { name: "Partitur", exact: true });
  await expect(partitur).toBeVisible({ timeout: 30_000 });
  await partitur.click();
  await expect(page.locator(".hymn-pdf-viewer-chrome")).toBeVisible({
    timeout: 30_000,
  });
  // The sheet paints after the document resolves; the dock follows it.
  await expect(page.locator(".hymn-pdf-viewer-chrome")).toContainText("001", {
    timeout: 30_000,
  });
}

test.describe("score reader accessibility", () => {
  test.use({ reducedMotion: "reduce" });

  test.beforeEach(async ({ page }) => {
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
  });

  for (const [width, height] of [
    [390, 844],
    [1440, 900],
  ] as const) {
    test(`score reader is axe clean at ${width}px`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width, height });
      await openScore(page);

      // One name for the surface: the chrome's title, not a hidden text h1.
      const visibleHeadings = await page
        .locator("h1, h2, .hymn-pdf-viewer-title strong")
        .evaluateAll((nodes) =>
          nodes
            .filter((node) => node.getBoundingClientRect().height > 1)
            .map((node) => node.textContent?.trim() ?? ""),
        );
      expect(visibleHeadings.filter((text) => text.length > 0).length).toBe(1);

      await expectNoAxeViolations(page);
    });
  }
});
