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

test("clicking e-GYS login opens the login flow in an overlay modal without redirecting", async ({
  page,
}) => {
  await page.goto("/GYSApp-Tauri/lainnya");
  const loginBtn = page.getByRole("link", { name: /Buka login e-GYS resmi/i });
  await expect(loginBtn).toBeVisible();
  await loginBtn.click();

  const overlay = page.getByRole("dialog", { name: /Login e-GYS resmi/i });
  await expect(overlay).toBeVisible();
  const iframe = overlay.locator("iframe");
  await expect(iframe).toHaveAttribute(
    "src",
    /^https:\/\/e\.gys\.or\.id\/login\?theme=/,
  );

  // Close overlay
  const closeBtn = overlay.getByRole("button", { name: /Tutup login e-GYS/i });
  await closeBtn.click();
  await expect(overlay).toBeHidden();
});

test("active e-GYS session displays the member profile badge", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "gys-egys-profile-v1",
      JSON.stringify({
        id: "member-123",
        displayName: "Sdr. Yohanes",
        branchName: "Semarang",
        branchCode: "SMG",
        isMember: true,
        membershipNo: "GYS-SMG-001",
        locale: "id",
      }),
    );
  });

  await page.goto("/GYSApp-Tauri/lainnya");
  await expect(
    page.getByRole("heading", { name: "Sdr. Yohanes" }),
  ).toBeVisible();
  await expect(page.getByText("Jemaat Resmi ✓")).toBeVisible();
  await expect(page.getByText("Semarang")).toBeVisible();
  await expect(page.getByText("GYS-SMG-001")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Keluar dari Akun Ini/i }),
  ).toBeVisible();
});
