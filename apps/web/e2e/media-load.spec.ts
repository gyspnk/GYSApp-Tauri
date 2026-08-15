import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test("canonical chord, fork PDF, and MIDI assets open from hymn detail", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto("/GYSApp-Tauri/kidung/hymn-001");
  await expect(
    page.getByRole("heading", { name: /Pujilah Allah/ }),
  ).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "Buka chord" }).click();
  await expect(page.getByRole("region", { name: "Chord viewer" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.locator(".chord-layout-page").first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.locator(".lyrics-sheet")).toHaveCount(0);
  await page.getByRole("tab", { name: "Lirik" }).click();
  await expect(page.locator(".lyrics-sheet")).toBeVisible();
  await expect(page.getByRole("region", { name: "Chord viewer" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Buka PDF" }).click();
  await expect(page.locator(".pdf-reader")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator(".lyrics-sheet")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Chord viewer" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Putar MIDI" }).click();
  await expect(page.locator(".media-surface")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".media-meta")).toContainText("Pujilah Allah");
  await expect
    .poll(
      () => page.locator(".media-surface").getAttribute("data-media-status"),
      { timeout: 30_000 },
    )
    .toMatch(/playing|ready|paused/);
});

test("PDF failure exposes an actionable retry without leaving the hymn shell", async ({
  page,
}) => {
  await page.route("**/*.{pdf,PDF}", (route) =>
    route.fulfill({ status: 503, body: "upstream unavailable" }),
  );
  await page.route("**/GYSApp-Data/**", (route) =>
    route.fulfill({ status: 503, body: "fallback unavailable" }),
  );
  await page.route("**/assets/pdf/**", (route) =>
    route.fulfill({ status: 503, body: "local seed unavailable" }),
  );
  await page.goto("/GYSApp-Tauri/kidung/hymn-001");
  await expect(
    page.getByRole("heading", { name: /Pujilah Allah/ }),
  ).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Buka PDF" }).click();
  await expect(page.getByRole("alert")).toContainText("PDF gagal dimuat", {
    timeout: 20_000,
  });
  await expect(page.getByRole("button", { name: "Coba lagi" })).toBeVisible();
});
