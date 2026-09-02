import { expect, test } from "@playwright/test";

test("web account uses only the official e-GYS v1 login link", async ({
  page,
}) => {
  const draftRequests: string[] = [];
  page.on("request", (request) => {
    if (/\/auth\/(?:providers|exchange|whatsapp)/.test(request.url()))
      draftRequests.push(request.url());
  });

  await page.goto("/GYSApp-Tauri/lainnya");
  const login = page.getByRole("link", { name: /Buka login e-GYS resmi/i });
  await expect(login).toHaveAttribute(
    "href",
    /^https:\/\/e\.gys\.or\.id\/login\?theme=/,
  );
  await expect(
    page.locator('script[src*="google"], script[src*="apple"]'),
  ).toHaveCount(0);
  expect(draftRequests).toEqual([]);
});

test("Lainnya renders unified settings and account panels cleanly", async ({
  page,
}) => {
  await page.goto("/GYSApp-Tauri/lainnya");
  await expect(page.getByRole("heading", { name: "Akun e-GYS" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Tampilan & Bahasa" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Paket lokal" }),
  ).toBeVisible();
});
