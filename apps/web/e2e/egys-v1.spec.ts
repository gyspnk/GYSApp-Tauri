import { expect, test } from "@playwright/test";

for (const width of [320, 390, 768, 1024, 1440, 1920]) {
  test(`Apple and WhatsApp remain available before Google loads at ${width}px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route(/^https:\/\//, (route) => route.abort());
    await page.route("https://e.gys.or.id/login?*", (route) =>
      route.fulfill({ contentType: "text/html", body: "Official login" }),
    );
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
      const button = account.getByRole("button", { name, exact: true });
      await expect(button).toBeVisible();
      await button.click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      if (name === "Login dengan WhatsApp") {
        await expect(account.locator(".egys-whatsapp-countdown")).toBeVisible();
        await expect(account.locator(".egys-inline-login")).toHaveCount(0);
        const badge = await account
          .locator(".egys-whatsapp-countdown")
          .boundingBox();
        const bounds = await button.boundingBox();
        expect(badge!.x + badge!.width).toBeLessThanOrEqual(
          bounds!.x + bounds!.width,
        );
        continue;
      }
      await account.getByRole("button", { name: "Batal", exact: true }).click();
      await expect.poll(() => context.pages().length).toBe(1);
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
        dialog.getByRole("button", { name, exact: true }),
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

test("web providers authenticate inline and refresh the detected account", async ({
  page,
  context,
}) => {
  let loggedIn = false;
  await page.addInitScript(() => {
    (window as unknown as { AppleID: unknown }).AppleID = {
      auth: {
        state: "",
        init(options: { state: string }) {
          this.state = options.state;
        },
        async signIn() {
          return {
            authorization: {
              code: "apple-code",
              id_token: "apple-token",
              state: this.state,
            },
          };
        },
      },
    };
  });
  await page.route("**/api/v1/account/profile", (route) =>
    route.fulfill({
      json: {
        profile: loggedIn
          ? { id: "42", displayName: "Jemaat Login", locale: "id" }
          : null,
      },
    }),
  );
  await page.route("**/api/v1/auth/egys/whatsapp/start", (route) =>
    route.fulfill({
      json: {
        referenceid: "test-ref",
        mobilephone: "628123456789",
        content: "LOGIN test-ref",
      },
    }),
  );
  let tracking: { send(data: string): void } | undefined;
  await page.routeWebSocket("**/api/v1/auth/egys/whatsapp/track", (ws) => {
    tracking = ws;
    ws.send(JSON.stringify({ type: "info" }));
  });
  await page.route("**/api/v1/auth/egys/whatsapp/confirm", async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      otp: "123456",
      mobilephone: "628123456789",
    });
    loggedIn = true;
    await route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/v1/auth/egys/apple", async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      code: "apple-code",
      id_token: "apple-token",
    });
    loggedIn = true;
    await route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/v1/auth/logout", async (route) => {
    loggedIn = false;
    await route.fulfill({ json: { ok: true } });
  });
  await context.route("https://api.whatsapp.com/**", (route) =>
    route.fulfill({ body: "WhatsApp", contentType: "text/html" }),
  );
  await page.goto("/GYSApp-Tauri/lainnya?section=account");
  const messagingTab = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "Login dengan WhatsApp", exact: true })
    .click();
  const whatsapp = await messagingTab;
  await expect(whatsapp).toHaveURL(
    "https://api.whatsapp.com/send?phone=628123456789&text=LOGIN%20test-ref",
  );
  expect(await whatsapp.evaluate(() => window.opener)).toBeNull();
  await expect(page.getByRole("timer")).toHaveAttribute(
    "aria-label",
    /Menunggu pesan WhatsApp/,
  );
  await expect(
    page.getByRole("link", { name: "Kirim pesan WhatsApp" }),
  ).toHaveCount(0);
  await expect(page.locator(".egys-inline-login input")).toHaveCount(0);
  tracking!.send(JSON.stringify({ refid: "unrelated", otp: "123456" }));
  await expect(
    page.getByRole("heading", { name: "Jemaat Login", exact: true }),
  ).toHaveCount(0);
  tracking!.send(
    JSON.stringify({
      refid: "test-ref",
      otp: "123456",
      mobilePhone: "628123456789",
    }),
  );
  await expect(
    page.getByRole("heading", { name: "Jemaat Login", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Keluar dari Akun Ini", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Login dengan Apple", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Jemaat Login", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("iframe")).toHaveCount(0);
  await whatsapp.close();
  expect(context.pages()).toHaveLength(1);
});

test("WhatsApp timeout removes its badge and closes the pending tab", async ({
  page,
  context,
}) => {
  await page.clock.install();
  await page.route("**/api/v1/auth/egys/whatsapp/start", (route) =>
    route.fulfill({
      json: {
        referenceid: "test-ref",
        mobilephone: "628123456789",
        content: "LOGIN test-ref",
      },
    }),
  );
  await page.routeWebSocket("**/api/v1/auth/egys/whatsapp/track", () => {});
  await page.goto("/GYSApp-Tauri/lainnya?section=account");
  const opened = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "Login dengan WhatsApp", exact: true })
    .click();
  const messagingTab = await opened;
  await expect(page.getByRole("timer")).toHaveAttribute(
    "aria-label",
    /Menghubungkan WhatsApp/,
  );
  expect(messagingTab.url()).toBe("about:blank");
  await page.clock.fastForward(119_000);
  await expect(page.getByRole("timer")).toHaveText("0:01");
  await page.clock.fastForward(1_000);
  await expect(page.getByRole("timer")).toHaveCount(0);
  await expect.poll(() => context.pages().length).toBe(1);
  await expect(page.locator(".egys-inline-login")).toHaveCount(0);
});

test("clicking WhatsApp again replaces the request and ignores the old socket", async ({
  page,
  context,
}) => {
  await page.clock.install();
  let requests = 0;
  let confirmations = 0;
  const sockets: Array<{ send(data: string): void }> = [];
  await page.route("**/api/v1/auth/egys/whatsapp/start", (route) =>
    route.fulfill({
      json: {
        referenceid: `ref-${++requests}`,
        mobilephone: "628123456789",
        content: `LOGIN ref-${requests}`,
      },
    }),
  );
  await page.routeWebSocket("**/api/v1/auth/egys/whatsapp/track", (ws) => {
    sockets.push(ws);
    ws.send(JSON.stringify({ type: "info" }));
  });
  await page.route("**/api/v1/auth/egys/whatsapp/confirm", (route) => {
    confirmations++;
    return route.fulfill({ json: { ok: true } });
  });
  await context.route("https://api.whatsapp.com/**", (route) =>
    route.fulfill({ body: "WhatsApp" }),
  );
  await page.goto("/GYSApp-Tauri/lainnya?section=account");
  const button = page.getByRole("button", {
    name: "Login dengan WhatsApp",
    exact: true,
  });
  await button.click();
  await expect(page.getByRole("timer")).toHaveAttribute(
    "aria-label",
    /Menunggu pesan WhatsApp/,
  );
  await page.clock.fastForward(30_000);
  await expect(page.getByRole("timer")).toHaveText("1:30");
  await button.click();
  await expect.poll(() => requests).toBe(2);
  await expect(page.getByRole("timer")).toHaveText("2:00");
  await expect(page.getByRole("timer")).toHaveAttribute(
    "aria-label",
    /Menunggu pesan WhatsApp/,
  );
  sockets[0]!.send(JSON.stringify({ refid: "ref-1", otp: "123456" }));
  sockets[1]!.send(JSON.stringify({ refid: "ref-1", otp: "123456" }));
  await page.clock.fastForward(120_000);
  await expect(page.getByRole("timer")).toHaveCount(0);
  expect(confirmations).toBe(0);
  expect(requests).toBe(2);
  await expect(page.locator(".egys-inline-login")).toHaveCount(0);
});

test("WhatsApp reports blocked tabs without starting a challenge", async ({
  page,
}) => {
  let started = false;
  await page.addInitScript(() => {
    window.open = () => null;
  });
  await page.route("**/api/v1/auth/egys/whatsapp/start", (route) => {
    started = true;
    return route.fulfill({ json: {} });
  });
  await page.goto("/GYSApp-Tauri/lainnya?section=account");
  await page
    .getByRole("button", { name: "Login dengan WhatsApp", exact: true })
    .click();
  await expect(
    page.locator(".egys-whatsapp-countdown[role=alert]"),
  ).toHaveAttribute("aria-label", /Izinkan tab WhatsApp/);
  expect(started).toBe(false);
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
