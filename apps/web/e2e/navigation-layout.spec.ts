import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function hasNoHorizontalOverflow(page: Page) {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth <=
      document.documentElement.clientWidth + 1,
  );
}

async function touchSwipe(page: Page, fromX = 300, toX = 210) {
  await page.locator(".lyrics-sheet").evaluate(
    (element, points) => {
      const event = (type: string, x: number) =>
        element.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            pointerId: 1,
            pointerType: "touch",
            isPrimary: true,
            buttons: type === "pointerup" ? 0 : 1,
            clientX: x,
            clientY: 420,
          }),
        );
      event("pointerdown", points.fromX);
      event("pointermove", points.toX);
      event("pointerup", points.toX);
    },
    { fromX, toX },
  );
}

test.describe("responsive reader navigation", () => {
  test("mobile Bible chrome stays contained in normal and split views", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      localStorage.setItem("gys-bible-book", "1");
      localStorage.setItem("gys-bible-chapter", "1");
    });
    await page.goto("/GYSApp-Tauri/bible");
    await expect(page.getByRole("heading", { name: "Alkitab" })).toBeVisible();

    const nav = page.locator(".navigation-shell");
    const navBox = await nav.boundingBox();
    expect(navBox).not.toBeNull();
    expect(navBox!.x).toBeGreaterThanOrEqual(0);
    expect(navBox!.x + navBox!.width).toBeLessThanOrEqual(390);
    const firstNavItem = page.locator(".navigation-shell .nav-item").first();
    const [iconBox, labelBox] = await Promise.all([
      firstNavItem.locator("svg").boundingBox(),
      firstNavItem.locator(".nav-copy strong").boundingBox(),
    ]);
    expect(iconBox).not.toBeNull();
    expect(labelBox).not.toBeNull();
    expect(iconBox!.y + iconBox!.height).toBeLessThanOrEqual(labelBox!.y);
    await expect(
      page.locator(".bible-pericope-heading .bible-crossref-trigger"),
    ).toHaveCount(0);
    await expect(page.locator(".bible-crossref-inline")).toHaveCount(5);
    await expect(
      page.locator(
        '.verse-content > .verse-text + .bible-crossref-inline[title="54 rujukan silang"]',
      ),
    ).toHaveCount(1);
    await expect(page.locator(".bible-crossref-inline").first()).toHaveCSS(
      "min-width",
      "0px",
    );
    await expect(page.locator(".bible-crossref-count").first()).toHaveCSS(
      "position",
      "absolute",
    );
    expect(
      await page
        .locator(".verse-content")
        .first()
        .evaluate((content) => {
          const text = content.querySelector(".verse-text");
          const marker = content.querySelector(".bible-crossref-inline");
          if (!text || !marker) return false;
          const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
          let lastText: Text | null = null;
          while (walker.nextNode()) lastText = walker.currentNode as Text;
          if (!lastText?.length) return false;
          const range = document.createRange();
          range.setStart(lastText, lastText.length - 1);
          range.setEnd(lastText, lastText.length);
          const finalCharacter = range.getBoundingClientRect();
          const star = marker.getBoundingClientRect();
          return (
            star.bottom > finalCharacter.top && star.top < finalCharacter.bottom
          );
        }),
    ).toBe(true);
    const headerControlHeights = await page
      .locator(
        ".reader-context-book-picker, .reader-version-select-wrap .control-select-trigger, .reader-context-actions > .reader-context-button, .reader-hamburger-btn",
      )
      .evaluateAll((controls) =>
        controls
          .map((control) => control.getBoundingClientRect().height)
          .filter((height) => height > 0),
      );
    expect(headerControlHeights).toEqual(headerControlHeights.map(() => 44));
    const topbarBox = await page.locator(".topbar").boundingBox();
    const bibleReaderBox = await page.locator(".bible-reader").boundingBox();
    expect(topbarBox).not.toBeNull();
    expect(bibleReaderBox).not.toBeNull();
    expect(bibleReaderBox!.y).toBeLessThanOrEqual(
      topbarBox!.y + topbarBox!.height + 1,
    );
    await expect(page.locator(".bible-reader")).toHaveCSS(
      "border-top-width",
      "0px",
    );
    await page
      .getByRole("button", {
        name: "Lihat 54 rujukan silang untuk Kejadian 1:1",
      })
      .click();
    await expect(
      page.getByText(
        /Sebab enam hari lamanya TUHAN menjadikan langit dan bumi/,
      ),
    ).toBeVisible();
    await page.getByRole("button", { name: "Tutup rujukan" }).click();

    await page.getByRole("button", { name: "Menu Alkitab" }).click();
    await expect(
      page.getByRole("radiogroup", { name: "Pilih Warna Aksen" }),
    ).toHaveCount(0);
    await page.getByText("Tampilan Belah", { exact: true }).click();

    const panes = page.locator(".bible-pane");
    await expect(panes).toHaveCount(2);
    const boxes = await panes.evaluateAll((elements) =>
      elements.map((element) => {
        const box = element.getBoundingClientRect();
        return { top: box.top, bottom: box.bottom };
      }),
    );
    expect(boxes[0]!.bottom).toBeLessThanOrEqual(boxes[1]!.top);
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);

    await page.goto("/GYSApp-Tauri/lainnya");
    await expect(
      page.getByRole("radiogroup", { name: "Pilih Warna Aksen" }),
    ).toBeVisible();
  });

  test("Bible pack loading preserves reader geometry before the pack is ready", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => {
      localStorage.setItem("gys-bible-book", "1");
      localStorage.setItem("gys-bible-chapter", "1");
      localStorage.setItem("gys-bible-split-v1", "1");
      localStorage.setItem("gys-bible-secondary-version", "b_tb");
    });
    await page.route("**/offline/bible/tb-reader.json", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1_200));
      await route.continue();
    });

    for (const viewport of [
      { width: 320, height: 720 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/GYSApp-Tauri/bible");

      const loading = page.getByTestId("bible-loading-reader");
      await expect(loading).toBeVisible({ timeout: 5_000 });
      await expect(page.getByRole("status")).toContainText(
        "Membuka paket TB offline",
      );

      const loadingGeometry = await loading.evaluate((element) => {
        const reader = element.getBoundingClientRect();
        const layout = element
          .querySelector<HTMLElement>(".bible-loading-layout")!
          .getBoundingClientRect();
        const panes = element.querySelectorAll<HTMLElement>(
          ".bible-loading-pane",
        );
        return {
          readerTop: reader.top,
          readerHeight: reader.height,
          layoutHeight: layout.height,
          paneCount: panes.length,
          paneHeights: [...panes].map(
            (pane) => pane.getBoundingClientRect().height,
          ),
          paneWidths: [...panes].map(
            (pane) => pane.getBoundingClientRect().width,
          ),
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: document.documentElement.clientWidth,
          animationName: getComputedStyle(
            element.querySelector<HTMLElement>(".bible-loading-line")!,
          ).animationName,
        };
      });

      expect(loadingGeometry.paneCount).toBe(2);
      expect(loadingGeometry.readerHeight).toBeGreaterThan(300);
      expect(loadingGeometry.layoutHeight).toBeGreaterThan(280);
      expect(loadingGeometry.paneHeights.every((height) => height > 120)).toBe(
        true,
      );
      expect(
        Math.abs(
          loadingGeometry.paneWidths[0]! - loadingGeometry.paneWidths[1]!,
        ),
      ).toBeLessThanOrEqual(1);
      expect(loadingGeometry.documentWidth).toBeLessThanOrEqual(
        loadingGeometry.viewportWidth + 1,
      );
      expect(loadingGeometry.animationName).toBe("none");

      await expect(
        page.locator(".bible-reader:not(.bible-loading-reader)"),
      ).toBeVisible({ timeout: 15_000 });
      const settledGeometry = await page
        .locator(".bible-reader:not(.bible-loading-reader)")
        .evaluate((element) => {
          const reader = element.getBoundingClientRect();
          return {
            readerTop: reader.top,
            documentWidth: document.documentElement.scrollWidth,
            viewportWidth: document.documentElement.clientWidth,
          };
        });
      expect(
        Math.abs(settledGeometry.readerTop - loadingGeometry.readerTop),
      ).toBeLessThanOrEqual(4);
      expect(settledGeometry.documentWidth).toBeLessThanOrEqual(
        settledGeometry.viewportWidth + 1,
      );
    }

    expect(pageErrors).toEqual([]);
  });

  test("Bible split panes keep one surface across device classes", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem("gys-bible-book", "1");
      localStorage.setItem("gys-bible-chapter", "1");
      localStorage.setItem("gys-bible-split-v1", "1");
      localStorage.setItem("gys-bible-secondary-version", "b_tb");
    });

    for (const viewport of [
      { width: 320, height: 720 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/GYSApp-Tauri/bible");
      await expect(page.locator(".bible-reader.is-split")).toBeVisible({
        timeout: 20_000,
      });
      const panes = page.locator(".bible-reader.is-split .bible-pane");
      await expect(panes).toHaveCount(2);
      const snapshot = await panes.evaluateAll((elements) => {
        const read = (element: Element) => {
          const node = element as HTMLElement;
          const box = node.getBoundingClientRect();
          const heading = node.querySelector<HTMLElement>(".reader-heading")!;
          const list = node.querySelector<HTMLElement>(".verse-list")!;
          return {
            left: box.left,
            top: box.top,
            right: box.right,
            bottom: box.bottom,
            width: box.width,
            background: getComputedStyle(node).backgroundColor,
            headingFont: getComputedStyle(heading).fontFamily,
            headingSize: getComputedStyle(heading).fontSize,
            listPadding: getComputedStyle(list).padding,
            listOverflow: getComputedStyle(list).overflowY,
          };
        };
        return elements.map(read);
      });

      expect(snapshot[0]!.background).toBe(snapshot[1]!.background);
      expect(snapshot[0]!.headingFont).toBe(snapshot[1]!.headingFont);
      expect(snapshot[0]!.headingSize).toBe(snapshot[1]!.headingSize);
      expect(snapshot[0]!.listPadding).toBe(snapshot[1]!.listPadding);
      expect(snapshot[0]!.listOverflow).toBe(snapshot[1]!.listOverflow);
      expect(snapshot[0]!.right).toBeGreaterThan(snapshot[0]!.left);
      expect(snapshot[1]!.right).toBeGreaterThan(snapshot[1]!.left);

      if (viewport.width <= 680) {
        expect(Math.abs(snapshot[0]!.left - snapshot[1]!.left)).toBeLessThan(1);
        expect(snapshot[1]!.top).toBeGreaterThan(snapshot[0]!.top);
      } else {
        expect(Math.abs(snapshot[0]!.top - snapshot[1]!.top)).toBeLessThan(1);
        expect(snapshot[1]!.left).toBeGreaterThan(snapshot[0]!.left);
        expect(
          Math.abs(snapshot[0]!.width - snapshot[1]!.width),
        ).toBeLessThanOrEqual(1);
      }
      await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
    }
  });

  test("dashboard uses an adaptive compact scale without wasting desktop space", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    // Deterministic Sauh entry keeps layout assertions independent of live
    // upstream latency; skeleton/stale-policy is covered by dedicated specs.
    const todaySlug = `sbj${new Date().toISOString().slice(2, 10).replaceAll("-", "")}`;
    const todaySauh = {
      id: todaySlug,
      title: "Renungan hari ini",
      reference: "Yohanes 3:16",
      verse: "Karena begitu besar kasih Allah akan dunia ini.",
      body: "Isi renungan resmi untuk pengujian tata letak beranda.",
      url: `https://tjc.org/id/gerakan-baca-alkitab/${todaySlug}/`,
      updatedAt: new Date().toISOString(),
      source: "tjc.org",
    };
    await page.route("**/offline/sauh.json", (route) =>
      route.fulfill({ json: { items: [todaySauh] } }),
    );
    await page.route("**/wp-json/wp/v2/posts**", (route) =>
      route.fulfill({ json: [todaySauh] }),
    );
    await page.goto("/GYSApp-Tauri/");
    await expect(page.locator(".home-grid")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".verse-actions > *")).toHaveCount(1);
    const phone = await page.evaluate(() => {
      const action = document.querySelector(".verse-actions > *")!;
      return {
        heading: Number.parseFloat(
          getComputedStyle(document.querySelector(".home-page h1")!).fontSize,
        ),
        actionTop: action ? action.getBoundingClientRect().top : 0,
        mediaTop: document
          .querySelector(".home-media-section")!
          .getBoundingClientRect().top,
      };
    });
    expect(phone.heading).toBeLessThanOrEqual(23);
    expect(phone.actionTop).toBeGreaterThan(0);
    expect(phone.mediaTop).toBeLessThan(720);
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);

    await page.setViewportSize({ width: 1440, height: 900 });
    const desktop = await page.evaluate(() => ({
      heading: Number.parseFloat(
        getComputedStyle(document.querySelector(".home-page h1")!).fontSize,
      ),
      continueHeight: document
        .querySelector(".continue-panel")!
        .getBoundingClientRect().height,
      verseRight: document
        .querySelector(".verse-panel")!
        .getBoundingClientRect().right,
      mediaLeft: document
        .querySelector(".home-media-section")!
        .getBoundingClientRect().left,
    }));
    expect(desktop.heading).toBeLessThanOrEqual(34);
    expect(desktop.continueHeight).toBeLessThan(180);
    expect(desktop.mediaLeft).toBeGreaterThan(desktop.verseRight);
  });

  test("faith rows keep the PDF action and Catatan action separated", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "gys-faith-pdf-1",
        JSON.stringify({ page: 4, total: 10, updatedAt: Date.now() }),
      );
    });

    for (const viewport of [
      { width: 320, height: 720 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/GYSApp-Tauri/iman");
      await expect(page.locator(".faith-row").first()).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByText("Baca PDF", { exact: true })).toHaveCount(0);
      await expect(page.locator(".faith-row-summary").first()).toContainText(
        "Catatan",
      );

      const rows = await page.locator(".faith-row").evaluateAll((elements) =>
        elements.slice(0, 6).map((element) => {
          const row = element.getBoundingClientRect();
          const heading = element
            .querySelector<HTMLElement>(".faith-row-heading")!
            .getBoundingClientRect();
          const action = element
            .querySelector<HTMLElement>(".faith-row-summary")!
            .getBoundingClientRect();
          return {
            row: {
              left: row.left,
              right: row.right,
              width: row.width,
              scrollWidth: (element as HTMLElement).scrollWidth,
              clientWidth: (element as HTMLElement).clientWidth,
            },
            heading: { left: heading.left, right: heading.right },
            action: {
              left: action.left,
              right: action.right,
              width: action.width,
              height: action.height,
            },
          };
        }),
      );

      for (const { row, heading, action } of rows) {
        if (row.width === 0 || action.width === 0) continue;
        expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth + 1);
        expect(action.width).toBeGreaterThanOrEqual(44);
        // CSS pixels can land at 43.99997 on device-pixel boundaries.
        expect(action.height).toBeGreaterThanOrEqual(44 - 0.01);
        expect(action.left).toBeGreaterThanOrEqual(row.left - 1);
        expect(action.right).toBeLessThanOrEqual(row.right + 1);
        expect(heading.left).toBeGreaterThanOrEqual(row.left - 1);
        expect(heading.right).toBeLessThanOrEqual(action.left - 8);
      }
      await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
    }
  });

  test("legacy and unknown routes stay explicit across locales and devices", async ({
    page,
  }) => {
    const copies = [
      {
        locale: "id",
        more: "Lainnya",
        title: "Halaman tidak ditemukan",
        body: "Alamat ini tidak tersedia. Kembali ke Beranda untuk melanjutkan.",
        home: "Kembali ke Beranda",
      },
      {
        locale: "en",
        more: "More",
        title: "Page not found",
        body: "This address is not available. Return home to continue.",
        home: "Back to Home",
      },
      {
        locale: "zh",
        more: "更多",
        title: "页面未找到",
        body: "此地址不可用。返回主页以继续。",
        home: "返回主页",
      },
    ] as const;
    const viewports = [
      { width: 320, height: 720 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1440, height: 900 },
    ];
    const runtimeErrors: string[] = [];
    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") runtimeErrors.push(message.text());
    });
    await page.addInitScript(() => {
      const locale = new URLSearchParams(window.location.search).get(
        "__gys_locale",
      );
      if (!locale) return;
      localStorage.setItem(
        "gys-shell-settings-v1",
        JSON.stringify({ version: 1, locale, theme: "light" }),
      );
      localStorage.setItem("gys-locale", locale);
    });

    for (const copy of copies) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/GYSApp-Tauri/more?__gys_locale=${copy.locale}`);
      await expect(page).toHaveURL(/\/lainnya$/);
      await expect(
        page.getByRole("heading", { name: copy.more, exact: true }),
      ).toBeVisible({ timeout: 15_000 });

      for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        await page.goto(
          `/GYSApp-Tauri/route-that-does-not-exist?__gys_locale=${copy.locale}`,
        );
        const notFound = page.getByTestId("not-found-page");
        await expect(notFound).toBeVisible({ timeout: 15_000 });
        await expect(
          notFound.getByRole("heading", { name: copy.title, exact: true }),
        ).toBeVisible();
        await expect(
          notFound.getByText(copy.body, { exact: true }),
        ).toBeVisible();
        const home = notFound.getByRole("link", {
          name: copy.home,
          exact: true,
        });
        await expect(home).toHaveCSS("min-height", "44px");
        await home.focus();
        await expect(home).toBeFocused();
        await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
        if (viewport.width === 390) {
          const results = await new AxeBuilder({ page }).analyze();
          expect(
            results.violations,
            JSON.stringify(results.violations, null, 2),
          ).toEqual([]);
        }
      }
    }

    expect(runtimeErrors).toEqual([]);
  });

  test("Kidung catalog keeps search and collection controls usable on mobile", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/GYSApp-Tauri/kidung");
    await expect(
      page.getByRole("heading", { name: "Kidung", exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".reader-context-bar")).toHaveCount(0);
    await expect(page.locator(".brand-mark")).toBeVisible();

    const search = page.getByRole("textbox", { name: "Cari lagu" });
    await expect(search).toBeVisible();
    await expect
      .poll(() =>
        search.evaluate((element) => element.getBoundingClientRect().width),
      )
      .toBeGreaterThan(200);
    await expect(page.locator('summary[aria-label="Koleksi"]')).toBeVisible();
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);

    await search.click();
    await expect(search).toBeFocused();
    await search.fill("Allah Pujilah");
    await expect(
      page.getByRole("button", {
        name: "Pujilah Allah Yang Maha Esa",
        exact: true,
      }),
    ).toBeVisible();
  });

  test("Lainnya keeps primary settings ahead of compact resource and tool groups", async ({
    page,
  }) => {
    for (const viewport of [
      { width: 320, height: 720 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/GYSApp-Tauri/lainnya");
      await expect(
        page.getByRole("heading", { name: "Lainnya", exact: true }),
      ).toBeVisible({ timeout: 15_000 });

      const grid = page.locator(".more-grid");
      const order = await grid.locator(":scope > *").evaluateAll((elements) =>
        elements.map((element) => ({
          account: element.classList.contains("account-card"),
          appearance: element.classList.contains("appearance-card"),
          resources: element.classList.contains("more-resource-group"),
          secondary: element.classList.contains("more-secondary-group"),
        })),
      );
      expect(order.map((item) => Object.values(item).indexOf(true))).toEqual([
        0, 1, 2, 3,
      ]);

      const boxes = await page
        .locator(
          ".account-card, .appearance-card, .more-resource-group, .more-secondary-group",
        )
        .evaluateAll((elements) =>
          elements.map((element) => {
            const box = element.getBoundingClientRect();
            return { top: box.top, width: box.width };
          }),
        );
      expect(boxes).toHaveLength(4);
      expect(boxes[0]!.top).toBeLessThan(boxes[1]!.top);
      expect(boxes[1]!.top).toBeLessThan(boxes[2]!.top);
      expect(boxes[2]!.top).toBeLessThan(boxes[3]!.top);

      const compactActions = await page
        .locator(
          ".more-secondary-grid > .more-action, .more-secondary-grid > .device-data-tools",
        )
        .evaluateAll((elements) =>
          elements.map((element) => {
            const box = element.getBoundingClientRect();
            return {
              height: box.height,
              right: box.right,
              left: box.left,
            };
          }),
        );
      for (const action of compactActions) {
        expect(action.height).toBeGreaterThanOrEqual(44);
        expect(action.left).toBeGreaterThanOrEqual(-1);
        expect(action.right).toBeLessThanOrEqual(viewport.width + 1);
      }

      await expect(page.locator(".more-resource-group")).toContainText(
        "Paket lokal",
      );
      await expect(page.locator(".more-resource-group")).toContainText(
        "Manajemen Aset",
      );
      await expect(page.locator(".more-secondary-group")).toContainText(
        "Laporkan masalah",
      );
      await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
    }
  });

  test("non-reader route loading preserves shell geometry until the page arrives", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    let holdNextScript = false;
    await page.route("**/*.js", async (route) => {
      if (holdNextScript && route.request().url().includes("/assets/")) {
        holdNextScript = false;
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
      await route.continue();
    });

    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto("/GYSApp-Tauri/");
    await expect(
      page.getByRole("heading", { name: "Selamat datang kembali" }),
    ).toBeVisible();
    holdNextScript = true;
    await page
      .locator('.navigation-shell .nav-item[aria-label="Iman"]')
      .click();

    const loading = page.getByTestId("non-reader-route-loading");
    await expect(loading).toBeVisible({ timeout: 2_000 });
    await expect(loading).toHaveAttribute("data-route", "faith");
    await expect(loading).toHaveAttribute("aria-busy", "true");

    for (const viewport of [
      { width: 320, height: 720 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      const geometry = await page.evaluate(() => {
        const skeleton = document.querySelector<HTMLElement>(
          '[data-testid="non-reader-route-loading"]',
        );
        const nav = document.querySelector<HTMLElement>(".navigation-shell");
        if (!skeleton || !nav) return null;
        const skeletonBox = skeleton.getBoundingClientRect();
        const navBox = nav.getBoundingClientRect();
        return {
          skeletonLeft: skeletonBox.left,
          skeletonRight: skeletonBox.right,
          navLeft: navBox.left,
          navRight: navBox.right,
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: document.documentElement.clientWidth,
        };
      });
      expect(geometry).not.toBeNull();
      expect(geometry!.skeletonLeft).toBeGreaterThanOrEqual(0);
      expect(geometry!.skeletonRight).toBeLessThanOrEqual(viewport.width + 1);
      expect(geometry!.navLeft).toBeGreaterThanOrEqual(0);
      expect(geometry!.navRight).toBeLessThanOrEqual(viewport.width + 1);
      expect(geometry!.documentWidth).toBeLessThanOrEqual(
        geometry!.viewportWidth + 1,
      );
    }

    await expect(
      page.getByRole("heading", { name: "Dasar Kepercayaan" }),
    ).toBeVisible({ timeout: 15_000 });
    expect(pageErrors).toEqual([]);
  });

  test("lazy route errors keep the shell and expose a working retry", async ({
    page,
  }) => {
    let abortedFaithChunk = false;
    let failFaithChunk = true;
    await page.route("**/assets/faith-*.js", async (route) => {
      if (failFaithChunk) {
        abortedFaithChunk = true;
        await route.abort();
        return;
      }
      await route.continue();
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/GYSApp-Tauri/");
    await expect(
      page.getByRole("heading", { name: "Selamat datang kembali" }),
    ).toBeVisible();
    await page
      .locator('.navigation-shell .nav-item[aria-label="Iman"]')
      .click();
    await expect.poll(() => abortedFaithChunk).toBe(true);

    await expect(page.getByTestId("route-recovery")).toBeVisible({
      timeout: 8_000,
    });
    await expect(page.locator(".topbar")).toBeVisible();
    await expect(page.locator(".navigation-shell")).toBeVisible();
    const retry = page.getByRole("button", { name: "Coba lagi" });
    await expect(retry).toBeVisible();
    await expect(retry).toHaveCSS("min-height", "44px");

    failFaithChunk = false;
    await retry.click();
    await expect(
      page.getByRole("heading", { name: "Dasar Kepercayaan" }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("focused hymn reader keeps navigation and actions accessible", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/GYSApp-Tauri/kidung/hymn-001");
    await expect(
      page.getByRole("heading", { name: /Pujilah Allah Yang Maha Esa/ }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".reader-context-bar")).toBeHidden();
    await expect(page.locator(".app-frame .topbar")).toBeHidden();
    await expect(page.locator(".app-frame .navigation-shell")).toBeHidden();
    await expect(page.locator(".hymn-text-toolbar")).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole("button", { name: "Tampilkan chord" }),
    ).toBeVisible();
    await expect(page.getByRole("tab", { name: "PDF" })).toBeVisible();
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
    await expect(
      page.locator(".hymn-detail-page .detail-actions .hymn-action-primary"),
    ).toHaveCount(0);
  });

  test("mobile hymn text mode folds secondary actions and reader settings", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/GYSApp-Tauri/kidung/hymn-001");
    await expect(
      page.getByRole("heading", { name: /Pujilah Allah Yang Maha Esa/ }),
    ).toBeVisible({ timeout: 15_000 });

    await expect(
      page.locator(".hymn-detail-page .detail-actions .hymn-action"),
    ).toHaveCount(1);
    await expect(page.locator(".hymn-more-actions")).toBeVisible();
    await expect(
      page.locator(".hymn-more-actions .hymn-more-actions-panel"),
    ).toBeHidden();
    await expect(page.locator(".hymn-reader-settings")).toBeVisible();
    await expect(
      page.locator(".hymn-reader-settings .song-controls"),
    ).toBeHidden();

    await expect(page.locator(".hymn-text-toolbar")).toBeVisible();
    await expect(page.locator(".lyrics-sheet")).toBeVisible();
    await expect(page.locator(".hymn-text-footer")).toBeVisible();
    const geometry = await page.evaluate(() => {
      const sheet = document.querySelector(".lyrics-sheet")!;
      const footer = document.querySelector(".hymn-text-footer")!;
      return {
        sheet: sheet.getBoundingClientRect().toJSON(),
        footer: footer.getBoundingClientRect().toJSON(),
        bodyHeight: document.body.scrollHeight,
      };
    });
    expect(geometry.sheet.top).toBeLessThan(180);
    expect(geometry.sheet.height).toBeGreaterThan(400);
    expect(geometry.sheet.bottom).toBeLessThanOrEqual(geometry.footer.top + 1);
    expect(geometry.footer.bottom).toBeLessThanOrEqual(844);
    expect(geometry.bodyHeight).toBeLessThanOrEqual(844);
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
  });

  test("hymn swipe changes one verse at a time and crosses songs at the boundary", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/GYSApp-Tauri/kidung/hymn-001");
    await expect(page.getByText("Bait 1 dari 3", { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    await touchSwipe(page);
    await expect(
      page.getByText("Bait 2 dari 3", { exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(/hymn-001$/);
    await touchSwipe(page);
    await expect(
      page.getByText("Bait 3 dari 3", { exact: true }),
    ).toBeVisible();
    await touchSwipe(page);
    await expect(page).toHaveURL(/hymn-002$/);
  });

  test("hymn pinch zoom is smooth and persists its text size", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/GYSApp-Tauri/kidung/hymn-001");
    const lyrics = page.locator(".lyrics-sheet");
    await expect(lyrics).toBeVisible({ timeout: 15_000 });
    const initialSize = await lyrics.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).fontSize),
    );

    await lyrics.evaluate((element) => {
      const fire = (type: string, pointerId: number, clientX: number) =>
        element.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            pointerId,
            pointerType: "touch",
            isPrimary: pointerId === 1,
            buttons: type === "pointerup" ? 0 : 1,
            clientX,
            clientY: 420,
          }),
        );
      fire("pointerdown", 1, 120);
      fire("pointerdown", 2, 220);
      fire("pointermove", 2, 280);
      fire("pointerup", 2, 280);
      fire("pointerup", 1, 120);
    });

    await expect
      .poll(() =>
        lyrics.evaluate((element) =>
          Number.parseFloat(getComputedStyle(element).fontSize),
        ),
      )
      .toBeGreaterThan(initialSize);
    const persistedSize = await page.evaluate(() => {
      const saved = localStorage.getItem("gys-hymn-typography-v1");
      return saved
        ? JSON.parse(saved).songs?.["hymn-001"]?.fontSize
        : undefined;
    });
    expect(persistedSize).toBeGreaterThan(initialSize);
    await page.reload();
    await expect(lyrics).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(() =>
        lyrics.evaluate((element) =>
          Number.parseFloat(getComputedStyle(element).fontSize),
        ),
      )
      .toBeGreaterThan(initialSize);
  });

  test("Kidung local navigation keeps playlist and settings in the same space", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/GYSApp-Tauri/kidung?section=playlist");
    await expect(
      page.getByRole("heading", { name: "Playlist", exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    const localNav = page.locator(".kidung-local-nav");
    await expect(localNav.getByRole("link", { name: "Kidung" })).toBeVisible();
    await expect(
      localNav.getByRole("link", { name: "Playlist" }),
    ).toHaveAttribute("aria-current", "page");
    await localNav.getByRole("link", { name: "Pengaturan" }).click();
    await expect(
      page.getByRole("heading", { name: "Pengaturan", exact: true }),
    ).toBeVisible();
    await localNav.getByRole("link", { name: "Kidung" }).click();
    await expect(page.locator(".pujian-list > li").first()).toBeVisible({
      timeout: 15_000,
    });
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
  });

  test("Kidung hides MIDI transport until its SoundFont is installed", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/GYSApp-Tauri/kidung/hymn-001");
    await expect(
      page.getByRole("heading", { name: /Pujilah Allah Yang Maha Esa/ }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("button", { name: "Putar MIDI", exact: true }),
    ).toHaveCount(0);
    await expect(page.locator(".media-surface")).toHaveCount(0);
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
  });

  test("text reader exposes the active SoundFont and instrument before playback", async ({
    page,
  }) => {
    await page.goto("/GYSApp-Tauri/");
    await page.evaluate(async () => {
      const cacheName = "gys-distributed-v1-GeneralUser-GS-e2e";
      const cacheKey =
        "https://gysapp.local/distributed-assets/GeneralUser-GS/e2e";
      const cache = await caches.open(cacheName);
      await cache.put(cacheKey, new Response(new Uint8Array(1_000_000)));
      localStorage.setItem(
        "gys-distributed-assets-v1",
        JSON.stringify({
          "GeneralUser-GS": {
            code: "GeneralUser-GS",
            kind: "soundfont",
            version: "e2e",
            releaseTag: "e2e",
            installFileName: "GeneralUser-GS.sf2",
            packageSizeBytes: 1_000_000,
            packageChecksumSha256: "e2e",
            cacheName,
            cacheKey,
            payloadBytes: 1_000_000,
            installedAt: "2026-08-19T00:00:00.000Z",
          },
        }),
      );
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/GYSApp-Tauri/kidung/hymn-001");
    await expect(
      page.getByRole("button", { name: "Putar MIDI", exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await page.locator(".hymn-reader-settings-summary").click();
    await page.locator(".hymn-music-settings > summary").click();
    await expect(page.getByText("SoundFont aktif")).toBeVisible();
    await expect(
      page.getByText("GeneralUser-GS", { exact: true }),
    ).toBeVisible();
    const instrument = page.getByLabel("Instrumen MIDI");
    await expect(instrument).toHaveValue("-1");
    await instrument.selectOption("40");
    await expect(instrument).toHaveValue("40");
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
  });

  test("Kidung PDF mode presents a compact viewer chrome before the sheet", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/GYSApp-Tauri/kidung/hymn-001");
    await expect(
      page.getByRole("heading", { name: /Pujilah Allah Yang Maha Esa/ }),
    ).toBeVisible({ timeout: 15_000 });
    await page.getByRole("tab", { name: "PDF" }).click();

    await expect(page.locator(".pdf-reader-hymn")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator(".hymn-pdf-viewer-chrome")).toBeVisible();
    await expect(page.locator(".app-frame .topbar")).toBeHidden();
    await expect(page.locator(".app-frame .navigation-shell")).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Kembali ke lirik" }),
    ).toBeVisible();
    await expect
      .poll(
        () =>
          page
            .locator(".pdf-pages canvas")
            .first()
            .evaluate((canvas) => canvas.height),
        { timeout: 30_000 },
      )
      .toBeGreaterThan(0);

    const stageTop = await page
      .locator(".pdf-reader-hymn .pdf-stage")
      .evaluate((element) => element.getBoundingClientRect().top);
    expect(stageTop).toBeLessThan(844);
    await expect
      .poll(() =>
        page
          .locator(".pdf-reader-hymn .pdf-stage")
          .evaluate((element) => element.getBoundingClientRect().height),
      )
      .toBeGreaterThan(650);
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);

    await expect(page.locator(".pdf-advanced-controls")).not.toHaveClass(
      /is-open/,
    );
    const pdfOptions = page.getByRole("button", { name: "Opsi PDF" });
    await expect(pdfOptions).toBeVisible();
    await pdfOptions.click();
    await expect(page.locator(".pdf-advanced-controls.is-open")).toBeVisible();
  });

  test("Bible mobile toolbar keeps secondary controls compact", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/GYSApp-Tauri/bible");
    await expect(page.getByRole("heading", { name: /Kejadian 1/ })).toBeVisible(
      {
        timeout: 15_000,
      },
    );
    await expect(page.locator(".reader-context-bar")).toBeVisible();
    await expect(page.locator(".brand-mark")).toHaveCount(0);

    const scrubber = page.locator(".chapter-scrubber input");
    await expect(scrubber).toBeHidden();
    await expect(page.locator(".bible-reader article").first()).toBeVisible();
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);

    const handle = page.getByRole("button", {
      name: "Geser judul untuk berpindah pasal",
    });
    await handle.click();
    const searchInput = page.getByPlaceholder("Cari kitab atau isi ayat…");
    await expect(searchInput).toBeVisible();
    await searchInput.fill("Kejadian");
    await page.getByRole("button", { name: "Tutup", exact: false }).click();

    await page.locator(".reader-hamburger-btn").click();
    const speechToggle = page.locator(
      ".reader-hamburger-drawer .speech-settings-toggle",
    );
    await expect(speechToggle).toBeVisible();
    await expect(speechToggle).toHaveAttribute("aria-expanded", "false");
    await speechToggle.click();
    const engine = page.getByLabel("Mesin");
    await expect(engine).toBeVisible();
    await expect(engine.locator("option")).toHaveText([
      "Edge TTS",
      "TTS lokal",
    ]);
  });

  test("topbar theme and speech endpoint settings stay localized", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const copies = {
      id: {
        locale: "id",
        theme: "Tema",
        themes: ["Otomatis", "Terang", "Gelap", "AMOLED Gelap", "Sepia Hangat"],
        engine: "Mesin",
        endpoint: "https://... (bawaan)",
      },
      en: {
        locale: "en",
        theme: "Theme",
        themes: ["Automatic", "Light", "Dark", "AMOLED Dark", "Warm Sepia"],
        engine: "Engine",
        endpoint: "https://... (default)",
      },
      zh: {
        locale: "zh",
        theme: "主题",
        themes: ["自动", "明亮", "深色", "AMOLED 深色", "暖褐"],
        engine: "引擎",
        endpoint: "https://...（默认）",
      },
    } as const;
    const viewports = [
      { width: 320, height: 720 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 1440, height: 900 },
    ];

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
      localStorage.setItem("gys-speech-engine-v1", "edge");
    });

    for (const selected of Object.values(copies)) {
      for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        await page.goto(`/GYSApp-Tauri/?__gys_locale=${selected.locale}`);

        if (viewport.width >= 600) {
          const themeTrigger = page.getByRole("button", {
            name: selected.theme,
            exact: true,
          });
          await themeTrigger.click();
          const themeMenu = page.getByRole("listbox", {
            name: selected.theme,
            exact: true,
          });
          await expect(themeMenu).toBeVisible();
          await expect(themeMenu.getByRole("option")).toHaveText(
            selected.themes,
          );
          const themeBox = await themeMenu.boundingBox();
          expect(themeBox).not.toBeNull();
          expect(themeBox!.x).toBeGreaterThanOrEqual(0);
          expect(themeBox!.x + themeBox!.width).toBeLessThanOrEqual(
            viewport.width + 1,
          );
          await themeTrigger.click();
        }
        await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);

        await page.goto(`/GYSApp-Tauri/bible?__gys_locale=${selected.locale}`);
        await expect(
          page.getByRole("heading", { name: /Kejadian 1/ }),
        ).toBeVisible({
          timeout: 15_000,
        });
        await page.locator(".reader-hamburger-btn").click();
        const speechToggle = page.locator(
          ".reader-hamburger-drawer .speech-settings-toggle",
        );
        await speechToggle.click();
        await expect(
          page.getByRole("combobox", { name: selected.engine, exact: true }),
        ).toBeVisible();
        await expect(
          page.getByPlaceholder(selected.endpoint, { exact: true }),
        ).toBeVisible();
        await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
      }

      for (const viewport of [
        { width: 768, height: 1024 },
        { width: 1440, height: 900 },
      ]) {
        await page.setViewportSize(viewport);
        await page.goto(`/GYSApp-Tauri/kidung?__gys_locale=${selected.locale}`);
        const themeTrigger = page.getByRole("button", {
          name: selected.theme,
          exact: true,
        });
        await themeTrigger.click();
        const themeMenu = page.getByRole("listbox", {
          name: selected.theme,
          exact: true,
        });
        await expect(themeMenu).toBeVisible();
        await expect(themeMenu.getByRole("option")).toHaveText(selected.themes);
        await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
        await themeTrigger.click();
      }
    }
  });

  test("Bible navigation dialog supports verse content search and scope filter", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/GYSApp-Tauri/bible");
    await expect(page.getByRole("heading", { name: /Kejadian 1/ })).toBeVisible(
      {
        timeout: 15_000,
      },
    );

    // Tap title picker to open navigation modal
    await page
      .getByRole("button", { name: "Geser judul untuk berpindah pasal" })
      .click();
    const dialog = page.getByRole("dialog", { name: "Pilih Kitab & Pasal" });
    await expect(dialog).toBeVisible();
    await expect(
      page.getByPlaceholder("Cari kitab atau isi ayat…"),
    ).toBeFocused();

    // Verify scope pills: Semua, PL, PB, and active book (Kejadian Saja)
    await expect(
      page.getByRole("button", { name: "Semua (66)" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "PL (39)" })).toBeVisible();
    await expect(page.getByRole("button", { name: "PB (27)" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Kejadian Saja" }),
    ).toBeVisible();

    // Search by verse text inside active book
    await page.getByRole("button", { name: "Kejadian Saja" }).click();
    await page
      .getByPlaceholder("Cari kitab atau isi ayat…")
      .fill("menciptakan langit");

    // Results show matched verse item
    const verseResult = page.locator(".bible-picker-verse-item").first();
    await expect(verseResult).toBeVisible();
    await expect(verseResult).toContainText("Kejadian 1:1");
    await expect(verseResult).not.toContainText("<pb/>");
    await expect(verseResult).not.toContainText("<");
    await verseResult.click();

    // Navigates and closes modal
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Geser judul untuk berpindah pasal" }),
    ).toBeFocused();
    await expect(
      page.getByRole("heading", { name: /Kejadian 1/ }),
    ).toBeVisible();
  });

  test("Bible picker traps keyboard focus and restores its trigger", async ({
    page,
  }) => {
    const copy = {
      id: {
        locale: "id",
        handle: "Geser judul untuk berpindah pasal",
        picker: "Pilih Kitab & Pasal",
      },
      en: {
        locale: "en",
        handle: "Drag the title to change chapter",
        picker: "Choose book & chapter",
      },
      zh: {
        locale: "zh",
        handle: "拖动标题切换章节",
        picker: "选择书卷和章节",
      },
    } as const;

    for (const selected of Object.values(copy)) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.addInitScript((nextLocale) => {
        localStorage.setItem("gys-locale", nextLocale);
        localStorage.setItem(
          "gys-shell-settings-v1",
          JSON.stringify({ version: 1, locale: nextLocale, theme: "light" }),
        );
      }, selected.locale);
      await page.goto("/GYSApp-Tauri/bible");
      await expect(
        page.getByRole("heading", { name: /Kejadian 1/ }),
      ).toBeVisible({
        timeout: 15_000,
      });

      const trigger = page.getByRole("button", { name: selected.handle });
      await trigger.focus();
      await trigger.press("Enter");
      const dialog = page.getByRole("dialog", { name: selected.picker });
      await expect(dialog).toBeVisible();
      await expect(
        dialog.getByPlaceholder(
          selected.locale === "id"
            ? "Cari kitab atau isi ayat…"
            : selected.locale === "en"
              ? "Search books or verse text…"
              : "搜索书卷或经文内容…",
        ),
      ).toBeFocused();

      const focusable = dialog.locator(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      );
      await focusable.last().focus();
      await page.keyboard.press("Tab");
      await expect(focusable.first()).toBeFocused();
      await focusable.first().focus();
      await page.keyboard.press("Shift+Tab");
      await expect(focusable.last()).toBeFocused();

      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();

      await trigger.press("Enter");
      await expect(dialog).toBeVisible();
      await page
        .locator(".bible-picker-backdrop")
        .click({ position: { x: 1, y: 1 } });
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
    }
  });

  test("Bible quick picker and drag overlay keep locale and viewport contracts", async ({
    page,
  }) => {
    const copy = {
      id: {
        locale: "id",
        handle: "Geser judul untuk berpindah pasal",
        quick: "Navigasi cepat Alkitab",
        picker: "Pilih Kitab & Pasal",
        close: "Tutup pemilih kitab",
        steps: "Langkah pemilihan",
        placeholder: "Cari kitab atau isi ayat…",
        dragBook: "Menggeser Kitab",
      },
      en: {
        locale: "en",
        handle: "Drag the title to change chapter",
        quick: "Bible quick navigation",
        picker: "Choose book & chapter",
        close: "Close book picker",
        steps: "Selection steps",
        placeholder: "Search books or verse text…",
        dragBook: "Scrubbing Book",
      },
      zh: {
        locale: "zh",
        handle: "拖动标题切换章节",
        quick: "圣经快速导航",
        picker: "选择书卷和章节",
        close: "关闭书卷选择器",
        steps: "选择步骤",
        placeholder: "搜索书卷或经文内容…",
        dragBook: "正在滑动书卷",
      },
    } as const;
    const viewports = [
      { width: 320, height: 720 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 1440, height: 900 },
    ];

    for (const selected of Object.values(copy)) {
      for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        await page.addInitScript((nextLocale) => {
          localStorage.setItem("gys-locale", nextLocale);
          localStorage.setItem(
            "gys-shell-settings-v1",
            JSON.stringify({ version: 1, locale: nextLocale, theme: "light" }),
          );
        }, selected.locale);
        await page.goto("/GYSApp-Tauri/bible");
        await expect(
          page.getByRole("heading", { name: /Kejadian 1/ }),
        ).toBeVisible({
          timeout: 15_000,
        });

        const handle = page.getByRole("button", { name: selected.handle });
        await handle.click();
        const dialog = page.getByRole("dialog", { name: selected.picker });
        await expect(dialog).toBeVisible();
        await expect(
          dialog.getByRole("tablist", { name: selected.steps }),
        ).toBeVisible();
        await expect(
          dialog.getByPlaceholder(selected.placeholder),
        ).toBeVisible();
        await expect(
          dialog.getByRole("button", { name: selected.close }),
        ).toBeVisible();
        const dialogBox = await dialog.boundingBox();
        expect(dialogBox).not.toBeNull();
        expect(dialogBox!.x).toBeGreaterThanOrEqual(0);
        expect(dialogBox!.y).toBeGreaterThanOrEqual(0);
        expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(
          viewport.width + 1,
        );
        expect(dialogBox!.y + dialogBox!.height).toBeLessThanOrEqual(
          viewport.height + 1,
        );
        await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
        await dialog.getByRole("button", { name: selected.close }).click();
        await expect(handle).toBeFocused();

        const handleBox = await handle.boundingBox();
        expect(handleBox).not.toBeNull();
        await page.mouse.move(
          handleBox!.x + handleBox!.width / 2,
          handleBox!.y + handleBox!.height / 2,
        );
        await page.mouse.down();
        await page.mouse.move(
          handleBox!.x + handleBox!.width / 2 + 8,
          handleBox!.y + handleBox!.height / 2,
        );
        const overlay = page.locator(".quick-nav-drag-overlay");
        await expect(overlay).toBeVisible();
        await expect(overlay).toHaveAttribute("aria-label", selected.quick);
        await expect(overlay.locator(".quick-nav-column-header")).toHaveText(
          selected.dragBook,
        );
        await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
        await page.mouse.up();
      }
    }
  });
});
