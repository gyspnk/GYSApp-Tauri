import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("imports upstream playlist JSON and persists song reordering", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/GYSApp-Tauri/kidung?section=playlist");
  await expect(
    page.getByRole("heading", { name: "Playlist", exact: true }),
  ).toBeVisible();

  await page
    .locator(".kidung-tool-heading-actions input[type=file]")
    .setInputFiles({
      name: "upstream-playlist.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          name: "Upstream Set",
          songs: [
            {
              nomor: "001",
              judul: "Pujilah Allah Yang Maha Esa",
              fileHref: "docs/assets/001.mid",
            },
            {
              nomor: "002",
              judul: "Pujilah Allah Yang Mahakudus",
              fileHref: "docs/assets/002.mid",
            },
          ],
          exportedAt: "2026-09-24T00:00:00.000Z",
        }),
      ),
    });

  const saved = page.locator(".kidung-saved-playlist-row", {
    has: page.getByText("Upstream Set (Imported)", { exact: true }),
  });
  await expect(saved).toBeVisible();
  await saved.locator(".kidung-row-menu > summary").click();
  await saved.getByText(/Kelola isi/).click();

  const contents = saved.locator(".kidung-manage-saved-items > div");
  const rows = contents.locator(".kidung-saved-playlist-item");
  await expect(rows).toHaveCount(2);
  await rows
    .nth(0)
    .getByRole("button", { name: "Turunkan Pujilah Allah Yang Maha Esa" })
    .click();
  await expect(rows.nth(0).locator("span")).toContainText(
    "Pujilah Allah Yang Mahakudus",
  );

  await page.reload();
  const restored = page.locator(".kidung-saved-playlist-row", {
    has: page.getByText("Upstream Set (Imported)", { exact: true }),
  });
  await restored.locator(".kidung-row-menu > summary").click();
  await restored.getByText(/Kelola isi/).click();
  const restoredRows = restored.locator(
    ".kidung-manage-saved-items .kidung-saved-playlist-item",
  );
  await expect(restoredRows).toHaveCount(2);
  await expect(restoredRows.nth(0).locator("span")).toContainText(
    "Pujilah Allah Yang Mahakudus",
  );
  await restored.getByText(/Kelola isi/).click();
  await restored.locator(".kidung-row-menu > summary").click();

  await restored
    .getByRole("button", { name: /Upstream Set \(Imported\)/ })
    .click();
  const queueRows = page.locator(".kidung-playlist-list > li");
  await expect(queueRows).toHaveCount(2);
  await expect(queueRows.nth(0)).toContainText("Pujilah Allah Yang Mahakudus");
  await expect(queueRows.nth(1)).toContainText("Pujilah Allah Yang Maha Esa");

  await restored.locator(".kidung-row-menu > summary").click();
  page.once("dialog", (dialog) => dialog.accept("Edited Set"));
  await restored.getByRole("button", { name: "Ubah nama" }).click();
  const renamed = page.locator(".kidung-saved-playlist-row", {
    has: page.getByText("Edited Set", { exact: true }),
  });
  await expect(renamed).toBeVisible();
  await renamed.locator(".kidung-row-menu > summary").click();
  await renamed.getByText(/Kelola isi/).click();
  await renamed
    .getByRole("button", {
      name: "Hapus Pujilah Allah Yang Maha Esa dari playlist",
    })
    .click();
  await expect(
    renamed.locator(".kidung-manage-saved-items .kidung-saved-playlist-item"),
  ).toHaveCount(1);
  await renamed.getByText(/Kelola isi/).click();
  await renamed.getByRole("button", { name: "Hapus playlist" }).click();
  await expect(renamed).toHaveCount(0);
});

