import { expect, test } from "@playwright/test";

test("temporary probe: how the Lainnya collection grid resolves at 768", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("lainnya");
  await page.waitForTimeout(4_000);
  const data = await page.evaluate(() => {
    const grid = document.querySelector(".more-library-grid");
    const body = (document.body.innerText ?? "").slice(0, 160);
    if (!(grid instanceof HTMLElement)) return { grid: null, body };
    const style = getComputedStyle(grid);
    const cards = [...grid.querySelectorAll(".more-library-link")].map((el) => {
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    });
    return {
      grid: {
        display: style.display,
        columns: style.gridTemplateColumns,
        width: Math.round(grid.getBoundingClientRect().width),
        viewport: window.innerWidth,
        dpr: window.devicePixelRatio,
      },
      cards,
    };
  });
  console.log(`[grid-probe] ${JSON.stringify(data)}`);
  expect(data).toBeTruthy();
});
