import { expect, test, type Locator } from "@playwright/test";

test.use({ serviceWorkers: "block" });

// Browser layout can report a 44px CSS box a few thousandths below 44 at a
// device-pixel boundary; keep the product contract at 44px while tolerating
// that measurement rounding.
const geometryEpsilon = 0.01;

async function expectTouchTarget(locator: Locator, min = 44) {
  const box = await locator.boundingBox();
  expect(box, "control should be visible and measurable").not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(min - geometryEpsilon);
  expect(box!.height).toBeGreaterThanOrEqual(min - geometryEpsilon);
}

async function expectPseudoTouchTarget(locator: Locator, min = 44) {
  const size = await locator.evaluate((element) => {
    const style = getComputedStyle(element, "::before");
    return {
      width: Number.parseFloat(style.width),
      height: Number.parseFloat(style.height),
    };
  });
  expect(size.width).toBeGreaterThanOrEqual(min - geometryEpsilon);
  expect(size.height).toBeGreaterThanOrEqual(min - geometryEpsilon);
}

async function expectFullyInViewport(locator: Locator, viewportWidth: number) {
  const box = await locator.boundingBox();
  expect(box, "control should be visible and measurable").not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewportWidth);
}

test("phone Bible and Kidung controls expose comfortable touch targets", async ({
  page,
}) => {
  const phoneWidth = 320;
  await page.setViewportSize({ width: phoneWidth, height: 720 });

  await page.goto("/GYSApp-Tauri/bible");
  await expect(page.getByRole("heading", { name: "Kejadian 1" })).toBeVisible();
  await expectTouchTarget(page.getByRole("button", { name: "Menu Alkitab" }));
  const bookmark = page.getByRole("button", {
    name: "Tandai ayat 1",
    exact: true,
  });
  await expectPseudoTouchTarget(bookmark, 40);
  expect(
    await bookmark.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return (
        document.elementFromPoint(rect.left - 6, rect.top + rect.height / 2) ===
        element
      );
    }),
  ).toBe(true);
  const crossReference = page.getByRole("button", {
    name: "Lihat 54 rujukan silang untuk Kejadian 1:1",
    exact: true,
  });
  await expect(crossReference).toHaveCSS("min-width", "0px");
  await expectPseudoTouchTarget(crossReference, 40);

  await page.goto("/GYSApp-Tauri/kidung");
  await expect(
    page.getByRole("heading", { name: "Kidung", exact: true }),
  ).toBeVisible();
  await expectTouchTarget(page.locator(".pujian-title").first(), 40);
  await expectFullyInViewport(
    page
      .locator(".kidung-local-nav")
      .getByRole("link", { name: "Antrean MIDI", exact: true }),
    phoneWidth,
  );
  await expectFullyInViewport(
    page.getByRole("button", {
      name: "Tambah Pujilah Allah Yang Maha Esa ke antrean MIDI",
      exact: true,
    }),
    phoneWidth,
  );
});

test("phone navigation and compact text actions remain easy to tap", async ({
  page,
}) => {
  const today = new Date();
  const todaySlug = `sbj${today.toISOString().slice(2, 10).replaceAll("-", "")}`;
  const updatedAt = today.toISOString();
  const todaySauh = {
    id: todaySlug,
    title: "Renungan hari ini",
    reference: "Yohanes 3:16",
    verse: "Karena begitu besar kasih Allah akan dunia ini.",
    body: "Isi renungan untuk pengujian target sentuh.",
    url: `https://tjc.org/id/gerakan-baca-alkitab/${todaySlug}/`,
    updatedAt,
    source: "tjc.org" as const,
  };
  await page.route("**/offline/sauh.json", (route) =>
    route.fulfill({ json: { items: [todaySauh] } }),
  );
  await page.route("**/api/v1/content/sauh**", (route) =>
    route.fulfill({ json: { items: [todaySauh] } }),
  );
  await page.route("**/wp-json/wp/v2/posts**", (route) =>
    route.fulfill({
      json: [
        {
          slug: todaySlug,
          title: { rendered: todaySauh.title },
          content: { rendered: `<p>${todaySauh.body}</p>` },
          link: todaySauh.url,
          date: updatedAt,
          modified: updatedAt,
        },
      ],
    }),
  );

  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/GYSApp-Tauri/");
  await expectTouchTarget(page.locator(".brand-mark"), 40);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/GYSApp-Tauri/");
  await expectTouchTarget(
    page.getByRole("link", { name: /Baca Lebih Lanjut/ }),
  );
  const seeAll = page.getByRole("link", { name: /Lihat semua/ }).first();
  await expectTouchTarget(seeAll, 40);

  await page.goto("/GYSApp-Tauri/lainnya?section=data");
  await expectTouchTarget(
    page.getByRole("button", { name: "Periksa versi" }),
    40,
  );
});

