import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("https://accounts.google.com/gsi/client*", (route) =>
    route.abort(),
  );
});

test("the compact Google SDK logo retains its intrinsic content box", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.route("https://accounts.google.com/gsi/client*", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.google = { accounts: { id: {
      initialize() {}, cancel() {}, renderButton(host) {
        host.innerHTML = '<div role="button" aria-label="Login dengan Google" style="width:40px;height:40px"><div style="width:20px;height:20px;padding:10px"><svg viewBox="0 0 48 48" style="display:block"><path fill="#4285f4" d="M0 0h48v48H0z" /></svg></div></div>';
      }
    } } };`,
    }),
  );
  await page.goto("/GYSApp-Tauri/lainnya?section=account");
  const logo = page.locator(".egys-google-button svg");
  await expect(logo).toBeVisible();
  const bounds = await logo.boundingBox();
  expect(bounds!.width).toBeGreaterThanOrEqual(18);
  expect(bounds!.height).toBeGreaterThanOrEqual(18);
});

test("Google signs in from the inline provider row without an application dialog", async ({
  page,
}) => {
  let loggedIn = false;
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.route("https://accounts.google.com/gsi/client*", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.google = { accounts: { id: {
      initialize(options) { this.callback = options.callback; },
      renderButton(host) {
        const button = document.createElement("button");
        button.textContent = "Login dengan Google";
        button.onclick = () => this.callback({ credential: "gis-credential" });
        host.replaceChildren(button);
      }, cancel() {}
    } } };`,
    }),
  );
  await page.route("**/api/v1/account/profile", (route) =>
    route.fulfill({
      json: {
        profile: loggedIn
          ? { id: "google-member", displayName: "Jemaat Google", locale: "id" }
          : null,
      },
    }),
  );
  await page.route("**/api/v1/auth/egys/google", (route) => {
    expect(route.request().postDataJSON()).toEqual({
      credential: "gis-credential",
    });
    loggedIn = true;
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/GYSApp-Tauri/lainnya?section=account");
  const account = page.locator('[data-setting="account"]');
  const google = account
    .locator(".egys-google-button")
    .getByRole("button", { name: "Login dengan Google" });
  await expect(google).toBeVisible();
  await google.click();
  await expect(
    account.getByRole("heading", { name: "Jemaat Google", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(/lainnya\?section=account$/);
});

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
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(account.getByRole("alert")).toBeVisible();
    for (const name of ["Login dengan WhatsApp", "Login dengan Apple"])
      await expect(
        account.getByRole("button", { name, exact: true }),
      ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  });
}

test("Google stays visible and retries inline while offline", async ({
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
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.locator('[data-setting="account"]').getByRole("alert"),
  ).toBeVisible();
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
        referenceId: "test-ref",
        mobilePhone: "628123456789",
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
      mobilephone: "628987654321",
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
      mobilePhone: "628987654321",
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

test("WhatsApp timeout removes its badge without closing the messaging tab", async ({
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
  await context.route("https://api.whatsapp.com/**", (route) =>
    route.fulfill({ body: "WhatsApp" }),
  );
  await page.goto("/GYSApp-Tauri/lainnya?section=account");
  const opened = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "Login dengan WhatsApp", exact: true })
    .click();
  const messagingTab = await opened;
  await expect(page.getByRole("timer")).toHaveAttribute(
    "aria-label",
    /Menunggu pesan WhatsApp/,
  );
  await expect(messagingTab).toHaveURL(/api\.whatsapp\.com\/send\?/);
  await page.clock.fastForward(119_000);
  await expect(page.getByRole("timer")).toHaveText("0:01");
  await page.clock.fastForward(1_000);
  await expect(page.getByRole("timer")).toHaveCount(0);
  expect(context.pages()).toHaveLength(2);
  await messagingTab.close();
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

test("WhatsApp reconnects the same request and confirms the sender exactly once", async ({
  page,
  context,
}) => {
  await page.clock.install();
  let loggedIn = false,
    starts = 0,
    confirmations = 0;
  const sockets: Array<{
    send(data: string): void;
    close(options?: { code?: number; reason?: string }): void;
  }> = [];
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.route("**/api/v1/account/profile", (route) =>
    route.fulfill({
      json: {
        profile: loggedIn
          ? { id: "sender", displayName: "Pengirim WhatsApp", locale: "id" }
          : null,
      },
    }),
  );
  await page.route("**/api/v1/auth/egys/whatsapp/start", (route) => {
    starts++;
    return route.fulfill({
      json: {
        referenceid: "reconnect-ref",
        mobilephone: "628111111111",
        content: "LOGIN reconnect-ref",
      },
    });
  });
  await context.route("https://api.whatsapp.com/**", (route) =>
    route.fulfill({ body: "WhatsApp" }),
  );
  await page.routeWebSocket("**/api/v1/auth/egys/whatsapp/track", (ws) => {
    sockets.push(ws);
    ws.send(JSON.stringify({ type: "info" }));
  });
  await page.route("**/api/v1/auth/egys/whatsapp/confirm", (route) => {
    confirmations++;
    expect(route.request().postDataJSON()).toEqual({
      otp: "123456",
      mobilephone: "628222222222",
    });
    loggedIn = true;
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/GYSApp-Tauri/lainnya?section=account");
  await page
    .getByRole("button", { name: "Login dengan WhatsApp", exact: true })
    .click();
  await expect.poll(() => sockets.length).toBe(1);
  sockets[0]!.close({ code: 1011, reason: "Temporary mobile disconnect" });
  await expect(page.getByRole("timer")).toHaveAttribute(
    "aria-label",
    /Menghubungkan kembali/,
  );
  await page.clock.fastForward(1000);
  await expect.poll(() => sockets.length).toBe(2);
  expect(starts).toBe(1);
  for (const payload of [
    "null",
    "bad-json",
    JSON.stringify({
      refid: "another-request",
      otp: "123456",
      mobilePhone: "628222222222",
    }),
    JSON.stringify({ refid: "reconnect-ref", otp: "123456" }),
  ])
    sockets[1]!.send(payload);
  expect(confirmations).toBe(0);
  const confirmation = JSON.stringify({
    refid: "reconnect-ref",
    otp: "123456",
    mobilePhone: "628222222222",
  });
  sockets[1]!.send(confirmation);
  sockets[1]!.send(confirmation);
  await expect(
    page.getByRole("heading", { name: "Pengirim WhatsApp", exact: true }),
  ).toBeVisible();
  expect(confirmations).toBe(1);
  await expect(page.locator(".egys-whatsapp-countdown")).toHaveCount(0);
});

test("Apple completes after a real cold script load instead of hanging at initialization", async ({
  page,
}) => {
  let loggedIn = false;
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.route("https://appleid.cdn-apple.com/**", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.AppleID = { auth: { init(options) { this.state = options.state; }, async signIn() { return { authorization: { code: "cold-code", id_token: "cold-token", state: this.state } }; } } };`,
    }),
  );
  await page.route("**/api/v1/account/profile", (route) =>
    route.fulfill({
      json: {
        profile: loggedIn
          ? { id: "apple", displayName: "Akun Apple", locale: "id" }
          : null,
      },
    }),
  );
  await page.route("**/api/v1/auth/egys/apple", (route) => {
    expect(route.request().postDataJSON()).toEqual({
      code: "cold-code",
      id_token: "cold-token",
    });
    loggedIn = true;
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/GYSApp-Tauri/lainnya?section=account");
  await page
    .getByRole("button", { name: "Login dengan Apple", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Akun Apple", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("Lainnya renders unified settings and account panels cleanly", async ({
  page,
}) => {
  await page.goto("/GYSApp-Tauri/lainnya");
  await expect(page.getByRole("heading", { name: "Akun e-GYS" })).toBeVisible();
  await page.locator('[data-setting="appearance"] > summary').click();
  await expect(
    page.getByRole("combobox", { name: "Pilih Tema", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".accent-palette-grid")).toBeHidden();
  await page.locator('[data-setting="offline"] > summary').click();
  await expect(
    page.getByRole("heading", { name: "Paket lokal" }),
  ).toBeVisible();
});

test("Google retries a failed SDK within the same provider row", async ({
  page,
}) => {
  let attempts = 0;
  await page.route("https://accounts.google.com/gsi/client*", (route) => {
    if (++attempts === 1) return route.abort();
    return route.fulfill({
      contentType: "application/javascript",
      body: `window.google = { accounts: { id: {
        initialize() {}, cancel() {},
        renderButton(host) { const button = document.createElement("button"); button.textContent = "Login dengan Google"; host.replaceChildren(button); }
      } } };`,
    });
  });
  await page.goto("/GYSApp-Tauri/lainnya?section=account");
  const account = page.locator('[data-setting="account"]');
  await expect(account.getByRole("alert")).toBeVisible();
  await account
    .getByRole("button", { name: "Login dengan Google", exact: true })
    .click();
  await expect(account.locator(".egys-google-button button")).toBeVisible();
  await expect(account.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(attempts).toBe(2);
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
