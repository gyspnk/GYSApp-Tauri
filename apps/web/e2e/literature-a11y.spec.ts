import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { documentBytes } from "./pdf-fixtures.js";

const AXE_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
  "best-practice",
];

const publisher =
  "https://tjcorguploads.s3.amazonaws.com/tjcorg/wp-content/uploads/sites/43/2026/07/reading.pdf";

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(
    results.violations,
    JSON.stringify(results.violations, null, 2),
  ).toEqual([]);
}

async function prepareLiterature(page: Page) {
  await page.route("**/offline/literature.json", (route) =>
    route.fulfill({
      json: {
        source: "tjc.org",
        generatedAt: "2026-10-06T00:00:00Z",
        items: [
          {
            id: "a11y-pdf",
            category: "panduan",
            title: "Panduan Audit PDF",
            description: "PDF pembinaan untuk audit aksesibilitas.",
            url: publisher,
            format: "pdf",
            publishedAt: "2026-10-01T00:00:00Z",
            updatedAt: "2026-10-01T00:00:00Z",
            source: "tjc.org",
          },
        ],
      },
    }),
  );
  await page.route("**/api/v1/content/pdf?**", (route) =>
    route.fulfill({
      body: documentBytes(4),
      contentType: "application/pdf",
      headers: { "access-control-allow-origin": "*" },
    }),
  );
  await page.route("**/api/v1/content/pdf-source?**", (route) =>
    route.fulfill({
      json: { url: publisher },
      headers: { "access-control-allow-origin": "*" },
    }),
  );
}

test.beforeEach(async ({ page }) => {
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("the literature catalogue is axe clean on a phone", async ({ page }) => {
  await prepareLiterature(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/GYSApp-Tauri/literatur");
  await expect(page.locator(".literature-row").first()).toBeVisible({
    timeout: 30_000,
  });
  await expectNoAxeViolations(page);
});

test("the literature reader is axe clean and names its close button", async ({
  page,
}) => {
  await prepareLiterature(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/GYSApp-Tauri/literatur/a11y-pdf?read=1");

  const dialog = page.locator(".literature-pdf-backdrop");
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await expect(
    dialog.getByRole("button", { name: "Tutup", exact: true }),
  ).toBeVisible();
  await expect(
    dialog.locator('canvas[data-pdf-rendered="true"]').first(),
  ).toBeVisible({ timeout: 30_000 });
  await expectNoAxeViolations(page);
});
