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
  await page.getByRole("button", { name: "Tampilkan chord" }).click();
  await expect(
    page.getByRole("button", { name: "Sembunyikan chord" }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".chord-capability").first()).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Nada dasar" }).click();
  await page.getByRole("option", { name: "D", exact: true }).click();
  await expect(page.locator(".transpose-control strong")).toHaveText("+2");
  await expect(page.locator(".lyrics-sheet")).toBeVisible();
  await page.getByRole("button", { name: "Buka PDF" }).click();
  await expect(page.locator(".pdf-reader")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator(".lyrics-sheet")).toHaveCount(0);
  await expect(page.locator(".pdf-chord-layer").first()).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Putar MIDI" }).click();
  await expect(page.locator(".media-surface")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".media-meta")).toContainText("Pujilah Allah");
  await expect
    .poll(
      () => page.locator(".media-surface").getAttribute("data-media-status"),
      { timeout: 30_000 },
    )
    .toMatch(/playing|ready|paused/);
  await expect(page.getByLabel("Instrumen MIDI")).toHaveValue("-1");
  await expect(page.getByLabel("Instrumen MIDI").locator("option")).toHaveCount(
    129,
  );
  await page.getByRole("button", { name: "Minimalkan pemutar" }).click();
  await expect(page.locator(".media-surface.is-minimized")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Perbesar pemutar" }),
  ).toBeVisible();
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

test("hymn reader preferences persist and PDF layout adapts to a phone", async ({
  page,
}) => {
  await page.goto("/GYSApp-Tauri/kidung/hymn-001");
  await expect(page.locator(".lyrics-sheet")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Perbesar ukuran teks" }).click();
  await expect(page.locator(".lyrics-sheet")).toHaveCSS("font-size", "19px");
  await expect(page.locator(".lyrics-sheet")).toHaveAttribute(
    "data-autofit-font-size",
    "19",
  );
  await page.getByRole("button", { name: "Buka PDF" }).click();
  await expect(page.locator(".pdf-reader")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Mendatar" }).click();
  await expect(page.locator(".pdf-stage")).toHaveAttribute(
    "data-pdf-layout",
    "horizontal",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "2 halaman" }).click();
  await expect(page.locator(".pdf-stage")).toHaveAttribute(
    "data-pdf-layout",
    "single",
  );
});
