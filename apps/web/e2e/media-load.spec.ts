import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test("text-first Kidung keeps PDF.js lazy until a PDF-backed feature is used", async ({
  page,
}) => {
  const pdfRuntimeRequests: string[] = [];
  page.on("request", (request) => {
    if (/pdf\.worker|pdf\.mjs/i.test(request.url()))
      pdfRuntimeRequests.push(request.url());
  });
  await page.goto("/GYSApp-Tauri/kidung/hymn-001");
  await expect(
    page.getByRole("heading", { name: /Pujilah Allah/ }),
  ).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(250);
  expect(pdfRuntimeRequests).toEqual([]);

  await page.getByRole("button", { name: "Tampilkan chord" }).click();
  await expect(
    page.getByRole("button", { name: "Sembunyikan chord" }),
  ).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(() => pdfRuntimeRequests.length, { timeout: 20_000 })
    .toBeGreaterThan(0);
});

test("canonical chord, fork PDF, and MIDI assets open from hymn detail", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const missingMidiRequests: string[] = [];
  const forkPdfRequests: string[] = [];
  page.on("request", (request) => {
    if (/kr_master\.pdf/i.test(request.url()))
      forkPdfRequests.push(request.url());
  });
  page.on("response", (response) => {
    if (response.status() === 404 && /\/assets\/midi\//.test(response.url()))
      missingMidiRequests.push(response.url());
  });
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
  // Chord extraction and the visible reader share one immutable PDF request;
  // the second presentation cannot download the master again.
  expect(forkPdfRequests).toHaveLength(1);
  await page.getByRole("button", { name: "Buka MIDI dari viewer" }).click();
  await expect(page.locator(".media-surface")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".media-meta")).toContainText("Pujilah Allah");
  await expect(page.locator(".media-collapse-toggle")).toBeVisible();
  await page.locator(".media-collapse-toggle").click();
  await expect(page.locator(".media-surface.is-minimized")).toBeVisible();
  await page.getByRole("button", { name: "Perbesar pemutar" }).click();
  await expect(page.locator(".media-transport-controls")).toBeVisible();
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
  await page.locator(".media-surface .media-minimize").click();
  await expect(page.locator(".media-surface.is-minimized")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Perbesar pemutar" }),
  ).toBeVisible();
  const dragHandle = page.getByRole("button", { name: "Geser pemutar media" });
  await dragHandle.focus();
  const before = await dragHandle.boundingBox();
  await dragHandle.press("ArrowLeft");
  const after = await dragHandle.boundingBox();
  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  expect(after!.x).toBeLessThan(before!.x);
  expect(missingMidiRequests).toEqual([]);
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

test("literature PDF failure exposes retry inside the application reader shell", async ({
  page,
}) => {
  await page.route("**/*.{pdf,PDF}", (route) =>
    route.fulfill({ status: 503, body: "literature PDF unavailable" }),
  );
  await page.goto("/GYSApp-Tauri/literatur");
  await expect(
    page.getByRole("link", { name: /Kitab Markus/i }).first(),
  ).toBeVisible({
    timeout: 15_000,
  });
  await page
    .getByRole("link", { name: /Kitab Markus/i })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "Kitab Markus" })).toBeVisible(
    {
      timeout: 15_000,
    },
  );
  await page.getByRole("button", { name: "Baca di aplikasi" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "PDF belum dapat dibuka",
    {
      timeout: 20_000,
    },
  );
  await expect(
    page.getByRole("alert").getByRole("button", { name: "Coba lagi" }),
  ).toBeVisible();
});

test("literature PDF stays inline, jumps pages, and resumes the last page", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.route("**/*.{pdf,PDF}", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response });
  });
  await page.goto("/GYSApp-Tauri/literatur");
  await page
    .getByRole("link", { name: /Kitab Markus/i })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "Kitab Markus" })).toBeVisible(
    { timeout: 15_000 },
  );
  await page.getByRole("button", { name: "Baca di aplikasi" }).click();
  await expect(page.locator(".pdf-reader")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".pdf-toolbar")).toContainText("Page 1 / 324");

  await page
    .getByRole("spinbutton", { name: "Lompat ke halaman PDF" })
    .fill("10");
  await expect(page.locator(".pdf-toolbar")).toContainText("Page 10 / 324");
  await expect(
    page.getByRole("progressbar", { name: /Kemajuan membaca/ }),
  ).toHaveAttribute("value", "3");
  await expect(page).toHaveURL(/\/literatur\//);

  await page.getByRole("button", { name: "Tutup" }).click();
  await expect(page.locator(".pdf-reader")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Lanjutkan dari halaman 10" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Lanjutkan dari halaman 10" }).click();
  await expect(page.locator(".pdf-reader")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".pdf-toolbar")).toContainText("Page 10 / 324");
});

test("hymn reader preferences persist and PDF layout adapts to a phone", async ({
  page,
}) => {
  await page.goto("/GYSApp-Tauri/kidung/hymn-133");
  await expect(page.locator(".lyrics-sheet")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Perbesar ukuran teks" }).click();
  await expect(page.locator(".lyrics-sheet")).toHaveCSS("font-size", "19px");
  await expect(page.locator(".lyrics-sheet")).toHaveAttribute(
    "data-autofit-font-size",
    "19",
  );
  await page.getByRole("button", { name: "Buka PDF" }).click();
  await expect(page.locator(".pdf-reader")).toBeVisible({ timeout: 30_000 });
  await page
    .locator(".pdf-toolbar")
    .getByRole("button", { name: "Berikutnya" })
    .click();
  await page.reload();
  await expect(page.locator(".pdf-reader")).toBeVisible({ timeout: 30_000 });
  await page
    .locator(".pdf-toolbar")
    .getByRole("button", { name: "Sebelumnya" })
    .click();
  const resumeButton = page.locator('[data-pdf-resume="true"]');
  await expect(resumeButton).toBeVisible();
  const resumeLabel = await resumeButton.textContent();
  const resumePage = resumeLabel?.match(/(\d+)$/)?.[1];
  if (!resumePage) throw new Error(`Unexpected resume label: ${resumeLabel}`);
  await resumeButton.click();
  await expect(page.locator(".pdf-toolbar")).toContainText("Page 2 / 2");
  await page.getByRole("button", { name: "Mendatar" }).click();
  await expect(page.locator(".pdf-stage")).toHaveAttribute(
    "data-pdf-layout",
    "horizontal",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Pengaturan PDF" }).click();
  await page.getByRole("button", { name: "2 halaman" }).click();
  await expect(page.locator(".pdf-stage")).toHaveAttribute(
    "data-pdf-layout",
    "single",
  );
});

test("rapid hymn/viewer changes keep the latest route and do not leak stale PDF state", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto("/GYSApp-Tauri/kidung/hymn-001");
  await expect(
    page.getByRole("heading", { name: /Pujilah Allah/ }),
  ).toBeVisible({ timeout: 15_000 });

  // Start two heavyweight, cancellable paths and immediately change the
  // entity. The keyed detail boundary plus run guards must leave the second
  // hymn in a text-first state rather than displaying hymn-001's late PDF.
  await page.getByRole("button", { name: "Tampilkan chord" }).click();
  await page.getByRole("button", { name: "Buka PDF" }).click();
  await page.getByRole("button", { name: "Berikutnya" }).click();

  await expect(page).toHaveURL(/\/kidung\/hymn-002$/);
  await expect(page.locator(".lyrics-sheet")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".pdf-reader")).toHaveCount(0);
  await expect(page.locator(".hymn-detail-page h1")).not.toHaveText(
    "Pujilah Allah",
  );
});
