import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test("a bare hymn number opens the hymn instead of a not-found panel", async ({
  page,
}) => {
  await page.goto("/GYSApp-Tauri/kidung/1");
  await expect(page).toHaveURL(/\/kidung\/hymn-001$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Pujilah Allah Yang Maha Esa",
  );
});

test("a split hymn number lands on its first part", async ({ page }) => {
  await page.goto("/GYSApp-Tauri/kidung/51");
  await expect(page).toHaveURL(/\/kidung\/hymn-051A$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Batu Zaman",
  );
  await expect(page.getByText("Pujian tidak ditemukan")).toHaveCount(0);
});
