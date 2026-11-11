import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { composite, contrastRatio, parseCssColor } from "../src/contrast.js";

// Beranda, Alkitab, Suara, and Lainnya were the last routes still outside the
// full-tag audit. The Bible surfaces only exist while open, so each one is
// audited in the state the reader actually sees.

const AXE_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
  "best-practice",
];

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(
    results.violations,
    JSON.stringify(results.violations, null, 2),
  ).toEqual([]);
}

const transparentPixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X2NDWQAAAABJRU5ErkJggg==",
  "base64",
);

// SuaraSejatiFeedSchema requires generatedAt; without it the feed parses to [].
const suaraFeed = {
  source: "tjc.org",
  generatedAt: "2026-10-02T00:00:00.000Z",
  items: [
    {
      id: "a11y-suara-satu",
      title: "Kesaksian Penyertaan Tuhan",
      excerpt: "Cuplikan kesaksian untuk audit.",
      url: "https://tjc.org/id/suarasejati/a11y-suara-satu/",
      publishedAt: "2026-10-01T00:00:00.000Z",
      source: "tjc.org",
    },
    {
      id: "a11y-suara-dua",
      title: "Kesaksian Keluarga",
      excerpt: "Cuplikan kesaksian kedua.",
      url: "https://tjc.org/id/suarasejati/a11y-suara-dua/",
      publishedAt: "2026-09-01T00:00:00.000Z",
      source: "tjc.org",
    },
  ],
};

function todaySauh() {
  const date = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .map((part) => [part.type, part.value]),
  );
  const slug = `sbj${date.year?.slice(-2)}${date.month}${date.day}`;
  return {
    id: slug,
    title: "Renungan hari ini",
    reference: "Yohanes 3:16",
    verse: "Karena begitu besar kasih Allah akan dunia ini.",
    body: "Fixture audit aksesibilitas beranda.",
    url: `https://tjc.org/id/gerakan-baca-alkitab/${slug}/`,
    updatedAt: new Date().toISOString(),
    source: "tjc.org" as const,
  };
}

/** Beranda needs today's Sauh plus both shelves painted before axe runs. */
async function prepareHome(page: Page) {
  const sauh = todaySauh();
  await page.route("**/offline/sauh.json", (route) =>
    route.fulfill({ json: { items: [sauh] } }),
  );
  await page.route("**/wp-json/wp/v2/posts**", (route) =>
    route.fulfill({ json: [sauh] }),
  );
  await page.route("**/offline/suara-sejati.json", (route) =>
    route.fulfill({ json: suaraFeed }),
  );
  await page.route("**/offline/literature.json", (route) =>
    route.fulfill({
      json: {
        source: "tjc.org",
        generatedAt: "2026-09-15T00:00:00.000Z",
        items: [
          {
            id: "a11y-literatur-satu",
            category: "kesaksian",
            title: "Kesaksian Dalam Penyertaan Tuhan",
            description: "Bacaan pembinaan keluarga.",
            url: "https://tjc.org/id/kesaksian/a11y-literatur-satu/",
            format: "article",
            publishedAt: "2026-09-01T00:00:00.000Z",
            updatedAt: "2026-09-01T00:00:00.000Z",
            source: "tjc.org",
          },
        ],
      },
    }),
  );
  await page.route(/^https:\/\//, async (route) => {
    if (route.request().resourceType() === "image") {
      await route.fulfill({ body: transparentPixel, contentType: "image/png" });
      return;
    }
    await route.abort();
  });
}

async function openBible(
  page: Page,
  viewport: { width: number; height: number },
) {
  await page.setViewportSize(viewport);
  await page.addInitScript(() => {
    localStorage.setItem("gys-bible-book", "43");
    localStorage.setItem("gys-bible-chapter", "12");
    localStorage.setItem(
      "gys-shell-settings-v1",
      JSON.stringify({ version: 1, locale: "id", theme: "light" }),
    );
  });
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/GYSApp-Tauri/bible");
  await page.waitForSelector(".picker-book-title", { timeout: 30_000 });
}

