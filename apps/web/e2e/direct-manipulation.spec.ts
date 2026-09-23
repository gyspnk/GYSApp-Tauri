import { expect, test, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block" });

async function openHymnPdf(page: Page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/GYSApp-Tauri/kidung/hymn-001");
  await expect(
    page.getByRole("heading", { name: /Pujilah Allah Yang Maha Esa/ }),
  ).toBeVisible({ timeout: 15_000 });
  await page.getByRole("tab", { name: "PDF" }).click();
  await expect(page.locator(".pdf-reader-hymn")).toBeVisible({
    timeout: 30_000,
  });
}

test("Kidung PDF keeps zoom direct-manipulation first", async ({ page }) => {
  await openHymnPdf(page);

  // Primary reading chrome stays focused on the document itself: zoom and
  // layout configuration belong to direct manipulation / the options surface.
  await expect(
    page.locator('.pdf-reader-hymn input[type="range"]'),
  ).toBeHidden();
  await expect(
    page.locator(".pdf-reader-hymn .pdf-view-scroll-toggle"),
  ).toBeHidden();

  // Technical controls begin collapsed, but remain available as an explicit
  // single-pointer/accessibility fallback when requested.
  const advanced = page.locator(".pdf-reader-hymn .pdf-advanced-controls");
  await expect(advanced).toBeHidden();
  const options = page.getByRole("button", { name: "Opsi PDF" });
  await expect(options).toBeVisible();
  await options.click();
  await expect(advanced).toBeVisible();
  await expect(
    page.locator(".pdf-reader-hymn .pdf-layout-toggle"),
  ).toBeVisible();
  const pagerButtons = page.locator(
    ".pdf-reader-hymn .pdf-page-navigation > button",
  );
  await expect(pagerButtons).toHaveCount(2);
  for (const [index, label] of ["Sebelumnya", "Berikutnya"].entries()) {
    const button = pagerButtons.nth(index);
    await expect(button).toHaveAttribute("aria-label", label);
    await expect(button).toHaveAttribute("title", label);
    await expect(button.locator("svg")).toHaveCount(1);
  }
  const layoutButtons = page.locator(
    ".pdf-reader-hymn .pdf-layout-toggle button",
  );
  await expect(layoutButtons).toHaveCount(4);
  for (let index = 0; index < (await layoutButtons.count()); index += 1) {
    const button = layoutButtons.nth(index);
    await expect(button.locator("svg")).toHaveCount(1);
    const box = await button.boundingBox();
    expect(box, "PDF layout control should be measurable").not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  const advancedButtons = page.locator(
    ".pdf-reader-hymn .pdf-advanced-controls button",
  );
  for (let index = 0; index < (await advancedButtons.count()); index += 1) {
    const box = await advancedButtons.nth(index).boundingBox();
    expect(box, "PDF advanced control should be measurable").not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await expect(
    advanced.getByRole("button", { name: "Perbesar PDF" }),
  ).toBeVisible();
  await page.locator(".pdf-reader-hymn .pdf-advanced-toggle").click();
  await expect(advanced).toBeHidden();

  // The canonical keyboard handler intentionally ignores input until PDF.js
  // has completed its page render, so synchronize with the visible reader
  // readiness instead of racing the loading state.
  const stage = page.locator(".pdf-reader-hymn .pdf-stage");
  await expect(stage.locator(".pdf-loading")).toHaveCount(0, {
    timeout: 30_000,
  });
  await expect
    .poll(
      () =>
        stage
          .locator("canvas")
          .first()
          .evaluate((element: HTMLCanvasElement) => element.width),
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0);

  // Desktop keyboard mirrors pinch / Ctrl+wheel and gives transient feedback.
  await stage.focus();
  await page.keyboard.press("Control+=");
  const zoomHud = page.getByRole("status", { name: "Zoom PDF" });
  await expect(zoomHud).toContainText("125%");
  await expect(stage).toHaveClass(/is-zoomed/);

  await page.keyboard.press("Control+0");
  await expect(zoomHud).toContainText("100%");
  await expect(stage).toHaveClass(/is-fit/);
});

test("Kidung PDF localizes its internal reader chrome", async ({ page }) => {
  await page.addInitScript(() => {
    const locale = new URLSearchParams(window.location.search).get(
      "__gys_locale",
    );
    if (locale !== "id" && locale !== "en" && locale !== "zh") return;
    localStorage.setItem("gys-locale", locale);
    localStorage.setItem(
      "gys-shell-settings-v1",
      JSON.stringify({ version: 1, locale, theme: "light" }),
    );
  });

  const copy = {
    id: {
      previous: "Sebelumnya",
      next: "Berikutnya",
      settings: "Opsi PDF",
      zoomIn: "Perbesar PDF",
      layout: "Layout PDF",
    },
    en: {
      previous: "Previous",
      next: "Next",
      settings: "PDF settings",
      zoomIn: "Zoom in",
      layout: "PDF layout",
    },
    zh: {
      previous: "上一页",
      next: "下一页",
      settings: "PDF 设置",
      zoomIn: "放大",
      layout: "PDF 布局",
    },
  } as const;

  for (const locale of ["id", "en", "zh"] as const) {
    await page.goto(`/GYSApp-Tauri/kidung/hymn-001?__gys_locale=${locale}`);
    const pdfTab = page.getByRole("tab", { name: "PDF", exact: true });
    const reader = page.locator(".pdf-reader-hymn");
    await expect(pdfTab.or(reader)).toBeVisible({ timeout: 30_000 });
    if (await pdfTab.isVisible()) {
      await pdfTab.click();
    }
    await expect(reader).toBeVisible({ timeout: 30_000 });
    await expect(reader).toHaveAttribute("data-pdf-locale", locale);
    const pagerButtons = reader.locator(".pdf-page-navigation > button");
    await expect(pagerButtons).toHaveCount(2);
    await expect(pagerButtons.nth(0)).toHaveAttribute(
      "aria-label",
      copy[locale].previous,
    );
    await expect(pagerButtons.nth(1)).toHaveAttribute(
      "aria-label",
      copy[locale].next,
    );
    await expect(
      reader.getByRole("button", { name: copy[locale].settings, exact: true }),
    ).toBeVisible();
    await reader
      .getByRole("button", { name: copy[locale].settings, exact: true })
      .click();
    await expect(
      reader.getByRole("group", { name: copy[locale].layout, exact: true }),
    ).toBeVisible();
    await expect(
      reader.getByRole("button", { name: copy[locale].zoomIn, exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
  }
});
