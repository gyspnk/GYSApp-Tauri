import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

test.describe("distributed asset UI", () => {
  test.use({ serviceWorkers: "block" });

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

  test("Kidung catalog hides optional collections until they are installed", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/GYSApp-Tauri/kidung");
    await expect(
      page.getByRole("heading", { name: "Kidung", exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await page.getByRole("combobox", { name: "Koleksi", exact: true }).click();
    await expect(page.getByRole("option", { name: "english" })).toHaveCount(0);
    await expect(page.getByRole("option", { name: "mandarin" })).toHaveCount(0);
  });

  test("Kidung catalog labels an installed optional hymnal readably", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/GYSApp-Tauri/");
    const payload = Buffer.from("%PDF-1.4\noptional hymnal fixture\n", "utf8");
    const metadata = Buffer.from(
      JSON.stringify([
        {
          number: 1,
          title: "Hymne Fixture",
          verses: ["A test verse."],
          pdfFile: "hymne/001.pdf",
        },
      ]),
      "utf8",
    );
    const payloadChecksum = createHash("sha256").update(payload).digest("hex");
    const metadataChecksum = createHash("sha256")
      .update(metadata)
      .digest("hex");
    const cacheKey = "https://gysapp.local/distributed-assets/HYMNE/2026.05.21";
    const record = {
      code: "HYMNE",
      kind: "hymnal",
      version: "2026.05.21",
      releaseTag: "hymnals-test",
      installFileName: "hymne_master.pdf",
      packageSizeBytes: payload.byteLength,
      packageChecksumSha256: payloadChecksum,
      cacheName: "gys-distributed-v1-hymne-label-test",
      cacheKey,
      payloadBytes: payload.byteLength,
      payloadChecksumSha256: payloadChecksum,
      installedAt: "2026-09-26T00:00:00.000Z",
      metadataCacheKey: `${cacheKey}/catalog`,
      metadataBytes: metadata.byteLength,
      metadataChecksumSha256: metadataChecksum,
    };
    await page.evaluate(
      async ({ record, payload, metadata }) => {
        const cache = await caches.open(record.cacheName);
        await cache.put(
          record.cacheKey,
          new Response(new Uint8Array(payload), {
            headers: { "content-type": "application/pdf" },
          }),
        );
        await cache.put(
          record.metadataCacheKey,
          new Response(new Uint8Array(metadata), {
            headers: { "content-type": "application/json" },
          }),
        );
        localStorage.setItem(
          "gys-distributed-assets-v1",
          JSON.stringify({ HYMNE: record }),
        );
      },
      {
        record,
        payload: [...payload],
        metadata: [...metadata],
      },
    );
    const seededCache = await page.evaluate(async () => {
      const registry = JSON.parse(
        localStorage.getItem("gys-distributed-assets-v1") ?? "{}",
      );
      const record = registry.HYMNE;
      const cache = await caches.open(record.cacheName);
      const payloadResponse = await cache.match(record.cacheKey);
      const metadataResponse = await cache.match(record.metadataCacheKey);
      return {
        record: Boolean(record),
        payloadBytes: payloadResponse
          ? (await payloadResponse.arrayBuffer()).byteLength
          : 0,
        metadataBytes: metadataResponse
          ? (await metadataResponse.arrayBuffer()).byteLength
          : 0,
      };
    });
    expect(seededCache).toMatchObject({
      record: true,
      payloadBytes: payload.byteLength,
      metadataBytes: metadata.byteLength,
    });
    await page.goto("/GYSApp-Tauri/kidung");
    await expect(
      page.getByRole("heading", { name: "Kidung", exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    const filter = page.locator(".kidung-header-filter .control-select");
    await filter.locator(".control-select-trigger").click();
    await expect(filter.locator(".control-select-option")).toHaveText([
      "Semua",
      "English",
      "KR",
    ]);
    await page.getByRole("option", { name: "English", exact: true }).click();
    await expect(
      page.locator('.pujian-item[data-id="hymne-001"]'),
    ).toBeVisible();
  });
});

test.describe("distributed Bible lifecycle", () => {
  test.use({ serviceWorkers: "allow" });

  test("distributed Bible download survives reload, removal and reinstall", async ({
    page,
  }) => {
    // Set to the verified upstream GYSPKG to cover real KJV decoding and reading.
    const actualKjvPackage = process.env.GYS_KJV_PACKAGE_FIXTURE;
    const payload = await readFile(
      actualKjvPackage ??
        new URL("../public/offline/bible/b_tb.db", import.meta.url),
    );
    const catalog = JSON.parse(
      await readFile(
        new URL("../public/offline/distributed-assets.json", import.meta.url),
        "utf8",
      ),
    ) as {
      items: Array<{
        code: string;
        track: string;
        version: string;
        fileName: string;
        downloadUrl: string;
        installFileName: string;
        sizeBytes: number;
        checksumSha256: string;
      }>;
    };
    const item = catalog.items.find((candidate) => candidate.code === "b_kjv")!;
    if (!actualKjvPackage) {
      item.sizeBytes = payload.byteLength;
      item.checksumSha256 = createHash("sha256").update(payload).digest("hex");
    }
    const context = page.context();
    const packageRequests: string[] = [];
    context.on("request", (request) => {
      if (request.url().includes("/api/v1/assets/distributed/b_kjv"))
        packageRequests.push(request.url());
    });
    for (const track of ["bibles", "hymnals", "soundfont"] as const) {
      const fileName = `${track}-manifest.json`;
      await context.route(`**/${fileName}`, (route) =>
        route.fulfill({
          json: {
            track,
            releaseTag: `${track}-test`,
            publishedAt: "2026-08-18T00:00:00.000Z",
            packages: catalog.items
              .filter((candidate) => candidate.track === track)
              .map((candidate) => ({
                code: candidate.code,
                version: candidate.version,
                fileName: candidate.fileName,
                downloadUrl: candidate.downloadUrl,
                installFileName: candidate.installFileName,
                sizeBytes: candidate.sizeBytes,
                checksumSha256: candidate.checksumSha256,
              })),
          },
        }),
      );
    }
    await context.route("**/offline/distributed-assets.json", (route) =>
      route.fulfill({ json: catalog }),
    );
    await context.route(
      /\/api\/v1\/assets\/distributed\/b_kjv$/,
      async (route) => {
        await route.fulfill({
          body: payload,
          headers: {
            "access-control-allow-origin": "*",
            "content-length": String(payload.byteLength),
            "content-type": "application/octet-stream",
          },
        });
      },
    );
    if (actualKjvPackage) {
      const kjvVerse = "In the beginning God created the heaven and the earth.";
      await page.goto("/GYSApp-Tauri/bible");
      await page.evaluate(() => {
        localStorage.setItem("gys-bible-version-v1", "b_tb");
        localStorage.setItem("gys-bible-split-v1", "1");
        localStorage.setItem("gys-bible-split-sync-scroll-v1", "1");
        localStorage.setItem("gys-bible-secondary-version", "b_kjv");
      });
      await page.reload();
      const secondaryPane = page.locator(".bible-pane-secondary");
      await expect(secondaryPane).toContainText("Tidak dapat memuat KJV.", {
        timeout: 15_000,
      });
      await secondaryPane.getByRole("button", { name: "Coba lagi" }).click();
      await expect(secondaryPane).toContainText("Tidak dapat memuat KJV.");

      const installerPage = await context.newPage();
      await installerPage.goto("/GYSApp-Tauri/lainnya?section=data");
      const downloadButton = installerPage.getByRole("button", {
        name: "Unduh King James Version",
      });
      await expect(downloadButton).toBeVisible();
      if (await downloadButton.isDisabled()) {
        await expect(
          installerPage.locator(".distributed-assets-card > .inline-error"),
        ).toContainText("Layanan unduhan belum dikonfigurasi");
        await expect(downloadButton).toBeDisabled();
        test.skip(
          true,
          "The static preview has no configured BFF download service.",
        );
      }
      await downloadButton.click();
      await expect(
        installerPage.getByText(/Tersimpan · v2026\.05\.21/),
      ).toBeVisible({ timeout: 45_000 });
      await installerPage.close();

      await expect
        .poll(() =>
          page.evaluate(() => Boolean(navigator.serviceWorker?.controller)),
        )
        .toBe(true);
      const offlineRuntimeFailures: string[] = [];
      page.on("requestfailed", (request) => {
        if (/bible-sql-runtime-|sql-wasm-/u.test(request.url()))
          offlineRuntimeFailures.push(request.url());
      });
      await context.setOffline(true);
      await secondaryPane.getByRole("button", { name: "Coba lagi" }).click();
      await expect(secondaryPane.locator(".verse-row").first()).toContainText(
        kjvVerse,
        { timeout: 5_000 },
      );
      expect(offlineRuntimeFailures).toEqual([]);
      await context.setOffline(false);

      const panes = page.locator(".bible-reader.is-split .bible-pane");
      await expect(panes).toHaveCount(2);
      await expect(panes.nth(1).locator(".verse-row").first()).toContainText(
        kjvVerse,
        { timeout: 15_000 },
      );
      const readVisibleAnchors = () =>
        page
          .locator(".bible-reader.is-split .verse-list")
          .evaluateAll((lists) =>
            lists.map((list) => {
              const top = list.getBoundingClientRect().top;
              return Array.from(list.querySelectorAll(".verse-row")).findIndex(
                (row) => row.getBoundingClientRect().bottom > top + 1,
              );
            }),
          );
      const primaryList = panes.nth(0).locator(".verse-list");
      await primaryList.evaluate((list) => {
        const verse = list.querySelectorAll<HTMLElement>(".verse-row")[14]!;
        list.scrollTop +=
          verse.getBoundingClientRect().top - list.getBoundingClientRect().top;
      });
      const primaryAnchor = await primaryList.evaluate((list) => {
        const top = list.getBoundingClientRect().top;
        return Array.from(list.querySelectorAll(".verse-row")).findIndex(
          (row) => row.getBoundingClientRect().bottom > top + 1,
        );
      });
      expect(primaryAnchor).toBeGreaterThan(10);
      await expect
        .poll(readVisibleAnchors)
        .toEqual([primaryAnchor, primaryAnchor]);
      const secondaryList = panes.nth(1).locator(".verse-list");
      await secondaryList.evaluate((list) => {
        const verse = list.querySelectorAll<HTMLElement>(".verse-row")[17]!;
        list.scrollTop +=
          verse.getBoundingClientRect().top - list.getBoundingClientRect().top;
      });
      const secondaryAnchor = await secondaryList.evaluate((list) => {
        const top = list.getBoundingClientRect().top;
        return Array.from(list.querySelectorAll(".verse-row")).findIndex(
          (row) => row.getBoundingClientRect().bottom > top + 1,
        );
      });
      expect(secondaryAnchor).toBeGreaterThan(10);
      await expect
        .poll(readVisibleAnchors)
        .toEqual([secondaryAnchor, secondaryAnchor]);
    } else {
      await page.goto("/GYSApp-Tauri/lainnya?section=data");
      const downloadButton = page.getByRole("button", {
        name: "Unduh King James Version",
      });
      await expect(downloadButton).toBeVisible();
      if (await downloadButton.isDisabled()) {
        await expect(
          page.locator(".distributed-assets-card > .inline-error"),
        ).toContainText("Layanan unduhan belum dikonfigurasi");
        await expect(downloadButton).toBeDisabled();
        test.skip(
          true,
          "The static preview has no configured BFF download service.",
        );
      }
      await downloadButton.click();
      await expect(page.getByText(/Tersimpan · v2026\.05\.21/)).toBeVisible({
        timeout: 45_000,
      });

      await page.goto("/GYSApp-Tauri/bible");
      await page.getByRole("button", { name: "Versi", exact: true }).click();
      await page.getByRole("option", { name: "King James Version" }).click();
      await expect(page.getByText("KJV", { exact: true }).first()).toBeVisible({
        timeout: 15_000,
      });
    }
    const primaryVersionButton = actualKjvPackage ? "Versi 1" : "Versi";
    await page.reload();
    await page
      .getByRole("button", { name: primaryVersionButton, exact: true })
      .click();
    await page.getByRole("option", { name: "King James Version" }).click();
    await expect(page.getByText("KJV", { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    });

    await page.goto("/GYSApp-Tauri/lainnya?section=data");
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .locator(".distributed-asset-row", {
        hasText: "King James Version",
      })
      .getByRole("button", { name: "Hapus", exact: true })
      .click();
    await expect(
      page.locator(".distributed-asset-row", {
        hasText: "King James Version",
      }),
    ).toContainText("Belum diunduh");
    await page.goto("/GYSApp-Tauri/bible");
    await page
      .getByRole("button", { name: primaryVersionButton, exact: true })
      .click();
    await expect(
      page.getByRole("option", { name: "King James Version" }),
    ).toHaveCount(0);

    await page.goto("/GYSApp-Tauri/lainnya?section=data");
    const reinstallButton = page.getByRole("button", {
      name: "Unduh King James Version",
    });
    await expect(reinstallButton).toBeEnabled();
    await reinstallButton.click();
    await expect(page.getByText(/Tersimpan · v2026\.05\.21/)).toBeVisible({
      timeout: 45_000,
    });
    expect(packageRequests).toHaveLength(2);

    await context.unrouteAll({ behavior: "wait" });
    await page.goto("/GYSApp-Tauri/bible");
    await page
      .getByRole("button", { name: primaryVersionButton, exact: true })
      .click();
    await expect(
      page.getByRole("option", { name: "King James Version" }),
    ).toBeVisible();
    if (actualKjvPackage) {
      await page.getByRole("option", { name: "King James Version" }).click();
      await expect(
        page.locator(".bible-pane .verse-row").first(),
      ).toContainText(
        "In the beginning God created the heaven and the earth.",
        { timeout: 15_000 },
      );
      const splitPanes = page.locator(".bible-reader.is-split .bible-pane");
      await expect(splitPanes).toHaveCount(2);
      await page.getByRole("button", { name: "Versi 2", exact: true }).click();
      await page.getByRole("option", { name: "Terjemahan Baru" }).click();
      await expect(
        splitPanes.nth(1).locator(".verse-row").first(),
      ).toContainText(/Pada mulanya/);
      await page.context().setOffline(true);
      await expect(
        splitPanes.nth(0).locator(".verse-row").first(),
      ).toContainText("In the beginning God created the heaven and the earth.");
      await expect(
        splitPanes.nth(1).locator(".verse-row").first(),
      ).toContainText(/Pada mulanya/);
      await expect(
        page.locator(".bible-pane-secondary .error-panel"),
      ).toHaveCount(0);
    }
  });
});
