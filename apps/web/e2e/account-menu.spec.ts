import { expect, test } from "@playwright/test";

for (const width of [390, 768, 1440]) {
  test(`compact account menu and collapsed settings (${width})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route(/^https:\/\//, (route) => route.abort());
    await page.route("**/api/v1/account/profile", (route) =>
      route.fulfill({
        json: {
          profile: {
            id: "menu-test",
            displayName: "Maria Wijaya",
            email: "maria@example.org",
            branchName: "Jakarta",
            locale: "id",
          },
        },
      }),
    );
    await page.addInitScript(() =>
      localStorage.setItem(
        "gys-egys-profile-v1",
        JSON.stringify({
          id: "menu-test",
          displayName: "Maria Wijaya",
          email: "maria@example.org",
          branchName: "Jakarta",
          locale: "id",
        }),
      ),
    );
    await page.goto("/GYSApp-Tauri/lainnya");
    const account = page.locator(".more-account-section");
    await expect(account).not.toHaveAttribute("open", "");
    const button = page.locator(".account-button");
    await button.click();
    const menu = page.locator(".account-popover");
    await expect(menu).toHaveAttribute("data-menu-open", "true");
    await expect(menu.getByText("Maria Wijaya")).toBeVisible();
    await expect(menu.getByText("Buka e-GYS")).toBeVisible();
    expect(
      await menu.evaluate(
        (e) =>
          e.getBoundingClientRect().right <= innerWidth &&
          e.getBoundingClientRect().left >= 0,
      ),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(button).toBeFocused();
    await button.click();
    await menu.getByRole("link", { name: "Akun e-GYS" }).click();
    await expect(account).toHaveAttribute("open", "");
    await expect(menu).toHaveCount(0);
    await account.locator("summary").first().click();
    await expect(account).not.toHaveAttribute("open", "");
    await button.click();
    await expect(account).not.toHaveAttribute("open", "");
    await page.route("**/api/v1/auth/logout", (route) =>
      route.fulfill({ json: { ok: true } }),
    );
    await menu.getByRole("button", { name: "Keluar", exact: true }).click();
    await expect(menu.getByText("WhatsApp · Apple")).toBeVisible();
    await expect(
      account.getByText("Maria Wijaya", { exact: true }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(() => localStorage.getItem("gys-egys-profile-v1")),
    ).toBeNull();
  });
}

test("header Google signs in directly and refreshes its account information", async ({
  page,
}) => {
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.route("https://accounts.google.com/gsi/client*", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.google = { accounts: { id: { initialize(o) { this.callback=o.callback; }, renderButton(host) { const b=document.createElement('button'); b.textContent='Login dengan Google'; b.onclick=()=>this.callback({credential:'menu-google'}); host.replaceChildren(b); }, cancel() {} } } };`,
    }),
  );
  await page.route("**/api/v1/auth/egys/google", (route) => {
    expect(route.request().postDataJSON()).toEqual({
      credential: "menu-google",
    });
    return route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/v1/account/profile", (route) =>
    route.fulfill({
      json: {
        profile: {
          id: "google-menu",
          displayName: "Jemaat Google",
          locale: "id",
        },
      },
    }),
  );
  await page.goto("/GYSApp-Tauri/");
  await page.locator(".account-button").click();
  await page
    .locator(".account-popover")
    .getByRole("button", { name: "Login dengan Google", exact: true })
    .click();
  await expect(
    page.locator(".account-popover").getByText("Jemaat Google"),
  ).toBeVisible();
  await expect(page).toHaveURL(/GYSApp-Tauri\/$/);
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
});
