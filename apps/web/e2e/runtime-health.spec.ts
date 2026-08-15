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