test("exports a saved playlist in the upstream song schema", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/GYSApp-Tauri/kidung");
  await page.locator(".add-to-playlist-btn").nth(0).click();
  await page.locator(".add-to-playlist-btn").nth(1).click();
  await page.goto("/GYSApp-Tauri/kidung?section=playlist");
  page.once("dialog", (dialog) => dialog.accept("Export Set"));
  await page.getByRole("button", { name: "Simpan sebagai playlist" }).click();

  const saved = page.locator(".kidung-saved-playlist-row", {
    has: page.getByText("Export Set", { exact: true }),
  });
  await saved.locator(".kidung-row-menu > summary").click();
  const downloadPromise = page.waitForEvent("download");
  const exportButton = saved.getByRole("button", {
    name: "Ekspor",
    exact: true,
  });
  const hitTarget = await exportButton.evaluate((button) => {
    const rect = button.getBoundingClientRect();
    const hit = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    );
    return {
      buttonContainsHit: !!hit && button.contains(hit),
      buttonZ: getComputedStyle(button).zIndex,
      rowZ: getComputedStyle(button.closest(".kidung-saved-playlist-row")!)
        .zIndex,
      panelZ: getComputedStyle(button.closest(".kidung-row-menu-panel")!)
        .zIndex,
      hitClass: (hit as HTMLElement | null)?.className?.toString(),
    };
  });
  expect(hitTarget, JSON.stringify(hitTarget)).toMatchObject({
    buttonContainsHit: true,
  });
  await exportButton.click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();
  const exported = JSON.parse(await readFile(path!, "utf8")) as {
    name: string;
    songs: Array<{ nomor: string; judul: string; fileHref: string }>;
  };
  expect(exported.name).toBe("Export Set");
  expect(exported.songs.map((song) => song.nomor)).toEqual(["001", "002"]);
  expect(exported.songs[0]).toMatchObject({
    judul: "Pujilah Allah Yang Maha Esa",
    fileHref: expect.stringMatching(/\.mid$/),
  });
});

test("restores the saved playlist and active selection after localStorage eviction", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/GYSApp-Tauri/kidung");
  await page.locator(".add-to-playlist-btn").nth(0).click();
  await page.goto("/GYSApp-Tauri/kidung?section=playlist");
  page.once("dialog", (dialog) => dialog.accept("Restore Set"));
  await page.getByRole("button", { name: "Simpan sebagai playlist" }).click();

  const saved = page.locator(".kidung-saved-playlist-row", {
    has: page.getByText("Restore Set", { exact: true }),
  });
  await expect(saved).toBeVisible();
  const savedId = await page.evaluate(() => {
    const playlists = JSON.parse(
      localStorage.getItem("gys-kidung-playlists-v1") ?? "[]",
    ) as Array<{ id: string; name: string }>;
    return playlists.find((playlist) => playlist.name === "Restore Set")?.id;
  });
  if (!savedId) throw new Error("Saved playlist was not created");
  await expect
    .poll(() =>
      page.evaluate(
        (playlistId) =>
          new Promise<boolean>((resolve) => {
            const open = indexedDB.open("gys-playlist-backup", 1);
            open.onerror = () => resolve(false);
            open.onsuccess = () => {
              const db = open.result;
              if (!db.objectStoreNames.contains("kv")) {
                db.close();
                resolve(false);
                return;
              }
              const read = db
                .transaction("kv", "readonly")
                .objectStore("kv")
                .get("saved-playlists");
              read.onsuccess = () => {
                db.close();
                resolve(
                  read.result?.playlists?.some(
                    (playlist: { id: string }) => playlist.id === playlistId,
                  ) ?? false,
                );
              };
              read.onerror = () => {
                db.close();
                resolve(false);
              };
            };
          }),
        savedId,
      ),
    )
    .toBe(true);

  await page.evaluate(() => {
    localStorage.removeItem("gys-kidung-playlists-v1");
    localStorage.removeItem("gys-kidung-active-playlist");
  });
  await page.reload();
  const restored = page.locator(".kidung-saved-playlist-row", {
    has: page.getByText("Restore Set", { exact: true }),
  });
  await expect(restored).toBeVisible();
  await expect(restored.locator("small")).toContainText("Aktif");
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("gys-kidung-active-playlist")),
    )
    .toBe(savedId);
});
