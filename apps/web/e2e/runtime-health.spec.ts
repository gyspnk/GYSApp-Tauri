import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test("production shell has no uncaught runtime error when PWA registration is reduced", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/GYSApp-Tauri/", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: "Selamat datang kembali" }),
  ).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(500);

  expect(pageErrors).toEqual([]);
});

test("PWA metadata serves its favicon and a valid square mark without browser warnings", async ({
  page,
}) => {
  const metadataWarnings: string[] = [];
  page.on("console", (message) => {
    if (
      (message.type() === "warning" || message.type() === "error") &&
      /favicon|manifest|icon/i.test(message.text())
    ) {
      metadataWarnings.push(message.text());
    }
  });

  await page.goto("/GYSApp-Tauri/", { waitUntil: "networkidle" });
  const iconHref = await page.locator('link[rel="icon"]').getAttribute("href");
  expect(iconHref).toMatch(/assets\/gys-mark\.svg$/);
  const icon = await page.request.get(
    new URL(iconHref!, page.url()).toString(),
  );
  expect(icon.ok()).toBe(true);

  const manifestHref = await page
    .locator('link[rel="manifest"]')
    .getAttribute("href");
  expect(manifestHref).toBeTruthy();
  const manifestResponse = await page.request.get(
    new URL(manifestHref!, page.url()).toString(),
  );
  expect(manifestResponse.ok()).toBe(true);
  const manifest = (await manifestResponse.json()) as {
    icons?: Array<{ src?: string; sizes?: string; type?: string }>;
  };
  expect(manifest.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        src: expect.stringMatching(/assets\/gys-mark\.svg$/),
        sizes: "any",
        type: "image/svg+xml",
      }),
    ]),
  );
  const serviceWorkerResponse = await page.request.get(
    new URL("sw.js", page.url()).toString(),
  );
  expect(serviceWorkerResponse.ok()).toBe(true);
  expect(await serviceWorkerResponse.text()).toContain("gysapp-shell-v9");
  expect(metadataWarnings).toEqual([]);
});
