import { expect, test } from "@playwright/test";

// Nothing measured uncaught exceptions: a route could throw during hydration
// and still pass every other contract, because the crash leaves a rendered page
// behind. The probes behind these tests found no throw today, which is exactly
// what makes the contract cheap to keep.

const ROUTES = [
  { name: "beranda", path: "/", ready: ".home-portals" },
  {
    name: "alkitab",
    path: "/bible?book=kejadian&chapter=1",
    ready: ".verse-content",
  },
  { name: "kidung", path: "/kidung/hymn-001", ready: ".hymn-text-title h1" },
  { name: "katalog", path: "/kidung", ready: ".pujian-list .pujian-item" },
  {
    name: "antrean",
    path: "/kidung?section=playlist",
    ready: ".kidung-index-toolbar",
  },
  { name: "literatur", path: "/literatur", ready: ".page-intro h1" },
  { name: "suara", path: "/suara", ready: ".page-intro h1" },
  { name: "iman", path: "/iman", ready: ".faith-rows" },
  {
    name: "pengaturan",
    path: "/lainnya?section=appearance",
    ready: "[data-setting='appearance']",
  },
];

const seed = async (page: import("@playwright/test").Page) => {
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
  // The BFF is not part of this check; a blocked fetch is an expected failure.
  await page.route(/^https:\/\//, (route) => route.abort());
};

test("every route boots without an uncaught exception", async ({ page }) => {
  const thrown: string[] = [];
  page.on("pageerror", (error) => thrown.push(error.message));
  await seed(page);
  for (const route of ROUTES) {
    await page.goto(`/GYSApp-Tauri${route.path}`);
    await expect(page.locator(route.ready).first()).toBeVisible({
      timeout: 30_000,
    });
    expect(thrown, `${route.name} threw during boot`).toEqual([]);
  }
});

test("opening the reader panels throws nothing", async ({ page }) => {
  const thrown: string[] = [];
  page.on("pageerror", (error) => thrown.push(error.message));
  await seed(page);
  await page.goto("/GYSApp-Tauri/kidung/hymn-001");
  await expect(page.locator(".hymn-text-title h1")).toBeVisible({
    timeout: 30_000,
  });
  await page.locator(".hymn-more-actions-summary").click();
  await expect(page.locator(".hymn-more-actions-panel")).toBeVisible();
  await page.goto("/GYSApp-Tauri/lainnya?section=appearance");
  await page.locator("[data-setting='appearance'] > summary").click();
  await expect(page.locator(".appearance-card")).toBeVisible();
  expect(thrown).toEqual([]);
});
