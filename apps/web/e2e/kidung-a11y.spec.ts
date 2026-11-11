import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const PLAYLIST_ROUTE = "/GYSApp-Tauri/kidung?section=playlist";
// The route audit used to stop at wcag2aa; the newer WCAG tags also cover
// target size, focus appearance and the A-level rules the old pass missed.
const AUDIT_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
  "best-practice",
];

async function expectNoAxeViolations(page: Page) {
  // `options()` replaces the whole axe config, so tags go through `withTags()`
  // on the builder rather than an options object.
  const results = await new AxeBuilder({ page }).withTags(AUDIT_TAGS).analyze();
  // Soft so a second contract failure in the same scenario (focus return)
  // is reported alongside the audit instead of masking it.
  expect
    .soft(results.violations, JSON.stringify(results.violations, null, 2))
    .toEqual([]);
}

async function importPlaylist(page: Page) {
  await page.goto(PLAYLIST_ROUTE);
  await expect(
    page.getByRole("heading", { name: "Antrean MIDI", exact: true }),
  ).toBeVisible({ timeout: 15_000 });
  await page
    .locator(".kidung-tool-heading-actions input[type=file]")
    .setInputFiles({
      name: "kidung-a11y.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          name: "Audit Hapus",
          songs: [
            {
              nomor: "001",
              judul: "Pujilah Allah Yang Maha Esa",
              fileHref: "docs/assets/001.mid",
            },
          ],
          exportedAt: "2026-10-10T00:00:00.000Z",
        }),
      ),
    });
  const row = page.locator(".kidung-saved-playlist-row", {
    has: page.getByText("Audit Hapus (Imported)", { exact: true }),
  });
  await expect(row).toBeVisible();
  return row;
}

test.beforeEach(async ({ page }) => {
  // Nothing may leave the device during an accessibility audit.
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("desktop Kidung reader rail is axe clean and marks one current song", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/GYSApp-Tauri/kidung/hymn-001");

  const rail = page.locator(".kidung-reader-rail");
  await expect(rail).toBeVisible({ timeout: 20_000 });
  await expect(rail.locator(".kidung-rail-row").first()).toBeVisible();

  await expect(
    page.getByRole("heading", { name: "Pujilah Allah Yang Maha Esa" }),
  ).toBeVisible({ timeout: 20_000 });

  const current = rail.locator('[aria-current="page"]');
  await expect(current).toHaveCount(1);
  await expect(current).toHaveClass(/kidung-rail-row/);

  // Rows are the rail's only navigation surface, so each one is a touch target.
  const undersized = await rail
    .locator(".kidung-rail-row")
    .evaluateAll((rows) =>
      rows
        .map((row) => row.getBoundingClientRect().height)
        .filter((height) => height < 43.5),
    );
  expect(undersized).toEqual([]);

  await expectNoAxeViolations(page);
});

test("mobile Kidung catalogue keeps the rail out and stays axe clean", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/GYSApp-Tauri/kidung");
  await expect(
    page.getByRole("heading", { name: "Kidung", exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".pujian-list > li").first()).toBeVisible({
    timeout: 20_000,
  });

  await expect(page.locator(".kidung-reader-rail")).toHaveCount(0);
  await expectNoAxeViolations(page);
});

test("desktop Kidung catalogue is axe clean", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/GYSApp-Tauri/kidung");
  await expect(
    page.getByRole("heading", { name: "Kidung", exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".pujian-list > li").first()).toBeVisible({
    timeout: 20_000,
  });

  await expectNoAxeViolations(page);
});

test("saved playlist menu panel is axe clean", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const row = await importPlaylist(page);
  await row.locator("details.kidung-row-menu > summary").first().click();
  await expect(row.locator(".kidung-row-menu-panel")).toBeVisible();
  const manage = row.locator("details.kidung-manage-saved-items");
  await manage.locator("summary").click();
  await expect(manage.locator(".kidung-saved-playlist-item")).toBeVisible();

  await expectNoAxeViolations(page);
});

test("delete playlist dialog is axe clean and Escape restores focus", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const row = await importPlaylist(page);
  const remove = row.locator(".kidung-danger-action", {
    hasText: /^Hapus playlist$/,
  });

  await row.locator("details.kidung-row-menu > summary").first().click();
  await remove.click();

  const dialog = page.getByRole("dialog", { name: "Hapus playlist?" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("tidak bisa dibatalkan");

  // The dialog is portaled to <body>, so audit the whole page exactly as a
  // screen-reader user meets it while the modal is open.
  await expectNoAxeViolations(page);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  // The row menu collapses when the dialog opens, so returning focus to the
  // summary is the honest promise: the action itself is no longer focusable.
  await expect(
    row.locator("details.kidung-row-menu > summary").first(),
  ).toBeFocused();
});
