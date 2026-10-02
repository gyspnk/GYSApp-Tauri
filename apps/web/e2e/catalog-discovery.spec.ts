import { expect, test } from "@playwright/test";

for (const [locale, searchLabel, clearLabel] of [
  ["id", "Cari kesaksian", "Hapus filter"],
  ["en", "Search testimonies", "Clear filters"],
  ["zh", "搜索见证", "清除筛选"],
] as const) {
  test(`testimony search, empty recovery and reader summary are localized (${locale})`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(
      (locale) =>
        localStorage.setItem(
          "gys-shell-settings-v1",
          JSON.stringify({ version: 1, locale, theme: "light" }),
        ),
      locale,
    );
    await page.route(/^https:\/\//, (route) => route.abort());
    const snapshot = await (
      await page.request.get("/GYSApp-Tauri/offline/suara-sejati.json")
    ).json();
    snapshot.items = snapshot.items.slice(0, 2);
    snapshot.items[0] = {
      ...snapshot.items[0],
      title: "Kasih yang memulihkan",
      excerpt: "Kesaksian pemulihan keluarga.",
    };
    snapshot.items[1] = {
      ...snapshot.items[1],
      title: "Harapan di tengah badai",
      excerpt: "Doa membawa ketenangan.",
    };
    await page.route("**/offline/suara-sejati.json", (route) =>
      route.fulfill({ json: snapshot }),
    );
    await page.goto("/GYSApp-Tauri/suara");
    const cards = page.locator(".suara-library-grid .suara-library-item");
    await expect(cards).toHaveCount(2);
    const search = page.getByRole("searchbox", { name: searchLabel });
    await search.fill("KELUARGA");
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText("Kasih yang memulihkan");
    await expect(
      page.locator(".catalog-filter-status [role='status']"),
    ).toContainText("1");
    await search.fill("__unmatched__");
    await expect(cards).toHaveCount(0);
    await expect(page.locator(".catalog-search .empty-state")).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`testimony-empty-${locale}.png`),
    });
    await page.getByRole("button", { name: clearLabel, exact: true }).click();
    await expect(cards).toHaveCount(2);
    await expect(search).toBeFocused();
    await cards.first().click();
    await expect(page.locator(".reader-preview-note")).toBeVisible();
    await expect(page.locator(".suara-article-body")).toContainText(
      "Kesaksian pemulihan keluarga.",
    );
    await page.screenshot({
      path: testInfo.outputPath(`testimony-summary-${locale}.png`),
    });
    await page.locator(".detail-back a").click();
    await expect(page).toHaveURL(/\/suara$/);
    await expect(search).toBeVisible();
  });
}

test("literature reports filtered results and restores the collection", async ({
  page,
}) => {
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/GYSApp-Tauri/literatur");
  const rows = page.locator(".literature-row");
  await expect(rows.first()).toBeVisible();
  const total = await rows.count();
  await page
    .getByRole("searchbox", { name: "Cari literatur" })
    .fill("__unmatched__");
  await expect(rows).toHaveCount(0);
  await expect(
    page.locator(".catalog-filter-status [role='status']"),
  ).toContainText("0");
  await page.getByRole("button", { name: "Hapus filter", exact: true }).click();
  await expect(rows).toHaveCount(total);
});

test("background feed recovery updates visible catalog and reader covers", async ({
  page,
  context,
}) => {
  await context.route(/^https:\/\//, (route) => route.abort());
  const snapshot = await (
    await page.request.get("/GYSApp-Tauri/offline/suara-sejati.json")
  ).json();
  snapshot.items = snapshot.items.slice(0, 1);
  snapshot.items[0] = {
    ...snapshot.items[0],
    title: "Arsip lama",
    excerpt: "Kisah keluarga.",
  };
  delete snapshot.items[0].imageUrl;
  await context.route("**/offline/suara-sejati.json", (route) =>
    route.fulfill({ json: snapshot }),
  );
  let releaseRefresh!: () => void;
  const refreshGate = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  const recovered = structuredClone(snapshot);
  recovered.items[0].title = "Arsip diperbarui";
  recovered.items[0].imageUrl =
    "https://tjcorguploads.s3.amazonaws.com/tjcorg/wp-content/uploads/sites/43/2026/10/recovered.jpg";
  await context.route(/tjc\.org\/id\/wp-json\/wp\/v2\/posts/, async (route) => {
    if (!new URL(route.request().url()).searchParams.has("categories")) {
      await route.abort();
      return;
    }
    await refreshGate;
    await route.fulfill({ json: recovered });
  });
  await context.route("**/recovered.jpg", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#1697bf"/></svg>',
    }),
  );
  await page.goto("/GYSApp-Tauri/suara");
  const cover = page.locator(".suara-library-thumb").first();
  await expect(cover).toHaveAttribute("data-image-state", "missing");
  const search = page.getByRole("searchbox", { name: "Cari kesaksian" });
  await search.fill("keluarga");
  const reader = await context.newPage();
  await reader.goto(`/GYSApp-Tauri/suara/${snapshot.items[0].id}`);
  await expect(reader.locator(".reader-preview-note")).toBeVisible();
  releaseRefresh();
  await expect(page.locator(".suara-library-item").first()).toContainText(
    "Arsip diperbarui",
  );
  await expect(cover).toHaveAttribute("data-image-state", "loaded");
  await expect(search).toHaveValue("keluarga");
  await expect(reader.locator(".suara-article-card h1")).toHaveText(
    "Arsip diperbarui",
  );
  await expect(reader.locator(".suara-article-image-wrap")).toHaveAttribute(
    "data-image-state",
    "loaded",
  );
});
