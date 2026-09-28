import { readFile } from "node:fs/promises";
import { decryptBackupV2, encryptBackupV2 } from "@gys/domain";
import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test("faith note list updates immediately after saving without a reload", async ({
  page,
}) => {
  await page.goto("/GYSApp-Tauri/iman");
  const summaryButton = page.getByRole("button", {
    name: "Buka catatan pokok iman 1",
    exact: true,
  });
  await summaryButton.click();
  const summary = page.getByRole("dialog", { name: "Pokok 1" });
  await expect(summary).toBeVisible();
  await summary.getByRole("button", { name: /Catatan pribadi/ }).click();
  const notes = page.getByRole("dialog", { name: "Catatan pokok iman" });
  await expect(notes).toBeVisible();
  await notes
    .getByRole("textbox")
    .fill("Refleksi yang harus langsung terlihat");
  await notes.getByRole("button", { name: "Simpan catatan" }).click();
  await expect(notes).toBeHidden();

  await summary.getByRole("button", { name: /Catatan pribadi/ }).click();
  await expect(notes.getByText("1 catatan", { exact: true })).toBeVisible();
  await expect(
    notes
      .locator(".bible-notes-list .bible-notes-item-open")
      .filter({ hasText: "Refleksi yang harus langsung terlihat" }),
  ).toHaveCount(1);
});

