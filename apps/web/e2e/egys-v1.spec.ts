import { expect, test } from "@playwright/test";

for (const width of [320, 390, 768, 1024, 1440, 1920]) {
  test(`Apple and WhatsApp remain available before Google loads at ${width}px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route(/^https:\/\//, (route) => route.abort());
    await context.route("https://e.gys.or.id/login?*", (route) =>
      route.fulfill({ body: "Official portal handoff test" }),
    );
    await page.goto("/GYSApp-Tauri/lainnya?section=account");
    const account = page.locator('[data-setting="account"]');
    const heading = account.getByRole("heading", {
      name: "Akun e-GYS",
      exact: true,
    });
    await expect(heading).toBeVisible();
    await account.locator("summary").click();
    await expect(
      account.getByRole("button", { name: "Login dengan Google", exact: true }),
    ).toBeHidden();
    await account.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(
      account.getByRole("button", { name: "Login dengan Google", exact: true }),
    ).toBeVisible();
    const controls = account.locator(".egys-provider-all .egys-provider");
    await expect(controls).toHaveCount(3);
    const row = await account.locator(".egys-provider-all").boundingBox();
    const body = await account.locator(".egys-login-box").boundingBox();
    expect(Math.abs(row!.width - body!.width)).toBeLessThan(1);
    expect(
      await controls.evaluateAll((nodes) =>
        nodes.every((node) => node.scrollWidth <= node.clientWidth + 1),
      ),
    ).toBe(true);
    const boxes = await controls.evaluateAll((nodes) =>
      nodes.map((node) => {
        const { x, y, width, height } = node.getBoundingClientRect();
        return { x, y, width, height };
      }),
    );
    for (const box of boxes) {
      expect(Math.abs(box.y - boxes[0]!.y)).toBeLessThan(1);
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
    await expect(
      account.getByRole("button", { name: "Login dengan Google", exact: true }),
    ).toBeVisible();
    await expect(account.getByText("Buka login e-GYS resmi")).toHaveCount(0);
    for (const name of ["Login dengan WhatsApp", "Login dengan Apple"]) {
      const link = account.getByRole("link", { name, exact: true });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", "noopener noreferrer");
      const box = await link.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      const popupPromise = page.waitForEvent("popup");
      await link.click();
      const popup = await popupPromise;
      await popup.waitForURL(/^https:\/\/e\.gys\.or\.id\/login\?theme=/);
      await popup.close();
      await expect(page).toHaveURL(/lainnya\?section=account/);
    }
    await account
      .getByRole("button", { name: "Login dengan Google", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Login e-GYS resmi" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("alert")).toBeVisible();
    for (const name of ["Login dengan WhatsApp", "Login dengan Apple"])
      await expect(
        dialog.getByRole("link", { name, exact: true }),
      ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  });
}

test("Google stays visible and opens its dialog while offline", async ({
  page,
  context,
}) => {
  await page.goto("/GYSApp-Tauri/lainnya");
  const google = page.getByRole("button", {
    name: "Login dengan Google",
    exact: true,
  });
  await expect(google).toBeVisible();
  await context.setOffline(true);
  await expect(google).toBeVisible();
  await expect(google).toBeEnabled();
  await google.click();
  const dialog = page.getByRole("dialog", { name: "Login e-GYS resmi" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("alert")).toBeVisible();
});

test("native Apple and WhatsApp actions open the existing official login bridge", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = window as unknown as {
      __TAURI_INTERNALS__: unknown;
      egysCommands: string[];
    };
    state.egysCommands = [];
    state.__TAURI_INTERNALS__ = {
      invoke: async (command: string) => {
        state.egysCommands.push(command);
        return null;
      },
    };
  });
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/GYSApp-Tauri/lainnya?section=account");
  for (const name of [
    "Login dengan Google",
    "Login dengan WhatsApp",
    "Login dengan Apple",
  ])
    await page.getByRole("button", { name, exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { egysCommands: string[] }).egysCommands.filter(
            (command) => command === "open_egys_login",
          ).length,
      ),
    )
    .toBe(3);
  await expect(
    page.getByRole("dialog", { name: "Login e-GYS resmi" }),
  ).toHaveCount(0);
});

test("web account uses only the official e-GYS v1 login link", async ({
  page,
}) => {
  const draftRequests: string[] = [];
  page.on("request", (request) => {
    if (/\/auth\/(?:providers|exchange|whatsapp)/.test(request.url()))
      draftRequests.push(request.url());
  });

  await page.goto("/GYSApp-Tauri/lainnya");
  const login = page.getByRole("link", {
    name: "Login dengan WhatsApp",
    exact: true,
  });
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
  await page.locator('[data-setting="appearance"] > summary').click();
  await expect(
    page.getByRole("button", { name: "Pilih Tema", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".accent-palette-grid")).toBeHidden();
  await page.locator('[data-setting="offline"] > summary').click();
  await expect(
    page.getByRole("heading", { name: "Paket lokal" }),
  ).toBeVisible();
});

test("clicking e-GYS login opens the login flow in an overlay modal without redirecting", async ({
  page,
}) => {
  await page.goto("/GYSApp-Tauri/lainnya");
  const loginBtn = page.getByRole("button", {
    name: "Login dengan Google",
    exact: true,
  });
  await expect(loginBtn).toBeVisible();
  const pageUrl = page.url();
  await loginBtn.click();
  await expect(page).toHaveURL(pageUrl);

  const overlay = page.getByRole("dialog", { name: /Login e-GYS resmi/i });
  await expect(overlay).toBeVisible();
  await expect(overlay.getByLabel("Login dengan Google")).toBeVisible();
  const officialPortal = overlay.getByRole("link", {
    name: /Portal resmi e-GYS/i,
  });
  await expect(officialPortal).toHaveAttribute(
    "href",
    /^https:\/\/e\.gys\.or\.id\/login\?theme=/,
  );
  await expect(officialPortal).toHaveAttribute("target", "_blank");

  // Close overlay
  const closeBtn = overlay.locator(".egys-login-close");
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
