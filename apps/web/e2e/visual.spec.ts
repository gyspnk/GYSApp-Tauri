import { expect, test, type Page } from "@playwright/test";

const viewports = [
  { name: "390x844", width: 390, height: 844 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "1440x900", width: 1440, height: 900 },
] as const;

const surfaces = [
  {
    name: "home",
    path: "/GYSApp-Tauri/",
    ready: ".home-grid",
    fold: ".continue-panel",
  },
  {
    name: "kidung",
    path: "/GYSApp-Tauri/kidung",
    ready: ".hymn-catalog-shell",
    fold: ".pujian-row",
  },
  {
    name: "bible",
    path: "/GYSApp-Tauri/bible",
    ready: ".bible-reader",
    fold: ".bible-reader article",
  },
  {
    name: "more",
    path: "/GYSApp-Tauri/lainnya?section=account",
    ready: ".more-category-bar",
    fold: ".more-grid",
  },
  {
    name: "assets",
    path: "/GYSApp-Tauri/lainnya?section=data",
    ready: ".distributed-assets-list",
    fold: ".distributed-assets-list",
  },
  {
    name: "reader",
    path: "/GYSApp-Tauri/kidung/hymn-001",
    ready: ".hymn-detail-page",
    fold: ".lyrics-sheet",
  },
] as const;

async function prepare(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date("2026-08-18T08:00:00+07:00"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("https://raw.githubusercontent.com/**", (route) =>
    route.abort(),
  );
  await page.route("https://github.com/**", (route) => route.abort());
  await page.route("https://tjc.org/**", async (route) => {
    if (route.request().resourceType() === "image") {
      await route.fulfill({
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X2NDWQAAAABJRU5ErkJggg==",
          "base64",
        ),
        contentType: "image/png",
      });
      return;
    }
    await route.abort();
  });
}

for (const surface of surfaces) {
  for (const viewport of viewports) {
    test(`${surface.name} ${viewport.name} visual baseline`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await prepare(page);
      await page.goto(surface.path);
      await page.locator(surface.ready).first().waitFor({
        state: "visible",
        timeout: 20_000,
      });
      await page.waitForTimeout(250);

      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        )
        .toBe(true);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(
        page.getByRole("navigation", { name: "Navigasi utama" }),
      ).toHaveCount(surface.name === "reader" ? 0 : 1);
      if (viewport.width <= 390) {
        const undersizedTargets = await page
          .locator(
            ".search-trigger, .account-button, .topbar-select .control-select-trigger, .navigation-shell .nav-item, .more-cat-btn, .primary-button, .quiet-button",
          )
          .evaluateAll((elements) =>
            elements.flatMap((element) => {
              const rect = element.getBoundingClientRect();
              return rect.width > 0 &&
                rect.height > 0 &&
                (rect.width < 43.5 || rect.height < 43.5)
                ? [
                    `${element.tagName}.${element.className}: ${rect.width}x${rect.height}px`,
                  ]
                : [];
            }),
          );
        expect(undersizedTargets).toEqual([]);
      }
      await expect
        .poll(() =>
          page
            .locator(surface.fold)
            .first()
            .evaluate(
              (element) => element.getBoundingClientRect().top < innerHeight,
            ),
        )
        .toBe(true);

      await expect(page).toHaveScreenshot(
        `${surface.name}-${viewport.name}.png`,
        {
          animations: "disabled",
          caret: "hide",
          mask:
            surface.name === "home"
              ? [
                  page.locator(
                    ".home-page .date-line, .home-page .sauh-source, .home-page .sauh-image, .home-page .suara-card img, .home-page .suara-library-item img",
                  ),
                ]
              : [],
          maskColor: "#e8edf4",
          maxDiffPixelRatio: 0.005,
        },
      );
    });
  }
}

test("hymn PDF viewer renders a verified page and exposes a download", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/GYSApp-Tauri/kidung/hymn-001");
  await expect(
    page.getByRole("heading", { name: "Pujilah Allah Yang Maha Esa" }),
  ).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Buka PDF" }).click();
  await expect(page.locator(".pdf-reader")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".pdf-download")).toHaveAttribute(
    "download",
    /Pujilah Allah/,
  );
  await expect
    .poll(
      () =>
        page
          .locator(".pdf-pages canvas")
          .first()
          .evaluate((canvas) => canvas.width),
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0);
  await expect(page.locator(".pdf-pages canvas").first()).toHaveAttribute(
    "aria-label",
    /PDF page \d+/,
  );
});
