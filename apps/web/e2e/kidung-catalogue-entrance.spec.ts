import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * The catalogue arrives as one wave on a card that is already a screen tall.
 * Two regressions are guarded here: a fourteen-row first batch left the card
 * half height and grew it in steps (reported as "the entrance only animates
 * half the page"), and the wave used to start on mount, so a slow load spent it
 * on an empty list. The first paint is recorded from inside the page because
 * the wave lasts only 760 ms — a test that samples later races the class.
 */
type WaveRecord = {
  sampled: boolean;
  rows: number;
  height: number;
  viewport: number;
  onScreen: number;
  maxDelayMs: number;
};

declare global {
  interface Window {
    __catalogueWave?: WaveRecord;
  }
}

const recordWave = () => {
  const record: WaveRecord = {
    sampled: false,
    rows: 0,
    height: 0,
    viewport: window.innerHeight,
    onScreen: 0,
    maxDelayMs: 0,
  };
  window.__catalogueWave = record;
  const sample = () => {
    if (record.sampled) return;
    const list = document.querySelector(".pujian-list.is-staggering");
    if (!list) return;
    const rows = [...document.querySelectorAll<HTMLElement>(".pujian-item")];
    record.sampled = true;
    record.rows = rows.length;
    record.height = list.clientHeight;
    const delays = rows.map(
      (row) =>
        (Number.parseFloat(getComputedStyle(row).animationDelay) || 0) * 1000,
    );
    record.maxDelayMs = Math.round(Math.max(0, ...delays));
    record.onScreen = rows.filter((row) => {
      const rect = row.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < window.innerHeight;
    }).length;
  };
  // `document.documentElement` does not exist yet inside an init script, so
  // watch the document node itself; a subtree observer there still sees every
  // class and child change.
  new MutationObserver(sample).observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["class"],
  });
};

test.describe("kidung catalogue entrance", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("the card is a screen tall before the wave starts", async ({ page }) => {
    await page.addInitScript(recordWave);
    await page.goto("/GYSApp-Tauri/");
    await page.getByRole("link", { name: "Kidung" }).first().click();

    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.__catalogueWave))?.sampled,
        { timeout: 10_000 },
      )
      .toBe(true);
    const wave = await page.evaluate(() => window.__catalogueWave);
    expect(wave).toBeTruthy();
    if (!wave) return;

    // The card must already hold a screenful of rows when the wave begins, or
    // the lower half of the screen arrives later in a boom of its own.
    expect(wave.height).toBeGreaterThanOrEqual(wave.viewport * 0.7);
    expect(wave.onScreen).toBeGreaterThanOrEqual(20);
    expect(wave.maxDelayMs).toBeLessThanOrEqual(250);

    // The wave ends on its own and leaves nothing animating.
    await expect(page.locator(".pujian-list.is-staggering")).toHaveCount(0);
    const settled = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".pujian-item")].every(
        (row) => getComputedStyle(row).opacity === "1",
      ),
    );
    expect(settled).toBe(true);
  });

  test("the tail of the list stays still", () => {
    // The off-screen tail never scrolls in on its own, so the rule is checked
    // where it lives: a saturated delay and a hard stop after sixty rows.
    const css = readFileSync(
      path.join(import.meta.dirname, "..", "src", "app-design.css"),
      "utf8",
    );
    const rule = css.slice(css.indexOf(".pujian-list.is-staggering"));
    expect(rule).toContain("min(");
    expect(rule).toContain("240ms");
    expect(rule).toContain(".pujian-item:nth-child(n + 61)");
  });
});