async function startQuickNav(page: Page) {
  const handle = page.locator(".quick-nav-handle");
  const handleBox = await handle.boundingBox();
  if (!handleBox)
    throw new Error("Bible quick navigation handle is not measurable");
  const centreX = handleBox.x + handleBox.width / 2;
  const centreY = handleBox.y + handleBox.height / 2;
  await page.mouse.move(centreX, centreY);
  await page.mouse.down();
  await page.mouse.move(centreX + 2, centreY, { steps: 2 });
  await page.mouse.move(centreX + 10, centreY, { steps: 3 });
  await expect(page.locator(".quick-nav-drag-overlay")).toBeVisible();
  await expect(
    page.locator(".quick-nav-drag-overlay .quick-nav-item").first(),
  ).toBeVisible();
}

/** The drawer animates on entry; measure the typography card once settled. */
async function settled(locator: Locator) {
  await locator.evaluate(async (element) => {
    await Promise.all(
      element.getAnimations().map((animation) => animation.finished),
    );
  });
}

// A second collection makes the rail's collection chip render; the mock adds
// one full entry to the real catalog so the active song and rows stay intact.
const extraCollection = {
  id: "hymn-901",
  book: "english",
  number: 901,
  title: "Amazing Grace",
  verses: ["Amazing grace, how sweet the sound."],
  lyrics: "Amazing grace, how sweet the sound.",
  midiPath: "assets/midi/901.mid",
  pdfPath: "assets/pdf/901.pdf",
};

async function addSecondCollection(page: Page) {
  await page.route("**/offline/hymn-catalog.json", async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as { items: unknown[] };
    await route.fulfill({
      json: { ...body, items: [...body.items, extraCollection] },
    });
  });
}

// Same profile shape account-card.spec.ts uses: the card only has to prove it
// renders the signed-in state, not that the network owns a real member.
const accountProfile = {
  id: "member-123",
  displayName: "Sdr. Yohanes",
  branchName: "Semarang",
  branchCode: "SMG",
  isMember: true,
  membershipNo: "GYS-SMG-001",
  email: "yohanes@example.org",
  avatarUrl:
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  locale: "id",
};

async function openAccount(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.route("**/api/v1/account/profile**", (route) =>
    route.fulfill({ json: { profile: accountProfile } }),
  );
  await page.addInitScript((profile) => {
    localStorage.setItem("gys-egys-profile-v1", JSON.stringify(profile));
  }, accountProfile);
  await page.goto("/GYSApp-Tauri/lainnya?section=account");
  await expect(page.locator(".member-card")).toBeVisible({ timeout: 20_000 });
}

/** The production update coordinator only shows its banner behind a worker. */
async function armAppUpdate(page: Page) {
  await page.addInitScript(() => {
    const armed = localStorage.getItem("gys-e2e-update-armed") !== "done";
    const worker = new EventTarget() as EventTarget & {
      state: string;
      postMessage: (message: { type: string }) => void;
    };
    worker.state = "installed";
    worker.postMessage = (message) => {
      if (message.type !== "SKIP_WAITING") return;
      localStorage.setItem("gys-e2e-update-armed", "done");
    };
    const registration = new EventTarget() as EventTarget & {
      waiting: typeof worker | null;
      installing: null;
      active: { postMessage: () => void };
      update: () => Promise<void>;
    };
    Object.assign(registration, {
      waiting: armed ? worker : null,
      installing: null,
      active: { postMessage() {} },
      update: async () => undefined,
    });
    const serviceWorker = new EventTarget();
    Object.assign(serviceWorker, {
      controller: {},
      ready: Promise.resolve(registration),
      register: async () => registration,
    });
    Object.defineProperty(navigator, "serviceWorker", {
      value: serviceWorker,
      configurable: true,
    });
  });
}

async function importPlaylist(page: Page, name: string) {
  await page.goto("/GYSApp-Tauri/kidung?section=playlist");
  await expect(
    page.getByRole("heading", { name: "Antrean MIDI", exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  await page
    .locator(".kidung-tool-heading-actions input[type=file]")
    .setInputFiles({
      name: "shell-a11y-playlist.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          name,
          songs: [
            {
              nomor: "001",
              judul: "Pujilah Allah Yang Maha Esa",
              fileHref: "docs/assets/001.mid",
            },
          ],
          exportedAt: "2026-10-10T00:00:00.000Z",
        }),
      ),
    });
  const row = page.locator(".kidung-saved-playlist-row", {
    has: page.getByText(`${name} (Imported)`, { exact: true }),
  });
  await expect(row).toBeVisible();
  return row;
}

