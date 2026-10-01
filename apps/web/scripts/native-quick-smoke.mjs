import assert from "node:assert/strict";
import { resolve } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { launchNative, nativeRoute } from "./native-session.mjs";

const suites = ["startup", "storage", "media", "assets"];
const shorthand = suites.includes(process.argv[2]);
const executable = resolve(
  shorthand
    ? "../native/src-tauri/target/release/gysapp-native.exe"
    : (process.argv[2] ??
        "../native/src-tauri/target/release/gysapp-native.exe"),
);
const suite = shorthand ? process.argv[2] : (process.argv[3] ?? "all");
assert.ok(
  suite === "all" || suites.includes(suite),
  "Suite must be startup/storage/media/assets/all",
);
const profile = await mkdtemp(resolve(tmpdir(), "gysapp-quick-"));
let session;
const results = {};
try {
  session = await launchNative(executable, profile);
  const { page, context } = session;
  const origin = await page.evaluate(() => location.origin);
  await context.route(/^https?:\/\//, (route) =>
    new URL(route.request().url()).origin === origin
      ? route.continue()
      : route.abort(),
  );
  for (const selected of suite === "all" ? suites : [suite]) {
    const started = Date.now();
    if (selected === "startup") {
      await page.goto(nativeRoute("/", origin));
      await page
        .locator(".home-grid")
        .waitFor({ state: "visible", timeout: 15000 });
      await page.goto(nativeRoute("/bible", origin));
      await page
        .locator(".verse-row")
        .first()
        .waitFor({ state: "visible", timeout: 15000 });
      assert.ok(await page.locator(".verse-text").first().textContent());
    } else if (selected === "storage") {
      results.storageProfile = await page.evaluate(async () => {
        const invoke = window.__TAURI_INTERNALS__?.invoke;
        if (!invoke) throw new Error("Tauri invoke unavailable");
        const key = `quick-profile-${Date.now()}`;
        const timings = { database: [], blob: [] };
        const bytes = btoa("x".repeat(1024 * 1024));
        try {
          for (let run = 0; run < 30; run++) {
            const start = performance.now();
            await invoke("database_set", {
              key,
              value: JSON.stringify({ run }),
            });
            if (
              (await invoke("database_get", { key })) !==
              JSON.stringify({ run })
            )
              throw new Error("Database roundtrip mismatch");
            timings.database.push(performance.now() - start);
          }
          for (let run = 0; run < 30; run++) {
            const start = performance.now();
            await invoke("blob_put_atomic", { key, bytes });
            if ((await invoke("blob_get", { key })) !== bytes)
              throw new Error("Blob roundtrip mismatch");
            timings.blob.push(performance.now() - start);
          }
          let rejected = false;
          try {
            await invoke("blob_put_atomic", {
              key,
              bytes: "not valid base64!",
            });
          } catch {
            rejected = true;
          }
          if (!rejected || (await invoke("blob_get", { key })) !== bytes)
            throw new Error("Invalid write replaced atomic blob");
          return {
            ...timings,
            blobBytes: 1024 * 1024,
            includes: "IPC, encoding, SQLite open/schema and atomic write",
            boundaryChanged: false,
          };
        } finally {
          await invoke("database_remove", { key });
          await invoke("blob_remove", { key });
        }
      });
    } else if (selected === "assets") {
      results.assets = await page.evaluate(async () => {
        const assetUrl = (path) => new URL(`/${path}`, location.origin).href;
        const readJson = async (path) => {
          const response = await fetch(assetUrl(path));
          if (
            !response.ok ||
            !response.headers.get("content-type")?.includes("json")
          )
            throw new Error(
              `Invalid packaged JSON response: ${path} (${response.status})`,
            );
          return response.json();
        };
        const pack = await readJson("offline/pack-manifest.json");
        const metadata = await readJson("offline/hymn-metadata.json");
        const bible = await readJson("offline/bible/tb-reader.json");
        if (metadata.items.length !== 533 || bible.books.length !== 66)
          throw new Error("Packaged core count mismatch");
        for (const item of pack.items) {
          const response = await fetch(assetUrl(item.path));
          if (!response.ok) throw new Error(`Missing ${item.path}`);
          const bytes = await response.arrayBuffer();
          const digest = [
            ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
          ]
            .map((value) => value.toString(16).padStart(2, "0"))
            .join("");
          if (bytes.byteLength !== item.bytes || digest !== item.sha256)
            throw new Error(`Packaged integrity mismatch: ${item.path}`);
        }
        const shell = await readJson("offline-shell-assets.json");
        const fonts = shell.assets.filter((path) => path.endsWith(".woff2"));
        if (fonts.length !== 4) throw new Error("Packaged font count mismatch");
        for (const path of fonts) {
          const response = await fetch(assetUrl(path));
          const bytes = await response.arrayBuffer();
          const hash = new Uint8Array(
            await crypto.subtle.digest("SHA-256", bytes),
          );
          const digest = `sha256-${btoa(String.fromCharCode(...hash))}`;
          if (!response.ok || digest !== shell.integrity[path])
            throw new Error(`Packaged font integrity mismatch: ${path}`);
        }
        for (const [font, text] of [
          ['16px "GYS Reading Sans"', "Bacaan"],
          ['16px "Source Serif 4"', "Nyanyian"],
          ['italic 16px "Source Serif 4"', "Nyanyian"],
          ['16px "Noto Serif SC"', "阅读与诗歌"],
        ]) {
          const faces = await document.fonts.load(font, text);
          if (!faces.length || faces.some((face) => face.status !== "loaded"))
            throw new Error(`Packaged font unavailable: ${font}`);
        }
        return {
          verifiedFonts: fonts.length,
          loadedFontFaces: 4,
          hymns: metadata.items.length,
          bibleBooks: bible.books.length,
          verifiedFiles: pack.items.length,
        };
      });
    } else {
      await page.goto(nativeRoute("/kidung", origin));
      await page
        .locator(".pujian-item")
        .first()
        .waitFor({ state: "visible", timeout: 15000 });
      const queue = page.locator(".add-to-playlist-btn").first();
      assert.ok(await queue.getAttribute("aria-label"));
      await page.goto(nativeRoute("/kidung/hymn-001", origin));
      await page
        .locator(".lyrics-sheet")
        .waitFor({ state: "visible", timeout: 15000 });
      results.mediaScope =
        "catalog queue accessibility and reader controls; mutation/synthesis/playback belong to native-soak";
    }
    results[selected] = {
      ...results[selected],
      status: "passed",
      elapsedMs: Date.now() - started,
    };
  }
  console.log(
    JSON.stringify({
      runtime: "packaged Tauri/WebView2",
      profile: session.profileMode,
      suites: results,
    }),
  );
} finally {
  await session?.close();
  await rm(profile, { recursive: true, force: true }).catch(() => undefined);
}
