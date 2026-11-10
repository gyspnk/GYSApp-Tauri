import { expect, test } from "@playwright/test";

const items = [
  {
    id: "suara-second",
    title: "Pemulihan yang Diterima",
    excerpt: "Kesaksian tengah arsip.",
    url: "https://tjc.org/id/suarasejati/suara-second/",
    publishedAt: "2025-02-10T00:00:00Z",
    source: "tjc.org",
  },
  {
    id: "suara-oldest",
    title: "Anugerah Pertama",
    excerpt: "Kesaksian paling lama.",
    url: "https://tjc.org/id/suarasejati/suara-oldest/",
    publishedAt: "2025-01-05T00:00:00Z",
    source: "tjc.org",
  },
  {
    id: "suara-newest",
    title: "Kesaksian Terbaru",
    excerpt: "Kesaksian paling baru.",
    url: "https://tjc.org/id/suarasejati/suara-newest/",
    publishedAt: "2025-03-20T00:00:00Z",
    source: "tjc.org",
  },
];

test("the Suara order control reorders the archive without refetching", async ({
  page,
}) => {
  await page.route(/^https:\/\//, (route) => route.abort());
  // The offline snapshot is what the page reads when the network is gone.
  await page.route("**/offline/suara-sejati.json", (route) =>
    route.fulfill({
      json: { source: "tjc.org", generatedAt: "2025-04-01T00:00:00Z", items },
    }),
  );
  await page.goto("/GYSApp-Tauri/suara");

  const titles = page.locator(
    ".suara-library-item > .suara-card-content > strong",
  );
  await expect(titles.first()).toHaveText("Kesaksian Terbaru");

  await page.getByRole("combobox", { name: "Urutkan" }).click();
  await page.getByRole("option", { name: "Terlama" }).click();
  await expect(titles.first()).toHaveText("Anugerah Pertama");
  await expect(titles.last()).toHaveText("Kesaksian Terbaru");

  await page.getByRole("combobox", { name: "Urutkan" }).click();
  await page.getByRole("option", { name: "Menurut judul" }).click();
  await expect(titles.first()).toHaveText("Anugerah Pertama");

  await expect(page.getByRole("status").first()).toContainText("3");
});
