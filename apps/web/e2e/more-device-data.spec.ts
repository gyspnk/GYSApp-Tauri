import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test("reset is secondary, guarded, and cancel-safe", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("gys-test-reset-guard", "preserve-me");
  });

  await page.goto("/GYSApp-Tauri/lainnya");

  const advanced = page.getByTestId("device-data-tools");
  await expect(advanced).toBeVisible();
  await expect(advanced).not.toHaveAttribute("open", "");

  const reset = page.getByRole("button", { name: /reset perangkat/i });
  await expect(reset).toBeHidden();
  await advanced.locator("summary").click();
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
