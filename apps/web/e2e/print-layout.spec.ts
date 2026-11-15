import { expect, test } from "@playwright/test";

/** Printing a chapter is a real use — a reader takes the text to a meeting.
 *  The shell's chrome is fixed, so on paper it repeated on every page and
 *  covered the first lines of each one. */
test.describe("print layout", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "gys-shell-settings-v1",
        JSON.stringify({
          version: 1,
          locale: "id",
          theme: "light",
          onboarded: true,
        }),
      );
    });
    await page.route(/^https:\/\//, (route) => route.abort());
  });

  test("a printed chapter carries the text, not the shell", async ({
    page,
  }) => {
    await page.goto("/GYSApp-Tauri/bible?book=kejadian&chapter=1");
    await expect(page.locator(".verse-content").first()).toBeVisible({
      timeout: 30_000,
    });
    await page.emulateMedia({ media: "print" });

    for (const selector of [
      ".topbar",
      ".navigation-shell",
      ".primary-nav",
      ".skip-link",
    ]) {
      await expect(page.locator(selector).first()).toBeHidden();
    }
    const verse = page.locator(".verse-content").first();
    await expect(verse).toBeVisible();
    const style = await verse.evaluate((node) => {
      const computed = getComputedStyle(node);
      return {
        color: computed.color,
        maxWidth: computed.maxWidth,
        padding: getComputedStyle(document.querySelector(".main-content")!)
          .padding,
      };
    });
    // Ink on paper: the reading column keeps its text colour and loses the
    // screen's gutters, which would otherwise shrink every printed line.
    expect(style.color).toBe("rgb(0, 0, 0)");
    expect(style.maxWidth).toBe("none");
    expect(style.padding).toBe("0px");
  });
});