async function openDeleteDialog(page: Page, name: string) {
  const row = await importPlaylist(page, name);
  await row.locator("details.kidung-row-menu > summary").first().click();
  await expect(row.locator(".kidung-row-menu-panel")).toBeVisible();
  await row
    .locator(".kidung-danger-action", { hasText: /^Hapus playlist$/ })
    .click();

  const dialog = page.getByRole("dialog", { name: "Hapus playlist?" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("tidak bisa dibatalkan");
  // The dialog rises with an entrance animation; audit the settled modal.
  await settled(dialog);
  return dialog;
}

const DIALOG_THEMES = ["light", "dark", "sepia", "amoled"] as const;

type DialogColors = {
  text: string;
  panel: string;
  overlay: string;
  canvas: string;
};

/** Switch the shell theme and read the colors the open dialog actually paints. */
async function readDialogColors(
  page: Page,
  theme: string,
): Promise<DialogColors> {
  return page.evaluate((nextTheme) => {
    document.documentElement.dataset.theme = nextTheme;
    const dialog = document.querySelector<HTMLElement>(".confirm-dialog");
    const paragraph = dialog?.querySelector("p");
    const backdrop = document.querySelector<HTMLElement>(
      ".confirm-dialog-backdrop",
    );
    if (!dialog || !paragraph || !backdrop) {
      throw new Error("Delete dialog is not mounted");
    }
    return {
      text: getComputedStyle(paragraph).color,
      panel: getComputedStyle(dialog).backgroundColor,
      overlay: getComputedStyle(backdrop).backgroundColor,
      canvas: getComputedStyle(document.body).backgroundColor,
    };
  }, theme);
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`Beranda is axe clean at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await prepareHome(page);
    await page.setViewportSize(viewport);
    await page.goto("/GYSApp-Tauri/");
    await expect(
      page.getByRole("heading", { name: "Bacaan & nyanyian" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".verse-panel .sauh-card-body")).toBeVisible();
    await expect(
      page.locator(".home-suara-section .suara-library-item").first(),
    ).toBeVisible();
    await expect(
      page.locator(".home-literature-section .suara-library-item").first(),
    ).toBeVisible();

    await expectNoAxeViolations(page);
  });

  test(`Alkitab reader, typography panel, and quick picker are axe clean at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await openBible(page, viewport);

    await expectNoAxeViolations(page);

    await page.locator(".reader-hamburger-btn").click();
    const drawer = page.locator(".reader-hamburger-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer.locator(".hamburger-typography-stepper")).toBeVisible();
    await settled(drawer);
    await expectNoAxeViolations(page);

    await drawer.locator(".hamburger-drawer-close").click();
    await expect(drawer).toBeHidden();

    await startQuickNav(page);
    await expectNoAxeViolations(page);

    await page.mouse.up();
    await expect(page.locator(".quick-nav-drag-overlay")).toBeHidden();
  });
}

test("Suara list and search field are axe clean on a phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/offline/suara-sejati.json", (route) =>
    route.fulfill({ json: suaraFeed }),
  );
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/GYSApp-Tauri/suara");

  await expect(page.getByTestId("suara-page")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator(".catalog-search")).toBeVisible();
  await expect(
    page.getByRole("searchbox", { name: "Cari kesaksian" }),
  ).toBeVisible();
  await expect(page.locator(".suara-library-item").first()).toBeVisible();

  await expectNoAxeViolations(page);
});

test("Lainnya settings groups and one open panel are axe clean on a phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/GYSApp-Tauri/lainnya");

  await expect(page.locator(".more-page")).toBeVisible({ timeout: 30_000 });
  const groups = page.locator(
    ".more-settings-list details.more-setting-section",
  );
  await expect
    .poll(() => groups.count(), { timeout: 30_000 })
    .toBeGreaterThanOrEqual(6);
  for (let index = 0; index < (await groups.count()); index += 1) {
    await expect(groups.nth(index).locator("summary")).toBeVisible();
  }

  const appearance = page.locator('[data-setting="appearance"]');
  await appearance.locator("> summary").click();
  await expect(appearance.locator(".appearance-card")).toBeVisible();

  await expectNoAxeViolations(page);
});