test("Sauh and Suara back links stay reachable around their inline text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  // The Suara list has no breadcrumb any more (it pushed the title below its
  // siblings); its detail page still carries one.
  for (const route of ["sauh", "suara/147-menapaki-tiga-iman"]) {
    await page.goto(`/GYSApp-Tauri/${route}`);
    const link = page.locator(".detail-back .text-button").first();
    await expect(link).toBeVisible();
    // The breadcrumb keeps its compact painted row; the target must still be at
    // least 40px tall, so hit testing has to work 11px above and below the text.
    const hit = await link.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const at = (x: number, y: number) =>
        document.elementFromPoint(x, y) === element;
      return {
        above: at(rect.left + rect.width / 2, rect.top - 11),
        below: at(rect.left + rect.width / 2, rect.bottom + 11),
        height: Math.round(rect.height),
      };
    });
    expect(hit.height).toBeLessThan(24);
    expect(hit.above, `${route}: hit area extends above the text`).toBe(true);
    expect(hit.below, `${route}: hit area extends below the text`).toBe(true);
  }
});

test("desktop Sauh outage uses a compact recovery state instead of an empty hero", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route("**/wp-json/wp/v2/posts**", (route) =>
    route.fulfill({ status: 503, body: "upstream unavailable" }),
  );
  await page.route("**/api/v1/content/sauh", (route) =>
    route.fulfill({ status: 503, body: "upstream unavailable" }),
  );
  await page.route("**/offline/sauh.json", (route) =>
    route.fulfill({ status: 503, body: "snapshot unavailable" }),
  );

  await page.goto("/GYSApp-Tauri/");
  const state = page.locator(".sauh-offline-state");
  await expect(state).toBeVisible();
  const panel = page.locator(".verse-panel");
  const box = await panel.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeLessThanOrEqual(420);
  await expectTouchTarget(state.getByRole("button", { name: "Coba lagi" }), 44);
});

test.describe("coarse pointers get the full 44 px target", () => {
  test.use({ hasTouch: true, isMobile: true });

  test("faith actions, audio picker, and the verse marker reach 44 px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => matchMedia("(pointer: coarse)").matches),
    ).toBe(true);

    // The PDF and notes buttons are the only way into those documents on a
    // phone; they used to collapse to 32 px.
    await page.goto("/GYSApp-Tauri/iman");
    // The title is screen-reader-only since the owner dropped the hero header;
    // the region keeps the name, so readiness is read from the rows.
    await expect(
      page.getByRole("region", { name: "Dasar Kepercayaan" }),
    ).toBeVisible();
    await expectTouchTarget(page.locator(".faith-row").first());

    // The reader rule keeps the visible number small, so the hit area is the
    // measurement that matters.
    await page.goto("/GYSApp-Tauri/bible");
    await expect(
      page.getByRole("heading", { name: "Kejadian 1" }),
    ).toBeVisible();
    await expectPseudoTouchTarget(
      page.getByRole("button", { name: "Tandai ayat 1", exact: true }),
    );

    await page.goto("/GYSApp-Tauri/lainnya?section=audio");
    const audioSelect = page.locator(".audio-setting-select").first();
    await expect(audioSelect).toBeVisible();
    await expectTouchTarget(audioSelect);
    // Link-style actions are 40 px by default; a coarse pointer gets 44.
    await expectTouchTarget(page.locator(".audio-setting-link").first());
  });
});

// A coarse pointer can be a 820 px tablet, not only a 320 px phone. Several
// controls were sized for a mouse and lifted to 44 px only inside a
// max-width: 599px block, so a finger on a bigger screen still hit 24-36 px.
test.describe("coarse pointer on a wide screen", () => {
  test.use({ hasTouch: true, viewport: { width: 820, height: 1180 } });

  test("search clear and drawer close reach 44 pixels", async ({ page }) => {
    expect(
      await page.evaluate(() => matchMedia("(pointer: coarse)").matches),
      "the context must report a coarse pointer for this contract to mean anything",
    ).toBe(true);

    await page.goto("/GYSApp-Tauri/iman");
    const search = page.locator(".faith-search-bar input").first();
    await expect(search).toBeVisible({ timeout: 30_000 });
    await search.fill("iman");
    const clear = page.locator(".faith-search-clear").first();
    await expect(clear).toBeVisible();
    await expectTouchTarget(clear);

    await page.goto("/GYSApp-Tauri/");
    const menu = page.locator(".hamburger-button, [aria-controls]").first();
    if (await menu.count()) {
      await menu.click({ force: true });
      const close = page.locator(".hamburger-drawer-close").first();
      if (await close.count()) await expectTouchTarget(close);
    }
  });

  test("every row in the Bible drawer is a tap target", async ({ page }) => {
    expect(
      await page.evaluate(() => matchMedia("(pointer: coarse)").matches),
      "the context must report a coarse pointer for this contract to mean anything",
    ).toBe(true);

    await page.goto("/GYSApp-Tauri/bible?book=kejadian&chapter=1");
    const menu = page.getByRole("button", { name: "Menu Alkitab" });
    await expect(menu).toBeVisible({ timeout: 30_000 });
    await menu.click();
    const drawer = page.locator(".reader-hamburger-drawer");
    await expect(drawer).toBeVisible();

    // The drawer mixes buttons, selects and one prose link; all of them are
    // rows a thumb lands on, so all of them owe the 44 px floor.
    const rows = drawer.locator("button, a[href], select, summary");
    const count = await rows.count();
    expect(count).toBeGreaterThan(4);
    for (let index = 0; index < count; index += 1) {
      const row = rows.nth(index);
      if (!(await row.isVisible())) continue;
      await expectTouchTarget(row);
    }
  });
});

