import { expect, test, type Locator, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block" });

type DeviceMode = "phone" | "tablet" | "desktop";
type ViewportCase = {
  width: number;
  height: number;
  mode: DeviceMode;
};

const shellViewports: readonly ViewportCase[] = [
  { width: 320, height: 720, mode: "phone" },
  { width: 390, height: 844, mode: "phone" },
  { width: 430, height: 932, mode: "phone" },
  { width: 599, height: 900, mode: "phone" },
  { width: 600, height: 900, mode: "tablet" },
  { width: 768, height: 1024, mode: "tablet" },
  { width: 959, height: 900, mode: "tablet" },
  { width: 960, height: 900, mode: "desktop" },
  { width: 1024, height: 768, mode: "desktop" },
  { width: 1440, height: 900, mode: "desktop" },
  { width: 1920, height: 1080, mode: "desktop" },
];

const routeViewports = [
  { width: 320, height: 720 },
  { width: 600, height: 900 },
  { width: 960, height: 900 },
  { width: 1920, height: 1080 },
] as const;

const coreRoutes = [
  "/",
  "/bible",
  "/kidung",
  "/iman",
  "/literatur",
  "/lainnya",
] as const;

const routeReadySelector: Partial<Record<(typeof coreRoutes)[number], string>> =
  {
    "/": ".home-grid",
    "/bible": ".bible-reader",
    "/kidung": ".hymn-catalog-shell",
    "/iman": ".faith-page",
    "/literatur": ".literature-page",
    "/lainnya": ".more-page",
  };

async function expectNoHorizontalOverflow(page: Page, label: string) {
  try {
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        ),
      )
      .toBeLessThanOrEqual(1);
  } catch (error) {
    const details = await page.evaluate(() => {
      const root = document.documentElement;
      const viewportWidth = root.clientWidth;
      const offenders = [...document.querySelectorAll<HTMLElement>("*")]
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName,
            className: element.className,
            left: Math.round(rect.left * 100) / 100,
            right: Math.round(rect.right * 100) / 100,
            width: Math.round(rect.width * 100) / 100,
          };
        })
        .filter(
          (entry) =>
            entry.width > 0 &&
            (entry.left < -1 || entry.right > viewportWidth + 1),
        )
        .slice(0, 12);
      return {
        clientWidth: root.clientWidth,
        scrollWidth: root.scrollWidth,
        offenders,
      };
    });
    throw new Error(
      `${label}: horizontal overflow ${JSON.stringify(details)}\n${String(error)}`,
    );
  }
}

async function expectInsideViewport(locator: Locator, viewportWidth: number) {
  const box = await locator.boundingBox();
  expect(box, "element should be visible and measurable").not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewportWidth + 1);
}

async function openRoute(page: Page, route: string, width: number) {
  await page.goto(`/GYSApp-Tauri${route}`);
  await page.locator("#main-content").waitFor({
    state: "visible",
    timeout: 20_000,
  });
  const ready = routeReadySelector[route as (typeof coreRoutes)[number]];
  if (ready) {
    await page.locator(ready).first().waitFor({
      state: "visible",
      timeout: 20_000,
    });
  }
  await expect(page.locator("#main-content")).toBeVisible();
  await expectNoHorizontalOverflow(page, `${route} @ ${width}px`);
}

test("shell adapts across responsive breakpoints", async ({ page }) => {
  for (const viewport of shellViewports) {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await openRoute(page, "/", viewport.width);

    const nav = page.locator(".navigation-shell");
    await expect(nav).toBeVisible();
    await expectInsideViewport(nav, viewport.width);
    await expect(nav.locator(".nav-item")).toHaveCount(5);

    const navBox = await nav.boundingBox();
    expect(navBox).not.toBeNull();
    if (viewport.mode === "phone") {
      await expect(nav).toHaveCSS("position", "fixed");
      expect(navBox!.y + navBox!.height).toBeLessThanOrEqual(
        viewport.height + 1,
      );
    } else if (viewport.mode === "tablet") {
      expect(navBox!.width).toBeGreaterThanOrEqual(88);
      expect(navBox!.width).toBeLessThanOrEqual(96);
    } else {
      expect(navBox!.width).toBeGreaterThanOrEqual(220);
    }

    const labels = nav.locator(".nav-copy strong");
    for (let index = 0; index < (await labels.count()); index += 1) {
      await expect(labels.nth(index)).toBeVisible();
    }
  }
});

test("primary routes fit from phone to wide desktop", async ({ page }) => {
  for (const viewport of routeViewports) {
    await page.setViewportSize(viewport);
    for (const route of coreRoutes) {
      await openRoute(page, route, viewport.width);
      await expectInsideViewport(page.locator("#main-content"), viewport.width);
    }
  }
});

test("Kidung stays contained around both breakpoints", async ({ page }) => {
  for (const viewport of [
    { width: 599, height: 900 },
    { width: 600, height: 900 },
    { width: 959, height: 900 },
    { width: 960, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await openRoute(page, "/kidung", viewport.width);

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
});

test("focused hymn reader fits every device class", async ({ page }) => {
  const viewports = [
    { width: 320, height: 720 },
    { width: 390, height: 844 },
    { width: 600, height: 900 },
    { width: 768, height: 1024 },
    { width: 960, height: 900 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ] as const;

  for (const viewport of viewports) {
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
    await expectNoHorizontalOverflow(
      page,
      `/kidung/hymn-001 @ ${viewport.width}px`,
    );

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
});
