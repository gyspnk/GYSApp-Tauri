import { expect, test, type Locator, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block" });

type DeviceMode = "phone" | "tablet" | "desktop";

type ViewportCase = {
  name: string;
  width: number;
  height: number;
  mode: DeviceMode;
};

const shellViewports: readonly ViewportCase[] = [
  { name: "small-phone", width: 320, height: 720, mode: "phone" },
  { name: "phone", width: 390, height: 844, mode: "phone" },
  { name: "large-phone", width: 430, height: 932, mode: "phone" },
  { name: "phone-breakpoint-max", width: 599, height: 900, mode: "phone" },
  { name: "tablet-breakpoint-min", width: 600, height: 900, mode: "tablet" },
  { name: "tablet-portrait", width: 768, height: 1024, mode: "tablet" },
  { name: "tablet-breakpoint-max", width: 959, height: 900, mode: "tablet" },
  { name: "desktop-breakpoint-min", width: 960, height: 900, mode: "desktop" },
  { name: "landscape", width: 1024, height: 768, mode: "desktop" },
  { name: "desktop", width: 1440, height: 900, mode: "desktop" },
  { name: "wide-desktop", width: 1920, height: 1080, mode: "desktop" },
] as const;

const routeViewports = [
  { name: "small-phone", width: 320, height: 720 },
  { name: "tablet-edge", width: 600, height: 900 },
  { name: "desktop-edge", width: 960, height: 900 },
  { name: "wide-desktop", width: 1920, height: 1080 },
] as const;

const coreRoutes = [
  "/",
  "/bible",
  "/kidung",
  "/iman",
  "/literatur",
  "/lainnya",
] as const;

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth + 1,
      ),
    )
    .toBe(true);
}

async function expectInsideViewport(locator: Locator, viewportWidth: number) {
  const box = await locator.boundingBox();
  expect(box, "element should be visible and measurable").not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewportWidth + 1);
}

async function openRoute(page: Page, route: string) {
  await page.goto(`/GYSApp-Tauri${route}`);
  await page.locator("#main-content").waitFor({
    state: "visible",
    timeout: 20_000,
  });
  await expect(page.locator("#main-content")).toBeVisible();
  await expect(page.locator("h1")).toHaveCount(1);
  await expectNoHorizontalOverflow(page);
}

test(
  "shell switches cleanly at phone, tablet, and desktop breakpoints",
  async ({ page }) => {
    for (const viewport of shellViewports) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await openRoute(page, "/");

      const nav = page.locator(".navigation-shell");
      await expect(nav).toBeVisible();
      await expectInsideViewport(nav, viewport.width);

      const navItems = nav.locator(".nav-item");
      await expect(navItems).toHaveCount(5);

      if (viewport.mode === "phone") {
        await expect(nav).toHaveCSS("position", "fixed");
        const navBox = await nav.boundingBox();
        expect(navBox).not.toBeNull();
        expect(navBox!.y + navBox!.height).toBeLessThanOrEqual(
          viewport.height + 1,
        );
      } else if (viewport.mode === "tablet") {
        const navBox = await nav.boundingBox();
        expect(navBox).not.toBeNull();
        expect(navBox!.width).toBeGreaterThanOrEqual(88);
        expect(navBox!.width).toBeLessThanOrEqual(96);
      } else {
        const navBox = await nav.boundingBox();
        expect(navBox).not.toBeNull();
        expect(navBox!.width).toBeGreaterThanOrEqual(220);
      }

      const labels = nav.locator(".nav-copy strong");
      for (let index = 0; index < (await labels.count()); index += 1) {
        await expect(labels.nth(index)).toBeVisible();
      }
    }
  },
);

test(
  "all primary surfaces stay contained from small phone through wide desktop",
  async ({ page }) => {
    for (const viewport of routeViewports) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      for (const route of coreRoutes) {
        await openRoute(page, route);
        await expectInsideViewport(
          page.locator("#main-content"),
          viewport.width,
        );
      }
    }
  },
);

test(
  "Kidung catalog stays contained immediately around both responsive breakpoints",
  async ({ page }) => {
    for (const viewport of [
      { width: 599, height: 900 },
      { width: 600, height: 900 },
      { width: 959, height: 900 },
      { width: 960, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await openRoute(page, "/kidung");
      await page
        .locator(".pujian-list > li")
        .first()
        .waitFor({ state: "visible" });

      await expectInsideViewport(
        page.locator(".kidung-local-nav"),
        viewport.width,
      );
      await expectInsideViewport(
        page.locator(".hymn-catalog-controls"),
        viewport.width,
      );
      await expectInsideViewport(
        page.locator(".pujian-item").first(),
        viewport.width,
      );
    }
  },
);

test(
  "focused hymn reader remains usable across phone, tablet, landscape, and wide layouts",
  async ({ page }) => {
    const readerViewports = [
      { width: 320, height: 720 },
      { width: 390, height: 844 },
      { width: 600, height: 900 },
      { width: 768, height: 1024 },
      { width: 960, height: 900 },
      { width: 1024, height: 768 },
      { width: 1440, height: 900 },
      { width: 1920, height: 1080 },
    ] as const;

    for (const viewport of readerViewports) {
      await page.setViewportSize(viewport);
      await page.goto("/GYSApp-Tauri/kidung/hymn-001");
      await page.locator(".lyrics-sheet").waitFor({
        state: "visible",
        timeout: 20_000,
      });

      await expect(page.locator(".app-frame .topbar")).toBeHidden();
      await expect(page.locator(".app-frame .navigation-shell")).toBeHidden();
      await expectInsideViewport(
        page.locator(".hymn-detail-page"),
        viewport.width,
      );
      await expectInsideViewport(page.locator(".lyrics-sheet"), viewport.width);
      await expectInsideViewport(
        page.locator(".hymn-text-footer"),
        viewport.width,
      );
      await expectNoHorizontalOverflow(page);

      const geometry = await page.evaluate(() => {
        const toolbar = document.querySelector(".hymn-text-toolbar")!;
        const lyrics = document.querySelector(".lyrics-sheet")!;
        const footer = document.querySelector(".hymn-text-footer")!;
        return {
          toolbarBottom: toolbar.getBoundingClientRect().bottom,
          lyricsTop: lyrics.getBoundingClientRect().top,
          lyricsBottom: lyrics.getBoundingClientRect().bottom,
          footerTop: footer.getBoundingClientRect().top,
        };
      });
      expect(geometry.lyricsTop).toBeGreaterThanOrEqual(
        geometry.toolbarBottom - 1,
      );
      expect(geometry.lyricsBottom).toBeLessThanOrEqual(geometry.footerTop + 1);
    }
  },
);
