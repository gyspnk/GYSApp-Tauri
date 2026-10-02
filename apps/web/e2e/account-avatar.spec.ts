import { expect, test } from "@playwright/test";

for (const width of [390, 1440]) {
  test(`header follows profile changes and handles unavailable photos (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    const avatar = "https://avatar.test/profile.svg";
    await page.route(avatar, (route) =>
      route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80"><rect width="80" height="80" fill="#cce9f3"/><circle cx="40" cy="31" r="16" fill="#dfb091"/><path d="M24 29c-5-23 36-27 33 1-7-4-13-9-17-13-3 7-9 10-16 12" fill="#25394b"/><path d="M9 80c0-33 62-33 62 0" fill="#157caa"/></svg>',
      }),
    );
    await page.addInitScript(
      ({ avatar }) =>
        localStorage.setItem(
          "gys-egys-profile-v1",
          JSON.stringify({
            id: "avatar-test",
            displayName: "Pengguna Uji",
            avatarUrl: avatar,
            locale: "id",
          }),
        ),
      { avatar },
    );
    await page.goto("/GYSApp-Tauri/kidung");
    await page.locator(".pujian-list > li").first().waitFor();
    const photo = page.locator(".account-avatar");
    await expect(photo).toHaveJSProperty("naturalWidth", 80);
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => {
      localStorage.removeItem("gys-egys-profile-v1");
      window.dispatchEvent(new Event("gys-egys-profile-changed"));
    });
    await expect(photo).not.toBeVisible();
    await expect(page.locator(".account-button svg")).toBeVisible();
    await page.evaluate(
      ({ avatar }) => {
        localStorage.setItem(
          "gys-egys-profile-v1",
          JSON.stringify({
            id: "avatar-test",
            displayName: "Pengguna Uji",
            avatarUrl: avatar,
            locale: "id",
          }),
        );
        window.dispatchEvent(new Event("gys-egys-profile-changed"));
      },
      { avatar },
    );
    await expect(photo).toBeVisible();
    await page.route("https://avatar.test/broken", (route) => route.abort());
    await page.evaluate(() => {
      localStorage.setItem(
        "gys-egys-profile-v1",
        JSON.stringify({
          id: "avatar-test",
          displayName: "Pengguna Uji",
          avatarUrl: "https://avatar.test/broken",
          locale: "id",
        }),
      );
      window.dispatchEvent(new Event("gys-egys-profile-changed"));
    });
    await expect(page.locator(".account-button svg")).toBeVisible();
  });
}