test("encrypted backup preserves durable preferences but excludes sensitive device state", async ({
  page,
}) => {
  const durableSettings: Record<string, string> = {
    "gys-faith-note-1": "Catatan iman yang dibackup",
    "gys-accent-color": "#355c9a",
    "gys-bible-secondary-version": "KJV",
    "gys-bible-split-sync-scroll-v1": "0",
    "gys-bible-typography-v1": JSON.stringify({
      fontSize: 21,
      lineHeight: 1.8,
    }),
    "gys-bible-highlight-palette-v1": JSON.stringify(["#ca7231"]),
    "gys-chord-ui-prefs": JSON.stringify({ theme: "red", fill: "soft" }),
    "gys-hymn-natural-chords": "0",
    "gys-hymn-view-scope": "favorites",
    "gys-hymn-viewer-prefs-v1": JSON.stringify({
      defaultTwoPage: true,
      defaultVerticalScroll: false,
    }),
    "gys-kidung-active-playlist": "ibadah-malam",
    "gys-kidung-playlists-v1": JSON.stringify([
      {
        id: "ibadah-malam",
        name: "Ibadah Malam",
        songIds: ["hymn-001"],
        createdAt: 1,
      },
    ]),
    "gys-lyrics-font-size": "32",
    "gys-lyrics-header-collapsed": "1",
    "gys-lyrics-line-spacing": "1.9",
    "gys-lyrics-show-chords": "0",
    "gys-hymn-accidental": "flat",
    "gys-speech-pitch-v1": "1.1",
    "gys-speech-volume-v1": "0.7",
  };
  const excludedSettings: Record<string, string> = {
    "gys-live-v1-token": "do-not-export-token",
    "gys-egys-session-v1": JSON.stringify({ userId: "private-session" }),
    "gys-egys-profile-v1": JSON.stringify({ id: "private-profile" }),
    "gys-diagnostics-v1": JSON.stringify([{ message: "device log" }]),
    "gys-custom-edge-endpoint-v1": "https://private-device.invalid/tts",
    "gys-distributed-assets-v1": JSON.stringify({ device: "cache-state" }),
    "gys-asset-index-v1": JSON.stringify({ local: "cache-pointer" }),
    "gys-active-asset-manifest-v1": JSON.stringify({
      local: "manifest-pointer",
    }),
    "gys-chord-cache-index-v1": JSON.stringify({ local: "blob-pointer" }),
  };

  await page.addInitScript(
    ({ durableSettings, excludedSettings }) => {
      for (const [key, value] of Object.entries(durableSettings))
        localStorage.setItem(key, value);
      for (const [key, value] of Object.entries(excludedSettings))
        localStorage.setItem(key, value);
    },
    { durableSettings, excludedSettings },
  );
  await page.goto("/GYSApp-Tauri/lainnya");
  await page
    .locator('.more-setting-section[data-setting="backup"] > summary')
    .click();
  await page.getByRole("button", { name: /Backup & import/ }).click();
  const panel = page.getByRole("region", { name: "Backup dan import" });
  await expect(panel).toBeVisible();
  await panel.getByLabel("Kata sandi backup").fill("integrity-1234");
  const downloadPromise = page.waitForEvent("download");
  await panel.getByRole("button", { name: "Ekspor .gysbk" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();
  const envelope = JSON.parse(await readFile(path!, "utf8"));
  const restored = await decryptBackupV2(envelope, "integrity-1234");

  expect(restored.settings).toMatchObject(durableSettings);
  for (const key of Object.keys(excludedSettings))
    expect(restored.settings).not.toHaveProperty(key);
});

test("encrypted backup round-trips Bible notes, highlights, and bookmarks", async ({
  page,
}) => {
  const password = "bible-backup-1234";
  const annotations = {
    "gys-bible-bookmarks": JSON.stringify(["1:1:1"]),
    "gys-bible-notes-v1": JSON.stringify({
      "1:1:1": [{ id: "roundtrip-note", text: "Catatan pulih dari backup." }],
    }),
    "gys-bible-highlights-v1": JSON.stringify({ "1:1:1": "#ca7231" }),
    "gys-bible-highlight-palette-v1": JSON.stringify(["#ca7231"]),
  };
  await page.addInitScript((values) => {
    for (const [key, value] of Object.entries(values))
      localStorage.setItem(key, value);
  }, annotations);
  await page.goto("/GYSApp-Tauri/lainnya");
  await page
    .locator('.more-setting-section[data-setting="backup"] > summary')
    .click();
  await page.getByRole("button", { name: /Backup & import/ }).click();
  const panel = page.getByRole("region", { name: "Backup dan import" });
  await panel.getByLabel("Kata sandi backup").fill(password);
  const downloadPromise = page.waitForEvent("download");
  await panel.getByRole("button", { name: "Ekspor .gysbk" }).click();
  const path = await (await downloadPromise).path();
  expect(path).toBeTruthy();
  const backupBytes = await readFile(path!);
  const envelope = JSON.parse(backupBytes.toString("utf8"));
  const exported = await decryptBackupV2(envelope, password);
  expect(exported.settings).toMatchObject(annotations);

  await page.evaluate(
    (keys) => keys.forEach((key) => localStorage.removeItem(key)),
    Object.keys(annotations),
  );
  await expect
    .poll(() =>
      page.evaluate(
        (keys) => keys.map((key) => localStorage.getItem(key)),
        Object.keys(annotations),
      ),
    )
    .toEqual(Object.values(annotations).map(() => null));
  await page.getByRole("button", { name: /Backup & import/ }).click();
  const importPanel = page.getByRole("region", { name: "Backup dan import" });
  await importPanel.getByLabel("Kata sandi backup").fill(password);
  const chooserPromise = page.waitForEvent("filechooser");
  await importPanel.getByRole("button", { name: "Pilih file" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: "bible-annotations.gysbk",
    mimeType: "application/json",
    buffer: backupBytes,
  });
  await importPanel.getByRole("button", { name: "Impor" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        (keys) =>
          Object.fromEntries(
            keys.map((key) => [key, localStorage.getItem(key)]),
          ),
        Object.keys(annotations),
      ),
    )
    .toEqual(annotations);

  await page.goto("/GYSApp-Tauri/bible");
  await expect(page.getByRole("heading", { name: /Kejadian 1/ })).toBeVisible({
    timeout: 15_000,
  });
  const verse = page.locator(".verse-row").first();
  await expect(verse).toHaveClass(/is-highlight-custom/);
  await expect(verse.locator(".verse-number")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect
    .poll(() =>
      verse.evaluate((element) =>
        getComputedStyle(element).getPropertyValue("--verse-highlight-color"),
      ),
    )
    .toBe("#ca7231");
  await verse.locator(".verse-text").click();
  await page
    .getByRole("toolbar", { name: "Aksi ayat terpilih" })
    .getByRole("button", { name: "Catatan ayat" })
    .click();
  await expect(
    page
      .getByRole("dialog", { name: "Catatan ayat" })
      .locator(".bible-notes-list .bible-notes-item-open")
      .filter({ hasText: "Catatan pulih dari backup." }),
  ).toBeVisible();
});

test("backup import restores only portable settings from a valid envelope", async ({
  page,
}) => {
  const password = "import-integrity-1234";
  const portableSettings = {
    "gys-accent-color": "#355c9a",
    "gys-bible-secondary-version": "KJV",
  };
  const blockedSettings = {
    "gys-live-v1-token": "injected-token",
    "gys-egys-session-v1": JSON.stringify({ userId: "injected-session" }),
    "gys-custom-edge-endpoint-v1": "https://injected.invalid/tts",
    "gys-asset-index-v1": JSON.stringify({ local: "cache-pointer" }),
    "gys-active-asset-manifest-v1": JSON.stringify({
      local: "manifest-pointer",
    }),
    "gys-chord-cache-index-v1": JSON.stringify({ local: "blob-pointer" }),
  };
  const envelope = await encryptBackupV2(
    { settings: { ...portableSettings, ...blockedSettings } },
    password,
    { appVersion: "0.1.0", domains: ["settings"] },
  );

  await page.addInitScript((blockedKeys) => {
    for (const key of blockedKeys) localStorage.removeItem(key);
  }, Object.keys(blockedSettings));
  await page.goto("/GYSApp-Tauri/lainnya");
  await page
    .locator('.more-setting-section[data-setting="backup"] > summary')
    .click();
  await page.getByRole("button", { name: /Backup & import/ }).click();
  const panel = page.getByRole("region", { name: "Backup dan import" });
  await panel.getByLabel("Kata sandi backup").fill(password);
  const chooserPromise = page.waitForEvent("filechooser");
  await panel.getByRole("button", { name: "Pilih file" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: "portable-policy.gysbk",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(envelope)),
  });
  await panel.getByRole("button", { name: "Impor" }).click();

  await expect
    .poll(() =>
      page.evaluate(
        ({ portableKeys, blockedKeys }) => ({
          portable: Object.fromEntries(
            portableKeys.map((key) => [key, localStorage.getItem(key)]),
          ),
          blocked: Object.fromEntries(
            blockedKeys.map((key) => [key, localStorage.getItem(key)]),
          ),
        }),
        {
          portableKeys: Object.keys(portableSettings),
          blockedKeys: Object.keys(blockedSettings),
        },
      ),
    )
    .toEqual({
      portable: portableSettings,
      blocked: Object.fromEntries(
        Object.keys(blockedSettings).map((key) => [key, null]),
      ),
    });
});

test("legacy backup imports portable settings without a password", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("gys-accent-color", "#556677");
    localStorage.setItem("gys-live-v1-token", "keep-current-token");
  });
  await page.goto("/GYSApp-Tauri/lainnya");
  await page
    .locator('.more-setting-section[data-setting="backup"] > summary')
    .click();
  await page.getByRole("button", { name: /Backup & import/ }).click();
  const panel = page.getByRole("region", { name: "Backup dan import" });
  const chooserPromise = page.waitForEvent("filechooser");
  await panel.getByRole("button", { name: "Pilih file" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: "legacy-settings.gysbk",
    mimeType: "application/octet-stream",
    buffer: await readFile(
      new URL("./fixtures/legacy-settings.gysbk", import.meta.url),
    ),
  });
  await panel.getByRole("button", { name: "Impor" }).click();

  await expect(
    page.getByText(/Backup lama diimpor/, { exact: false }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => ({
        accent: localStorage.getItem("gys-accent-color"),
        token: localStorage.getItem("gys-live-v1-token"),
        legacy: JSON.parse(
          localStorage.getItem("gys-legacy-import-v1") ?? "null",
        ),
      })),
    )
    .toMatchObject({
      accent: "#355c9a",
      token: "keep-current-token",
      legacy: {
        bible: { lastReading: "John 3" },
        songs: { favorites: ["001"] },
      },
    });
});