test.describe("a narrow phone keeps its shell targets", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 320, height: 720 },
  });

  test("the brand link and the report mailto are tap targets at 320", async ({
    page,
  }) => {
    expect(
      await page.evaluate(() => matchMedia("(pointer: coarse)").matches),
      "the context must report a coarse pointer for this contract to mean anything",
    ).toBe(true);

    // The logo is the way home; at 320 the mark alone set the link to 40 px.
    await page.goto("/GYSApp-Tauri/");
    const brand = page.locator("a.brand").first();
    await expect(brand).toBeVisible({ timeout: 30_000 });
    await expectTouchTarget(brand);

    // A mailto inside a hint line is still a control.
    await page.goto("/GYSApp-Tauri/lainnya");
    const mail = page
      .locator('.report-card .report-email-hint a[href^="mailto:"]')
      .first();
    await expect(mail).toBeAttached({ timeout: 30_000 });
    await expectTouchTarget(mail);
  });
});

test.describe("a landscape phone keeps every reader control tappable", () => {
  // 844x390 is wider than the 768 px breakpoint, so the shell paints its
  // fine-pointer sizes there. A thumb still lands on it.
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 844, height: 390 },
  });

  const routes = [
    ["/GYSApp-Tauri/kidung", ".pujian-list .pujian-item"],
    ["/GYSApp-Tauri/kidung?section=playlist", ".kidung-index-toolbar"],
    ["/GYSApp-Tauri/kidung/hymn-001", ".hymn-text-title h1"],
    ["/GYSApp-Tauri/bible?book=kejadian&chapter=1", ".verse-content"],
  ] as const;

  test("no reader control is smaller than 44 px", async ({ page }) => {
    expect(
      await page.evaluate(() => matchMedia("(pointer: coarse)").matches),
      "the context must report a coarse pointer for this contract to mean anything",
    ).toBe(true);

    for (const [route, ready] of routes) {
      await page.goto(route);
      await expect(page.locator(ready).first()).toBeVisible({
        timeout: 30_000,
      });
      const small = await page.evaluate(() => {
        const found: string[] = [];
        const seen = new Set<string>();
        for (const element of document.querySelectorAll(
          "button, a[href], input, select, summary, [role=button]",
        )) {
          // A closed disclosure is not painted, so its children keep the
          // layout they had before the entrance animation ran.
          if (element.closest("details:not([open])")) continue;
          const box = element.getBoundingClientRect();
          if (box.width === 0 || box.height === 0) continue;
          const style = getComputedStyle(element);
          if (style.visibility === "hidden" || style.display === "none")
            continue;
          // Visually hidden inputs are labels' partners, not targets.
          if (style.clip === "rect(0px, 0px, 0px, 0px)") continue;
          // The verse line is a press-and-hold text surface: its height is the
          // text's line box, and the explicit control beside it is the verse
          // number, which owns a 44 px ::before hit area.
          if (element.classList.contains("verse-text")) continue;
          // A small glyph can still own a 44 px hit area through ::before.
          const before = getComputedStyle(element, "::before");
          const hitWidth = Math.max(
            box.width,
            Number.parseFloat(before.width) || 0,
          );
          const hitHeight = Math.max(
            box.height,
            Number.parseFloat(before.height) || 0,
          );
          if (hitWidth >= 43.5 && hitHeight >= 43.5) continue;
          const key = `${element.tagName}.${element.className}`;
          if (seen.has(key)) continue;
          seen.add(key);
          found.push(
            `${key} ${Math.round(box.width)}x${Math.round(box.height)}`,
          );
        }
        return found;
      });
      expect(small, `controls under 44 px on ${route}`).toEqual([]);
    }
  });
});
