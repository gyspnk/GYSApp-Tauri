import { expect, test } from "@playwright/test";

// 1920 px is the widest desktop pass: the statement must use the page column
// instead of stopping at a character measure, and must not cause side scroll.
test.use({ viewport: { width: 1920, height: 1080 } });

test("the doctrine text fills the page column without overflowing", async ({
  page,
}) => {
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/GYSApp-Tauri/iman");
  const statement = page.locator(".faith-statement").first();
  await expect(statement).toBeVisible();

  const boxes = await statement.evaluate((node) => {
    const page = node.closest(".faith-page")!;
    const row = node.closest(".faith-row")!;
    const p = page.getBoundingClientRect();
    const r = row.getBoundingClientRect();
    const s = node.getBoundingClientRect();
    return {
      pageRight: p.right,
      rowRight: r.right,
      rowWidth: r.width,
      textRight: s.right,
      textWidth: s.width,
      overflowX:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    };
  });

  expect(boxes.overflowX, "no sideways scroll").toBeLessThanOrEqual(0);
  expect(boxes.rowRight).toBeLessThanOrEqual(boxes.pageRight + 1);
  expect(
    boxes.textWidth / boxes.rowWidth,
    "the statement takes the row's copy column",
  ).toBeGreaterThan(0.85);
  expect(
    Math.abs(boxes.rowRight - boxes.textRight),
    "the statement ends where the row ends",
  ).toBeLessThanOrEqual(2);
});
