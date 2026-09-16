import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const transparentPixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X2NDWQAAAABJRU5ErkJggg==",
  "base64",
);

async function prepareReadingAudit(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("https://raw.githubusercontent.com/**", (route) =>
    route.abort(),
  );
  await page.route("https://github.com/**", (route) => route.abort());
  await page.route("https://tjc.org/**", async (route) => {
    if (route.request().resourceType() === "image") {
      await route.fulfill({ body: transparentPixel, contentType: "image/png" });
      return;
    }
    await route.abort();
  });
  await page.route("**/offline/literature.json", (route) =>
    route.fulfill({
      json: {
        source: "tjc.org",
        generatedAt: "2026-09-15T00:00:00.000Z",
        items: [
          {
            id: "axe-literature",
            category: "kesaksian",
            title: "Kesaksian Dalam Penyertaan Tuhan",
            description: "Bacaan pembinaan keluarga.",
            url: "https://tjc.org/id/kesaksian/axe-literature/",
            format: "article",
            publishedAt: "2026-09-01T00:00:00.000Z",
            updatedAt: "2026-09-01T00:00:00.000Z",
            source: "tjc.org",
          },
        ],
      },
    }),
  );
  await page.route("**/offline/faith.json", (route) =>
    route.fulfill({
      json: {
        faith: [
          {
            language: "ID",
            title: "Dasar Kepercayaan",
            content: [
              {
                number: "1",
                text: "Percaya bahwa Yesus Kristus adalah Firman yang menjadi manusia.",
              },
            ],
          },
        ],
      },
    }),
  );
}

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations,
    JSON.stringify(results.violations, null, 2),
  ).toEqual([]);
}

test.describe("Quiet Sanctuary accessibility release gate", () => {
  test("home has no axe violations", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/GYSApp-Tauri/");
    await expect(
      page.getByRole("heading", { name: "Selamat datang kembali" }),
    ).toBeVisible();

    await expectNoAxeViolations(page);
  });

  test("dark theme home has no axe violations", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => localStorage.setItem("gys-theme", "dark"));
    await page.goto("/GYSApp-Tauri/");
    await expect(
      page.getByRole("heading", { name: "Selamat datang kembali" }),
    ).toBeVisible();

    await expectNoAxeViolations(page);
  });

  test("Bible keeps a visible focus target through keyboard navigation", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/GYSApp-Tauri/bible");
    await expect(page.getByRole("heading", { name: /Kejadian 1/ })).toBeVisible(
      {
        timeout: 15_000,
      },
    );

    await page.keyboard.press("Tab");
    const focused = page.locator(":focus");
    await expect(focused).toBeVisible();
    await expect(focused).toHaveCSS("outline-style", /solid|auto/);
  });

  test("Kidung mobile has no axe violations", async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/GYSApp-Tauri/kidung");
    await expect(
      page.getByRole("heading", { name: "Kidung", exact: true }),
    ).toBeVisible({ timeout: 15_000 });

    await expectNoAxeViolations(page);
  });

  test("report form exposes an accessible message field", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/GYSApp-Tauri/lainnya?section=help");
    await expect(
      page.getByRole("heading", { name: "Lainnya", exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("textbox", { name: "Pesan laporan" }),
    ).toBeVisible();
  });

  test("tablet navigation keeps accessible names when copy is collapsed", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 720, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/GYSApp-Tauri/");
    await expect(
      page.getByRole("link", { name: "Beranda", exact: true }),
    ).toBeVisible();
  });

  test("Literatur, Iman, and preferences have no axe violations", async ({
    page,
  }) => {
    await prepareReadingAudit(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/GYSApp-Tauri/literatur");
    await expect(page.locator(".literature-page")).toBeVisible();
    await expectNoAxeViolations(page);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/GYSApp-Tauri/iman");
    await expect(page.locator(".faith-page")).toBeVisible();
    await expectNoAxeViolations(page);

    await page.goto("/GYSApp-Tauri/lainnya");
    await page.getByRole("button", { name: "Tampilan & keterbacaan" }).click();
    await expect(
      page.getByRole("dialog", { name: "Tampilan & keterbacaan" }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
  });
});
