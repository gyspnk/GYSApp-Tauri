import { readFile } from "node:fs/promises";
import { decryptBackupV2, encryptBackupV2 } from "@gys/domain";
import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test("faith note list updates immediately after saving without a reload", async ({
  page,
}) => {
  await page.goto("/GYSApp-Tauri/iman");
  const summaryButton = page.getByRole("button", {
    name: "Buka ringkasan dan catatan pokok iman 1",
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
  await page.getByRole("button", { name: /Backup & import/ }).click();
  const panel = page.getByRole("region", { name: "Backup dan import" });
  await panel.getByLabel("Kata sandi backup").fill(password);
  await panel.locator('input[type="file"]').setInputFiles({
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

test("disabling the daily reminder removes the persisted reminder immediately", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("gys-reminder-time-v1", "20:00");
  });
  await page.goto("/GYSApp-Tauri/lainnya");
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
