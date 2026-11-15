import { expect, test } from "@playwright/test";

/** The shell switches layout at 600, 720, 900, 1200 and 1440 px, and every
 *  contract samples the round numbers (320, 390, 768, 1440). The edges are
 *  where a rule can leave a page wider than its viewport or push the first
 *  content out of it, so they are measured directly. */
const EDGES = [599, 600, 719, 720, 899, 900, 1199, 1200];

const ROUTES = [
  { path: "/", ready: ".home-portals" },
  { path: "/kidung", ready: ".pujian-list .pujian-item" },
  { path: "/kidung/hymn-001", ready: ".hymn-text-title h1" },
  { path: "/bible?book=kejadian&chapter=1", ready: ".verse-content" },
  { path: "/literatur", ready: ".page-intro h1" },
  { path: "/suara", ready: ".page-intro h1" },
  { path: "/iman", ready: ".faith-rows" },
  { path: "/lainnya", ready: ".more-settings-list" },
];

test.describe("breakpoint edges", () => {
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

  for (const width of EDGES) {
    test(`no route overflows or hides its first content at ${width}px`, async ({
      page,
    }) => {
      test.setTimeout(180_000);
      await page.setViewportSize({ width, height: 900 });
      for (const route of ROUTES) {
        await page.goto(`/GYSApp-Tauri${route.path}`);
        await expect(page.locator(route.ready).first()).toBeVisible({
          timeout: 30_000,
        });
        const measured = await page.evaluate((selector: string) => {
          const node = document.querySelector(selector);
          const box = node?.getBoundingClientRect();
          return {
            overflow: document.documentElement.scrollWidth - window.innerWidth,
            top: box ? Math.round(box.top) : null,
            width: box ? Math.round(box.width) : null,
          };
        }, route.ready);
        expect(
          measured.overflow,
          `${route.path} overflows at ${width}px`,
        ).toBeLessThanOrEqual(1);
        expect(measured.width, `${route.path} has no box`).toBeGreaterThan(0);
        // The first content of a route has to start inside the viewport.
        expect(
          measured.top,
          `${route.path} starts below the fold at ${width}px`,
        ).toBeLessThan(900);
      }
    });
  }
});
