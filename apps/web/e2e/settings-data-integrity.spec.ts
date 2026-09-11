import { readFile } from "node:fs/promises";
import { decryptBackupV2 } from "@gys/domain";
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
  await notes.getByRole("textbox").fill("Refleksi yang harus langsung terlihat");
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

test("encrypted backup includes faith notes promised by the backup UI", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("gys-faith-note-1", "Catatan iman yang dibackup");
  });
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

  expect(restored.settings?.["gys-faith-note-1"]).toBe(
    "Catatan iman yang dibackup",
  );
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
