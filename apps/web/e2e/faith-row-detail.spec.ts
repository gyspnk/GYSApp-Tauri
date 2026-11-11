import { expect, test } from "@playwright/test";

// The PDF position is a property of the topic, not of the list: the row shows the
// statement and the note badge, and the position sits next to "Baca lebih lanjut".
test.use({ viewport: { width: 1440, height: 900 } });

const PROGRESS = {
  page: 4,
  totalPages: 10,
  percent: 40,
  lastOpenedAt: new Date("2026-11-01T09:00:00Z").toISOString(),
};

test.beforeEach(async ({ page }) => {
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.addInitScript((progress) => {
    window.localStorage.setItem("gys-faith-pdf-1", JSON.stringify(progress));
  }, PROGRESS);
});

test("the row keeps the statement and the sheet owns the PDF position", async ({
  page,
}) => {
  await page.goto("/GYSApp-Tauri/iman");
  const rows = page.locator(".faith-rows .faith-row");
  await expect(rows.first()).toBeVisible();

  await expect(page.locator(".faith-row-progress")).toHaveCount(0);
  await expect(rows.first()).not.toContainText(/Lanjut · halaman/);
  await expect(rows.first()).not.toContainText(/Progres/);

  await rows.first().click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  const readMore = sheet.locator(".faith-read-more");
  await expect(readMore).toBeVisible();
  const position = sheet.locator(".faith-read-more-progress");
  await expect(position).toContainText(/halaman 4/);
  await expect(position).toContainText(/Progres 40%/);
});

test("the statement reaches the page width instead of stopping at a measure", async ({
  page,
}) => {
  await page.goto("/GYSApp-Tauri/iman");
  const rows = page.locator(".faith-rows .faith-row");
  await expect(rows.first()).toBeVisible();

  const boxes = await rows.first().evaluate((row) => {
    const statement = row.querySelector(".faith-statement");
    if (!statement) return null;
    const rowBox = row.getBoundingClientRect();
    const textBox = statement.getBoundingClientRect();
    return {
      rowRight: rowBox.right,
      textRight: textBox.right,
      rowWidth: rowBox.width,
      textWidth: textBox.width,
    };
  });
  expect(boxes, "the first row carries a statement").not.toBeNull();
  expect(
    Math.abs(boxes!.rowRight - boxes!.textRight),
    "the statement ends where the row ends",
  ).toBeLessThanOrEqual(2);
  expect(
    boxes!.textWidth / boxes!.rowWidth,
    "the statement takes the copy column, not half of it",
  ).toBeGreaterThan(0.85);
});
