import { expect, test } from "@playwright/test";

test("asset management lists optional Bible and hymnal packages without prefetching them", async ({
  page,
}) => {
  const packageRequests: string[] = [];
  page.on("request", (request) => {
    if (/\.(?:gyspkg|sf2)(?:\?|$)/i.test(request.url()))
      packageRequests.push(request.url());
  });

  await page.goto("/GYSApp-Tauri/lainnya?section=data");
  await expect(
    page.getByRole("heading", { name: "Manajemen Aset", exact: true }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByText("King James Version", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Chinese Union Version", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Hymne (English Version)", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Mandarin", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Aku Senang Menyanyi I", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Aku Senang Menyanyi M", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Aku Senang Menyanyi P", { exact: true }),
  ).toBeVisible();

  await page.waitForTimeout(500);
  expect(packageRequests).toEqual([]);
});

test("Kidung catalog includes Fork English and Mandarin metadata", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/GYSApp-Tauri/kidung");
  await expect(
    page.getByRole("heading", { name: "Kidung", exact: true }),
  ).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Koleksi" }).click();
  await page.getByRole("option", { name: "english", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Holy, Holy, Holy/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Koleksi" }).click();
  await page.getByRole("option", { name: "mandarin", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /頌讚獨一真神/ }),
  ).toBeVisible();
});
