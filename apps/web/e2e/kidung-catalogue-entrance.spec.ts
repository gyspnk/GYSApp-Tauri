import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * The catalogue arrives as one wave. A twelve-item cap made the wave die before
 * the bottom of a two-column screen, so the lower half of the page appeared in
 * a single pop — reported by the owner as "the entrance only animates half the
 * page". Every row painted in the first frame must move, the delay must stay
 * under a quarter second, and the off-screen tail must not animate at all.
 */
type FirstPaint = {
  rows: number;
  waving: number;
  maxDelayMs: number;
  onScreen: number;
  onScreenWaving: number;
};

const readFirstPaint = (): FirstPaint => {
  const rows = [...document.querySelectorAll<HTMLElement>(".pujian-item")];
  const waving = (row: HTMLElement) =>
    getComputedStyle(row).animationName.includes("catalogue-row-in");
  const delays = rows
    .filter(waving)
    .map(
      (row) =>
        (Number.parseFloat(getComputedStyle(row).animationDelay) || 0) * 1000,
    );
  const onScreen = rows.filter(
    (row) => row.getBoundingClientRect().top < window.innerHeight,
  );
  return {
    rows: rows.length,
    waving: rows.filter(waving).length,
    maxDelayMs: Math.round(Math.max(0, ...delays)),
    onScreen: onScreen.length,
    onScreenWaving: onScreen.filter(waving).length,
  };
};

test.describe("kidung catalogue entrance", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("every row painted in the first frame joins the wave", async ({
    page,
  }) => {
    await page.goto("/GYSApp-Tauri/");
    await page.getByRole("link", { name: "Kidung" }).first().click();
    await page.waitForSelector(".pujian-list.is-staggering");
    const stats = await page.evaluate(readFirstPaint);

    expect(stats.rows).toBeGreaterThan(0);
    expect(stats.waving).toBe(stats.rows);
    expect(stats.maxDelayMs).toBeLessThanOrEqual(250);
    expect(stats.onScreenWaving).toBe(stats.onScreen);

    // The wave ends on its own: no class left, nothing animating, every row
    // fully painted.
    await expect(page.locator(".pujian-list.is-staggering")).toHaveCount(0);
    await expect
      .poll(async () => page.evaluate(readFirstPaint), { timeout: 5_000 })
      .toMatchObject({ waving: 0 });
    const settled = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".pujian-item")].every(
        (row) => getComputedStyle(row).opacity === "1",
      ),
    );
    expect(settled).toBe(true);
  });

  test("the tail of the list stays still", () => {
    // The off-screen tail cannot be observed from a browser that never scrolls
    // it, so the rule is checked where it lives.
    const css = readFileSync(
      path.join(import.meta.dirname, "..", "src", "app-design.css"),
      "utf8",
    );
    const rule = css.slice(css.indexOf(".pujian-list.is-staggering"));
    expect(rule).toContain("min(");
    expect(rule).toContain("240ms");
    expect(rule).toContain(".pujian-item:nth-child(n + 61)");
    expect(rule.slice(0, rule.indexOf("}"))).toContain("animation-delay");
  });
});