test("malformed backup import preserves existing local data", async ({
  page,
}) => {
  const existingSettings = {
    "gys-accent-color": "#556677",
    "gys-bible-notes-v1": JSON.stringify({
      "1:1:1": [{ id: "existing-note", text: "Catatan yang harus tetap ada." }],
    }),
    "gys-live-v1-token": "keep-existing-token",
  };
  await page.addInitScript((settings) => {
    for (const [key, value] of Object.entries(settings))
      localStorage.setItem(key, value);
  }, existingSettings);
  await page.goto("/GYSApp-Tauri/lainnya");
  await page
    .locator('.more-setting-section[data-setting="backup"] > summary')
    .click();
  await page.getByRole("button", { name: /Backup & import/ }).click();
  const panel = page.getByRole("region", { name: "Backup dan import" });
  await panel.getByLabel("Kata sandi backup").fill("malformed-import-123");
  const chooserPromise = page.waitForEvent("filechooser");
  await panel.getByRole("button", { name: "Pilih file" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: "broken.gysbk",
    mimeType: "application/json",
    buffer: Buffer.from("not-a-backup"),
  });
  await panel.getByRole("button", { name: "Impor" }).click();

  await expect(
    page.getByText("Backup tidak valid atau kata sandi salah.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        (keys) =>
          Object.fromEntries(
            keys.map((key) => [key, localStorage.getItem(key)]),
          ),
        Object.keys(existingSettings),
      ),
    )
    .toEqual(existingSettings);
});

test("disabling the daily reminder removes the persisted reminder immediately", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("gys-reminder-time-v1", "20:00");
  });
  await page.goto("/GYSApp-Tauri/lainnya");
  await page
    .locator('.more-setting-section[data-setting="hymns"] > summary')
    .click();
  await page.getByRole("button", { name: /Pengingat/ }).click();
  const panel = page.getByRole("region", { name: "Pengingat harian" });
  await expect(panel.getByLabel("Waktu")).toHaveValue("20:00");
  await panel.getByRole("button", { name: "Nonaktifkan" }).click();

  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("gys-reminder-time-v1")),
    )
    .toBeNull();
});
