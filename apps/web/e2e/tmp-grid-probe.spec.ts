import { expect, test } from "@playwright/test";

test("temporary probe: how the Lainnya collection grid resolves at 768", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/lainnya");
  await page.locator(".more-library-grid").waitFor();
  const data = await page.evaluate(() => {
    const grid = document.querySelector(".more-library-grid");
    if (!(grid instanceof HTMLElement)) return { grid: null };
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
  expect(data.grid).not.toBeNull();
});