test("the reading menu is a dialog: focus moves in, Escape closes it", async ({
  page,
}) => {
  await openBible(page, { width: 390, height: 844 });
  const trigger = page.locator(".reader-hamburger-btn");
  const drawer = page.locator(".reader-hamburger-drawer");

  await trigger.click();
  await expect(drawer).toBeVisible();
  await expect(drawer.locator(".hamburger-drawer-close")).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("the desktop Kidung rail and its collection chip are axe clean", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route(/^https:\/\//, (route) => route.abort());
  await addSecondCollection(page);
  await page.goto("/GYSApp-Tauri/kidung/hymn-001");

  const rail = page.locator(".kidung-reader-rail");
  await expect(rail).toBeVisible({ timeout: 30_000 });
  await expect(rail.locator(".kidung-rail-row").first()).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Pujilah Allah Yang Maha Esa" }),
  ).toBeVisible({ timeout: 30_000 });

  const chip = rail.locator(".kidung-collection-select");
  await expect(chip).toBeVisible();
  const trigger = chip.getByRole("combobox");
  await expect(trigger).toBeVisible();

  await expectNoAxeViolations(page);

  // The chip is a listbox while open, and its options are part of the surface.
  await trigger.click();
  await expect(chip.getByRole("listbox")).toBeVisible();
  await expectNoAxeViolations(page);

  await page.keyboard.press("Escape");
  await expect(chip.getByRole("listbox")).toBeHidden();
});

test("the saved-playlist delete dialog is axe clean", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route(/^https:\/\//, (route) => route.abort());
  const dialog = await openDeleteDialog(page, "Audit Hapus");

  await expectNoAxeViolations(page);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("the signed-in account card on Lainnya is axe clean", async ({ page }) => {
  await openAccount(page);
  await expect(page.locator(".member-card")).toContainText("Sdr. Yohanes");

  await expectNoAxeViolations(page);
});

test("the app update banner is axe clean while the update waits", async ({
  page,
}) => {
  test.skip(process.env.GYS_E2E_DEV === "1", "Production update coordinator");
  await page.setViewportSize({ width: 1440, height: 900 });
  await armAppUpdate(page);
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/GYSApp-Tauri/lainnya");

  const banner = page.locator(".app-update-banner");
  await expect(banner).toBeVisible({ timeout: 20_000 });
  await expect(banner).toContainText("Memperbarui aplikasi");

  await expectNoAxeViolations(page);
});

test("the delete dialog paragraph clears 4.5:1 in every shell theme", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route(/^https:\/\//, (route) => route.abort());
  const dialog = await openDeleteDialog(page, "Audit Kontras");
  await expect(dialog).toBeVisible();

  for (const theme of DIALOG_THEMES) {
    await test.step(theme, async () => {
      const colors = await readDialogColors(page, theme);
      // Flatten the backdrop onto the page, then the panel onto that stack;
      // the paragraph itself has no background of its own.
      const canvas = composite(parseCssColor(colors.canvas), {
        r: 255,
        g: 255,
        b: 255,
      });
      const behindPanel = composite(parseCssColor(colors.overlay), canvas);
      const panel = composite(parseCssColor(colors.panel), behindPanel);
      const ratio = contrastRatio(parseCssColor(colors.text), panel);
      expect(
        ratio,
        `${theme}: ${colors.text} on ${colors.panel} over ${colors.overlay} = ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(4.5);
    });
  }
});

test("the collection chip's aria-controls resolves to its listbox", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route(/^https:\/\//, (route) => route.abort());
  await addSecondCollection(page);
  await page.goto("/GYSApp-Tauri/kidung/hymn-001");

  const chip = page.locator(".kidung-reader-rail .kidung-collection-select");
  await expect(chip).toBeVisible({ timeout: 30_000 });
  const trigger = chip.getByRole("combobox");
  await trigger.click();
  await expect(chip.getByRole("listbox")).toBeVisible();

  const controls = await trigger.getAttribute("aria-controls");
  if (!controls) throw new Error("Collection chip has no aria-controls");
  const target = await page.evaluate((id) => {
    const element = document.getElementById(id);
    return element === null
      ? null
      : {
          role: element.getAttribute("role"),
          hidden: element.getAttribute("aria-hidden"),
        };
  }, controls);
  expect(target, `aria-controls="${controls}" must resolve`).not.toBeNull();
  expect(target?.role).toBe("listbox");
  expect(target?.hidden).toBe("false");
});
