import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

const ROW = ".faith-row";
const SHEET = ".faith-modal-backdrop";
const NOTE_PANEL = ".faith-notes";

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(
    results.violations,
    JSON.stringify(results.violations, null, 2),
  ).toEqual([]);
}

/** The note panel animates; measure it after every animation has settled. */
async function settled(locator: Locator) {
  await locator.evaluate(async (element) => {
    await Promise.all(
      element.getAnimations().map((animation) => animation.finished),
    );
  });
}

test.beforeEach(async ({ page }) => {
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("the row sheet is axe clean, expanded, and owns focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/GYSApp-Tauri/iman");

  const row = page.locator(ROW).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expectNoAxeViolations(page);

  await row.click();
  const sheet = page.locator(SHEET);
  await expect(sheet).toBeVisible();
  await expect(row).toHaveAttribute("aria-expanded", "true");
  await expect(sheet.locator(".faith-selection-close")).toBeFocused();
  expect(
    await sheet.evaluate((element) => element.contains(document.activeElement)),
  ).toBe(true);
  await expectNoAxeViolations(page);
});

test("Escape closes the row sheet and returns focus to its trigger", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/GYSApp-Tauri/iman");

  const row = page.locator(ROW).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.click();
  const sheet = page.locator(SHEET);
  await expect(sheet).toBeVisible();
  await expect(sheet.locator(".faith-selection-close")).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(row).toHaveAttribute("aria-expanded", "false");
  await expect(row).toBeFocused();
});

test("the wide note panel is axe clean and keeps 24 px targets", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  // A saved note also renders the list and delete controls, so the target
  // audit covers every kind of control the panel can show.
  await page.addInitScript(() => {
    localStorage.setItem("gys-faith-note-1", "Catatan audit aksesibilitas.");
  });
  await page.goto("/GYSApp-Tauri/iman");

  const row = page.locator(ROW).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.click();
  await expect(page.locator(SHEET)).toBeVisible();
  await page.getByRole("button", { name: /^Catatan pribadi/ }).click();

  const panel = page.locator(NOTE_PANEL);
  await expect(panel).toBeVisible();
  await settled(panel.locator(".bible-notes-modal"));
  await expectNoAxeViolations(page);

  const targets = await panel.locator("button, a").evaluateAll((elements) =>
    elements
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => {
        const box = element.getBoundingClientRect();
        return {
          label: (
            element.getAttribute("aria-label") ??
            element.textContent ??
            element.tagName
          )
            .trim()
            .slice(0, 40),
          width: box.width,
          height: box.height,
        };
      }),
  );

  expect(targets.length).toBeGreaterThanOrEqual(4);
  for (const target of targets) {
    expect(target.width, `${target.label} target width`).toBeGreaterThanOrEqual(
      24,
    );
    expect(
      target.height,
      `${target.label} target height`,
    ).toBeGreaterThanOrEqual(24);
  }

  const smallest = Math.min(
    ...targets.map((target) => Math.min(target.width, target.height)),
  );
  console.log(
    `faith-notes smallest target: ${smallest.toFixed(1)} px (${targets.length} controls)`,
  );
});
