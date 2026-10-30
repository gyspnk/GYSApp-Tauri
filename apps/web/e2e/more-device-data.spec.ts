import { expect, test, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block" });

// Settings groups open on first paint; a blind summary click closes them and
// hides their controls from the accessibility tree.
async function ensureSettingOpen(page: Page, setting: string) {
  const section = page.locator(
    `.more-setting-section[data-setting="${setting}"]`,
  );
  if ((await section.getAttribute("open")) === null)
    await section.locator("summary").click();
  await expect(section).toHaveAttribute("open", "");
}

test("reset is secondary, guarded, and cancel-safe", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("gys-test-reset-guard", "preserve-me");
  });

  await page.goto("/GYSApp-Tauri/lainnya");
  await ensureSettingOpen(page, "offline");

  const advanced = page.getByTestId("device-data-tools");
  await expect(advanced).toBeVisible();
  await expect(page.locator(".more-setting-section details")).toHaveCount(0);

  const reset = page.getByRole("button", { name: /reset perangkat/i });
  await expect(reset).toBeVisible();

  page.once("dialog", async (dialog) => {
    expect(dialog.type()).toBe("confirm");
    expect(dialog.message()).toMatch(/hapus.*data.*perangkat/i);
    await dialog.dismiss();
  });
  await reset.click();
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("gys-test-reset-guard")),
    )
    .toBe("preserve-me");

  page.once("dialog", async (dialog) => {
    expect(dialog.type()).toBe("confirm");
    await dialog.accept();
  });
  await reset.click();
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("gys-test-reset-guard")),
    )
    .toBeNull();
});

test("device diagnostics expose recorded events and clear them", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "gys-diagnostics-v1",
      JSON.stringify([
        {
          id: "warn-1",
          level: "warn",
          scope: "egys.whatsapp.tracking.event",
          message: "reference matched but fields were incomplete",
          timestamp: "2026-10-30T04:10:00.000Z",
        },
        {
          id: "error-1",
          level: "error",
          scope: "egys.profile",
          message: "e-GYS profile failed: 500",
          timestamp: "2026-10-30T04:11:00.000Z",
        },
      ]),
    );
  });

  await page.goto("/GYSApp-Tauri/lainnya?section=about");
  await ensureSettingOpen(page, "about");
  const card = page.locator(".diagnostics-card");
  await expect(card).toBeVisible();

  // The app records its own events during boot, so assert the seeded scopes
  // rather than an exact row count.
  const rows = card.locator(".diagnostics-log li");
  const seededError = card.locator('[data-level="error"]', {
    hasText: "egys.profile",
  });
  const seededWarn = card.locator('[data-level="warn"]', {
    hasText: "fields were incomplete",
  });
  await expect(seededError).toHaveCount(1);
  await expect(seededWarn).toHaveCount(1);
  expect(await rows.count()).toBeGreaterThanOrEqual(2);

  await card.getByRole("button", { name: "Hapus catatan" }).click();
  await expect(rows).toHaveCount(0);
  await expect(card.getByText("Belum ada catatan.")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("gys-diagnostics-v1")))
    .toBe("[]");
});
