import { expect, test } from "@playwright/test";

test("web account uses only the official e-GYS v1 login link", async ({
  page,
}) => {
  const draftRequests: string[] = [];
  page.on("request", (request) => {
    if (/\/auth\/(?:providers|exchange|whatsapp)/.test(request.url()))
      draftRequests.push(request.url());
  });

  await page.goto("/GYSApp-Tauri/lainnya?section=account");
  const login = page.getByRole("link", { name: "Buka login e-GYS resmi" });
  await expect(login).toHaveAttribute(
    "href",
    /^https:\/\/e\.gys\.or\.id\/login\?theme=/,
  );
  await expect(
    page.getByText(/sinkronisasi profil tersedia di aplikasi terpasang/i),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Manajemen Aset" }),
  ).toHaveCount(0);
  await expect(
    page.locator('script[src*="google"], script[src*="apple"]'),
  ).toHaveCount(0);
  expect(draftRequests).toEqual([]);
});

test("Lainnya honors a selected section and renders only its panel", async ({
  page,
}) => {
  await page.goto("/GYSApp-Tauri/lainnya?section=appearance");
  await expect(
    page.getByRole("button", { name: "Tampilan & Bahasa" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Tampilan" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Akun e-GYS" })).toHaveCount(
    0,
  );
});
