import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "@playwright/test";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const executable = resolve(
  process.argv[2] ??
    resolve(repoRoot, "apps/native/src-tauri/target/release/gysapp-native.exe"),
);
const bffBaseUrl = process.env.VITE_BFF_BASE_URL?.trim().replace(/\/$/, "");

assert.equal(process.platform, "win32", "Native asset smoke requires Windows");
assert.ok(existsSync(executable), `Missing Tauri executable: ${executable}`);
assert.ok(bffBaseUrl, "Build the app with VITE_BFF_BASE_URL configured");

async function allocatePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  await new Promise((resolveClose, reject) =>
    server.close((error) => (error ? reject(error) : resolveClose())),
  );
  return address.port;
}

async function waitForDevTools(app, port) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (app.exitCode !== null)
      throw new Error(`Tauri exited before WebView2 started (${app.exitCode})`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return await response.json();
    } catch {
      // WebView2 exposes its DevTools endpoint after the window is created.
    }
    await delay(250);
  }
  throw new Error("Timed out waiting for the WebView2 DevTools endpoint");
}

async function closeAppTree(app, force = false) {
  if (!app || app.exitCode !== null || !app.pid) return app?.exitCode !== null;
  await new Promise((resolveClose) => {
    const killer = spawn(
      force ? "taskkill.exe" : "powershell.exe",
      force
        ? ["/PID", String(app.pid), "/T", "/F"]
        : [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            `$process = [System.Diagnostics.Process]::GetProcessById(${app.pid}); if (-not $process.CloseMainWindow()) { exit 1 }`,
          ],
      { stdio: "ignore", windowsHide: true },
    );
    killer.once("error", resolveClose);
    killer.once("exit", resolveClose);
  });
  if (!force) {
    const deadline = Date.now() + 10_000;
    while (app.exitCode === null && Date.now() < deadline) await delay(100);
  }
  return app.exitCode !== null;
}

const profile = await mkdtemp(resolve(tmpdir(), "gysapp-assets-native-"));
let app;
let browser;
let context;
let page;
let origin;
const packageRequests = new Map();
const metadataRequests = new Map();
const additionalAssets = [
  ["b_cuv", "Chinese Union Version"],
  ["MDR", "Mandarin"],
  ["ASM-I", "Aku Senang Menyanyi I"],
  ["ASM-M", "Aku Senang Menyanyi M"],
  ["ASM-P", "Aku Senang Menyanyi P"],
  ["GeneralUser-GS", "GeneralUser-GS SoundFont"],
];
const updateTargets = [
  ["b_kjv", "King James Version"],
  ["b_cuv", "Chinese Union Version"],
  ["MDR", "Mandarin"],
  ["ASM-I", "Aku Senang Menyanyi I"],
  ["ASM-M", "Aku Senang Menyanyi M"],
  ["ASM-P", "Aku Senang Menyanyi P"],
  ["GeneralUser-GS", "GeneralUser-GS SoundFont"],
];
const additionalRecords = new Map();

async function startApp() {
  const port = await allocatePort();
  app = spawn(executable, [], {
    stdio: "ignore",
    env: {
      ...process.env,
      WEBVIEW2_USER_DATA_FOLDER: profile,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-allow-origins=*`,
    },
  });
  const devTools = await waitForDevTools(app, port);
  browser = await chromium.connectOverCDP(devTools.webSocketDebuggerUrl, {
    timeout: 30_000,
  });
  context = browser.contexts()[0];
  assert.ok(context, "Tauri did not expose a WebView2 context");
  context.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== bffBaseUrl) return;
    const match = url.pathname.match(
      /^\/api\/v1\/assets\/distributed\/([^/]+)(\/index)?$/,
    );
    if (!match) return;
    const counts = match[2] ? metadataRequests : packageRequests;
    const code = decodeURIComponent(match[1]);
    counts.set(code, (counts.get(code) ?? 0) + 1);
  });
  page = context.pages()[0] ?? (await context.newPage());
  await page.waitForFunction(() => location.href !== "about:blank", null, {
    timeout: 15_000,
  });
  await page.locator(".home-grid").waitFor({ state: "visible" });
  origin = await page.evaluate(() => location.origin);
}

async function readInstalledRecord(code) {
  return page.evaluate(
    (assetCode) =>
      JSON.parse(localStorage.getItem("gys-distributed-assets-v1") ?? "{}")[
        assetCode
      ],
    code,
  );
}

async function assertBibleSplitState(
  primaryVerse = /In the beginning God created/,
) {
  const panes = page.locator(".bible-reader.is-split .bible-pane");
  await panes.nth(1).locator(".verse-row").first().waitFor({
    state: "visible",
    timeout: 30_000,
  });
  assert.equal(await panes.count(), 2);
  assert.match(
    await panes.nth(0).locator(".verse-text").first().innerText(),
    primaryVerse,
  );
  assert.match(
    await panes.nth(1).locator(".verse-text").first().innerText(),
    /Pada mulanya Allah menciptakan/,
  );
  assert.equal(
    await page.evaluate(() => localStorage.getItem("gys-bible-split-v1")),
    "1",
  );
  assert.equal(
    await page.evaluate(() =>
      localStorage.getItem("gys-bible-split-sync-scroll-v1"),
    ),
    "1",
  );
  assert.equal(
    await page
      .getByRole("separator", { name: "Atur lebar kolom bacaan" })
      .getAttribute("aria-valuenow"),
    "52",
  );
}

async function installAdditionalAsset(code, title) {
  const row = page.locator(".distributed-asset-row", { hasText: title });
  await page.getByRole("button", { name: `Unduh ${title}` }).click();
  await row.getByText(/Tersimpan · v/).waitFor({
    state: "visible",
    timeout: 90_000,
  });
  const record = await readInstalledRecord(code);
  assert.equal(record?.code, code);
  assert.ok(record?.payloadBytes > 0);
  assert.ok(record?.payloadChecksumSha256);
  if (code !== "b_cuv" && code !== "GeneralUser-GS") {
    assert.ok(record?.metadataBytes > 0);
    assert.ok(record?.metadataChecksumSha256);
  }
  additionalRecords.set(code, record);
}

async function retryInterruptedAsset(code, title) {
  const endpoint = `${bffBaseUrl}/api/v1/assets/distributed/${encodeURIComponent(code)}`;
  let interrupted = false;
  await context.route(endpoint, async (route) => {
    if (!interrupted) {
      interrupted = true;
      await route.abort("failed");
      return;
    }
    await route.continue();
  });
  await page.getByRole("button", { name: `Unduh ${title}` }).click();
  const error = page.getByRole("alert");
  await error.waitFor({ state: "visible" });
  assert.ok((await error.innerText()).trim());
  assert.equal(
    await readInstalledRecord(code),
    undefined,
    `${code} persisted a package after its request was interrupted`,
  );
  await installAdditionalAsset(code, title);
  await context.unroute(endpoint);
}

async function updateStaleAsset(code, title) {
  const row = page.locator(".distributed-asset-row", { hasText: title });
  await row.getByText(/Pembaruan tersedia/).waitFor({ state: "visible" });
  const previous = await readInstalledRecord(code);
  assert.equal(previous?.version, "2026.05.20");
  const updateButton = page.getByRole("button", { name: `Perbarui ${title}` });
  if (code === "b_kjv") {
    const endpoint = `${bffBaseUrl}/api/v1/assets/distributed/${code}`;
    let interrupted = false;
    await context.route(endpoint, async (route) => {
      if (!interrupted) {
        interrupted = true;
        await route.abort("failed");
        return;
      }
      await route.continue();
    });
    await updateButton.click();
    const error = page.getByRole("alert");
    await error.waitFor({ state: "visible" });
    const retained = await readInstalledRecord(code);
    assert.equal(retained?.version, previous.version);
    assert.equal(retained?.cacheName, previous.cacheName);
    assert.equal(
      retained?.payloadChecksumSha256,
      previous.payloadChecksumSha256,
    );
    await row.getByText(/Pembaruan tersedia/).waitFor({ state: "visible" });
    await updateButton.click();
    await context.unroute(endpoint);
  } else {
    await updateButton.click();
  }
  await row.getByText(/Tersimpan · v/).waitFor({
    state: "visible",
    timeout: 180_000,
  });
  const current = await readInstalledRecord(code);
  assert.ok(current?.version);
  assert.notEqual(current.version, previous.version);
  assert.notEqual(current.cacheName, previous.cacheName);
  if (additionalRecords.has(code)) additionalRecords.set(code, current);
}

async function selectHymnCollection(collection) {
  await page.locator(".kidung-desktop-filter .control-select-trigger").click();
  await page.getByRole("option", { name: collection, exact: true }).click();
}

async function readOfflineHymnPdf(code, collection) {
  await page.goto(new URL("/kidung", origin).href);
  await page
    .locator(".kidung-desktop-filter .control-select-trigger")
    .waitFor({ state: "visible" });
  await selectHymnCollection(collection);
  const prefix = code.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const hymn = page.locator(`.pujian-item[data-id^="${prefix}-"]`).first();
  await hymn.waitFor({ state: "visible", timeout: 20_000 });
  const songId = await hymn.getAttribute("data-id");
  assert.ok(songId?.startsWith(`${prefix}-`), `No song found for ${code}`);
  await hymn.locator(".pujian-title").click();
  const renderedPdf = page
    .locator('.pdf-reader-hymn canvas[data-pdf-rendered="true"]')
    .first();
  const detailPage = page.locator(".hymn-detail-page");
  await detailPage.waitFor({ state: "visible", timeout: 20_000 });
  const isPdfMode = await detailPage.evaluate((element) =>
    element.classList.contains("is-pdf-viewer"),
  );
  if (!isPdfMode) {
    const pdfTab = page.getByRole("tab", { name: "PDF", exact: true });
    await pdfTab.waitFor({ state: "visible" });
    await pdfTab.click();
  }
  await renderedPdf.waitFor({ state: "visible", timeout: 45_000 });
  return songId;
}

try {
  await startApp();
  await page.setViewportSize({ width: 1200, height: 800 });
  const packageEndpoint = `${bffBaseUrl}/api/v1/assets/distributed/HYMNE`;
  let failFirstPackageRequest = true;
  await context.route(packageEndpoint, async (route) => {
    if (failFirstPackageRequest) {
      failFirstPackageRequest = false;
      await route.fulfill({
        status: 503,
        json: { error: "temporary upstream failure" },
        headers: { "access-control-allow-origin": origin },
      });
      return;
    }
    await route.continue();
  });

  await page.goto(new URL("/lainnya?section=data", origin).href);
  let row = page.locator(".distributed-asset-row", {
    hasText: "Hymne (English Version)",
  });
  const download = page.getByRole("button", {
    name: "Unduh Hymne (English Version)",
  });
  await download.waitFor({ state: "visible" });
  await download.click();
  const error = page.getByRole("alert");
  await error.waitFor({ state: "visible" });
  assert.match(await error.innerText(), /503/);
  await page
    .getByRole("button", { name: "Unduh Hymne (English Version)" })
    .click();
  await row
    .getByText(/Tersimpan · v/)
    .waitFor({ state: "visible", timeout: 90_000 });
  assert.equal(
    packageRequests.get("HYMNE"),
    2,
    "Retry did not issue one new package request",
  );
  assert.equal(
    metadataRequests.get("HYMNE"),
    1,
    "Retry did not load the pinned hymn index",
  );

  await page.goto(new URL("/kidung", origin).href);
  await page.locator(".kidung-desktop-filter .control-select-trigger").click();
  await page.getByRole("option", { name: "English", exact: true }).click();
  await page.locator('.pujian-item[data-id="hymne-001"]').waitFor({
    state: "visible",
  });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true);
  await page.reload();
  await page.locator(".kidung-desktop-filter .control-select-trigger").click();
  await page.getByRole("option", { name: "English", exact: true }).click();
  await page.locator('.pujian-item[data-id="hymne-001"]').waitFor({
    state: "visible",
  });
  await page.locator('.pujian-item[data-id="hymne-001"] .pujian-title').click();
  await page.getByRole("tab", { name: "PDF" }).waitFor({
    state: "visible",
    timeout: 20_000,
  });
  await page.getByRole("tab", { name: "PDF" }).click();
  await page
    .locator('.pdf-reader-hymn canvas[data-pdf-rendered="true"]')
    .first()
    .waitFor({ state: "visible", timeout: 45_000 });

  const installedRecord = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("gys-distributed-assets-v1") ?? "{}")
        .HYMNE,
  );
  assert.equal(installedRecord?.code, "HYMNE");

  await context.setOffline(false);
  await page.goto(new URL("/lainnya?section=data", origin).href);
  let failFirstBiblePackageRequest = true;
  const biblePackageEndpoint = `${bffBaseUrl}/api/v1/assets/distributed/b_kjv`;
  await context.route(biblePackageEndpoint, async (route) => {
    if (failFirstBiblePackageRequest) {
      failFirstBiblePackageRequest = false;
      await route.fulfill({
        status: 200,
        body: "truncated package",
        headers: {
          "access-control-allow-origin": origin,
          "content-type": "application/octet-stream",
        },
      });
      return;
    }
    await route.continue();
  });
  const bibleRow = page.locator(".distributed-asset-row", {
    hasText: "King James Version",
  });
  const bibleDownload = page.getByRole("button", {
    name: "Unduh King James Version",
  });
  await bibleDownload.waitFor({ state: "visible" });
  await bibleDownload.click();
  const partialError = page.getByRole("alert");
  await partialError.waitFor({ state: "visible" });
  assert.match(await partialError.innerText(), /size mismatch/i);
  assert.equal(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("gys-distributed-assets-v1") ?? "{}")
          .b_kjv,
    ),
    undefined,
    "The incomplete Bible package was persisted",
  );
  await bibleDownload.click();
  await bibleRow.getByText(/Tersimpan · v/).waitFor({
    state: "visible",
    timeout: 90_000,
  });
  assert.equal(
    packageRequests.get("b_kjv"),
    2,
    "Bible retry did not fetch a full package",
  );

  let bibleRecord = await readInstalledRecord("b_kjv");
  assert.equal(bibleRecord?.code, "b_kjv");
  await page.goto(new URL("/lainnya?section=data", origin).href);
  for (const [code, title] of additionalAssets) {
    if (["b_cuv", "MDR", "GeneralUser-GS"].includes(code)) {
      await retryInterruptedAsset(code, title);
    } else {
      await installAdditionalAsset(code, title);
    }
  }

  await page.evaluate(
    (codes) => {
      const key = "gys-distributed-assets-v1";
      const records = JSON.parse(localStorage.getItem(key) ?? "{}");
      for (const code of codes) {
        if (!records[code])
          throw new Error(`Missing installed record: ${code}`);
        records[code].version = "2026.05.20";
      }
      localStorage.setItem(key, JSON.stringify(records));
    },
    updateTargets.map(([code]) => code),
  );
  await page.reload();
  for (const [code, title] of updateTargets) {
    await updateStaleAsset(code, title);
  }
  bibleRecord = await readInstalledRecord("b_kjv");

  await page.goto(new URL("/bible", origin).href);
  await page.getByRole("button", { name: "Versi", exact: true }).click();
  await page
    .getByRole("option", { name: "Chinese Union Version", exact: true })
    .click();
  const cuvVerse = page.locator(".verse-row .verse-text").first();
  await page.waitForFunction(
    () =>
      /[\u3400-\u9fff]/.test(
        document.querySelector(".verse-row .verse-text")?.textContent ?? "",
      ),
    null,
    { timeout: 30_000 },
  );
  assert.match(await cuvVerse.innerText(), /[\u3400-\u9fff]/);
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(
    () =>
      /[\u3400-\u9fff]/.test(
        document.querySelector(".verse-row .verse-text")?.textContent ?? "",
      ),
    null,
    { timeout: 30_000 },
  );
  assert.match(await cuvVerse.innerText(), /[\u3400-\u9fff]/);
  await context.setOffline(false);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true);
  for (const [code, , collection] of [
    ["MDR", "Mandarin", "Mandarin"],
    ["ASM-I", "Aku Senang Menyanyi I", "Anak"],
    ["ASM-M", "Aku Senang Menyanyi M", "Anak"],
    ["ASM-P", "Aku Senang Menyanyi P", "Anak"],
  ]) {
    await readOfflineHymnPdf(code, collection);
  }
  await context.setOffline(false);
  await page.goto(new URL("/lainnya?section=data", origin).href);

  const soundfontRecord = await readInstalledRecord("GeneralUser-GS");
  assert.equal(soundfontRecord?.code, "GeneralUser-GS");
  assert.ok(soundfontRecord?.payloadBytes > 1_000_000);
  assert.equal(
    soundfontRecord?.payloadChecksumSha256,
    soundfontRecord?.packageChecksumSha256,
  );

  await page.goto(new URL("/kidung/hymn-001", origin).href);
  await page
    .getByRole("button", { name: "Putar MIDI", exact: true })
    .waitFor({ state: "visible", timeout: 20_000 });
  await page.getByRole("button", { name: "Putar MIDI", exact: true }).click();
  const midiSurface = page.locator(".media-surface.is-kidung-media");
  await midiSurface.waitFor({ state: "visible", timeout: 20_000 });
  const midiPrimary = midiSurface.locator(".media-primary-control");
  await midiPrimary.click();
  await page.waitForFunction(
    () =>
      document
        .querySelector(".media-surface.is-kidung-media")
        ?.getAttribute("data-backend") === "fluidsynth" &&
      document
        .querySelector(".media-surface.is-kidung-media .media-primary-control")
        ?.getAttribute("aria-label") === "Jeda",
    null,
    { timeout: 60_000 },
  );
  const midiPosition = midiSurface.getByLabel("Posisi MIDI");
  const startPosition = Number(await midiPosition.inputValue());
  await page.waitForFunction(
    (position) =>
      Number(
        document.querySelector(
          '.media-surface.is-kidung-media input[aria-label="Posisi MIDI"]',
        )?.value,
      ) >
      position + 0.1,
    startPosition,
    { timeout: 15_000 },
  );
  await midiSurface.locator(".media-stop-control").click();
  await page.waitForFunction(
    () =>
      document
        .querySelector(".media-surface.is-kidung-media .media-primary-control")
        ?.getAttribute("aria-label") === "Putar",
    null,
    { timeout: 10_000 },
  );

  await page.goto(new URL("/bible", origin).href);
  await page.getByRole("button", { name: "Menu Alkitab" }).click();
  await page.getByText("Tampilan Belah", { exact: true }).click();
  await page.getByRole("button", { name: "Tutup menu" }).click();
  const splitDivider = page.getByRole("separator", {
    name: "Atur lebar kolom bacaan",
  });
  await splitDivider.press("ArrowRight");
  await page.waitForFunction(
    () =>
      document
        .querySelector(
          '[role="separator"][aria-label="Atur lebar kolom bacaan"]',
        )
        ?.getAttribute("aria-valuenow") === "52",
    null,
    { timeout: 10_000 },
  );
  await assertBibleSplitState(/[\u3400-\u9fff]/u);
  await page.waitForFunction(
    async () => {
      const shellCaches = (await caches.keys()).filter((name) =>
        name.startsWith("gysapp-shell-"),
      );
      const urls = (
        await Promise.all(
          shellCaches.map(async (name) =>
            (await (await caches.open(name)).keys()).map(
              (request) => request.url,
            ),
          ),
        )
      ).flat();
      return (
        urls.some((url) => /bible-sql-runtime-/u.test(url)) &&
        urls.some((url) => /sql-wasm-/u.test(url))
      );
    },
    null,
    { timeout: 30_000 },
  );
  await page.evaluate(() => {
    localStorage.setItem("gys-bible-version-v1", "b_kjv");
    localStorage.setItem("gys-bible-secondary-version", "b_tb");
  });

  await browser.close();
  browser = undefined;
  assert.equal(
    await closeAppTree(app),
    true,
    "Tauri did not exit after Windows requested a graceful close",
  );

  await startApp();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true);
  row = page.locator(".distributed-asset-row", {
    hasText: "Hymne (English Version)",
  });
  await page.goto(new URL("/kidung", origin).href);
  await page.locator(".kidung-desktop-filter .control-select-trigger").click();
  await page.getByRole("option", { name: "English", exact: true }).click();
  await page.locator('.pujian-item[data-id="hymne-001"]').waitFor({
    state: "visible",
  });
  const restoredRecord = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("gys-distributed-assets-v1") ?? "{}")
        .HYMNE,
  );
  assert.equal(restoredRecord?.cacheName, installedRecord.cacheName);
  await page.locator('.pujian-item[data-id="hymne-001"] .pujian-title').click();
  await page
    .locator('.pdf-reader-hymn canvas[data-pdf-rendered="true"]')
    .first()
    .waitFor({ state: "visible", timeout: 45_000 });

  const restoredBibleRecord = await readInstalledRecord("b_kjv");
  assert.equal(restoredBibleRecord?.cacheName, bibleRecord.cacheName);
  await page.goto(new URL("/bible", origin).href);
  await assertBibleSplitState();
  const restoredKjvVerse = page.locator(".verse-row .verse-text").first();
  await restoredKjvVerse.waitFor({ state: "visible", timeout: 30_000 });
  assert.match(
    await restoredKjvVerse.innerText(),
    /In the beginning God created/,
  );

  for (const [code, record] of additionalRecords) {
    const restoredRecord = await readInstalledRecord(code);
    assert.equal(restoredRecord?.cacheName, record.cacheName);
  }
  await page.getByRole("button", { name: "Versi 1", exact: true }).click();
  await page
    .getByRole("option", { name: "Chinese Union Version", exact: true })
    .click();
  const restoredCuvVerse = page.locator(".verse-row .verse-text").first();
  await page.waitForFunction(
    () =>
      /[\u3400-\u9fff]/.test(
        document.querySelector(".verse-row .verse-text")?.textContent ?? "",
      ),
    null,
    { timeout: 30_000 },
  );
  assert.match(await restoredCuvVerse.innerText(), /[\u3400-\u9fff]/);
  await page.getByRole("button", { name: "Versi 1", exact: true }).click();
  await page.getByRole("option", { name: "King James Version" }).click();
  await page.waitForFunction(
    () =>
      /In the beginning God created/.test(
        document.querySelector(".verse-row .verse-text")?.textContent ?? "",
      ),
    null,
    { timeout: 30_000 },
  );

  for (const [code, , collection] of [
    ["MDR", "Mandarin", "Mandarin"],
    ["ASM-I", "Aku Senang Menyanyi I", "Anak"],
    ["ASM-M", "Aku Senang Menyanyi M", "Anak"],
    ["ASM-P", "Aku Senang Menyanyi P", "Anak"],
  ]) {
    await readOfflineHymnPdf(code, collection);
  }

  const restoredSoundfontRecord = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("gys-distributed-assets-v1") ?? "{}")[
        "GeneralUser-GS"
      ],
  );
  assert.equal(restoredSoundfontRecord?.cacheName, soundfontRecord.cacheName);
  await page.goto(new URL("/kidung/hymn-001", origin).href);
  await page
    .getByRole("button", { name: "Putar MIDI", exact: true })
    .waitFor({ state: "visible", timeout: 20_000 });
  await page.getByRole("button", { name: "Putar MIDI", exact: true }).click();
  const restoredMidiSurface = page.locator(".media-surface.is-kidung-media");
  await restoredMidiSurface.waitFor({ state: "visible", timeout: 20_000 });
  await restoredMidiSurface.locator(".media-primary-control").click();
  await page.waitForFunction(
    () =>
      document
        .querySelector(".media-surface.is-kidung-media")
        ?.getAttribute("data-backend") === "fluidsynth" &&
      document
        .querySelector(".media-surface.is-kidung-media .media-primary-control")
        ?.getAttribute("aria-label") === "Jeda",
    null,
    { timeout: 60_000 },
  );
  await restoredMidiSurface.locator(".media-stop-control").click();

  await context.setOffline(false);
  await page.goto(new URL("/lainnya?section=data", origin).href);
  page.once("dialog", (dialog) => dialog.accept());
  await row.getByRole("button", { name: "Hapus", exact: true }).click();
  await row.getByText(/Belum diunduh/).waitFor({ state: "visible" });
  await page
    .getByRole("button", { name: "Unduh Hymne (English Version)" })
    .click();
  await row
    .getByText(/Tersimpan · v/)
    .waitFor({ state: "visible", timeout: 90_000 });
  assert.equal(
    packageRequests.get("HYMNE"),
    3,
    "Reinstall did not fetch the package again",
  );
  assert.equal(
    metadataRequests.get("HYMNE"),
    2,
    "Reinstall did not fetch the pinned index again",
  );
  for (const [code, title] of updateTargets) {
    const assetRow = page.locator(".distributed-asset-row", {
      hasText: title,
    });
    page.once("dialog", (dialog) => dialog.accept());
    await assetRow.getByRole("button", { name: "Hapus", exact: true }).click();
    await assetRow.getByText(/Belum diunduh/).waitFor({ state: "visible" });
    await page.getByRole("button", { name: `Unduh ${title}` }).click();
    await assetRow.getByText(/Tersimpan · v/).waitFor({
      state: "visible",
      timeout: 180_000,
    });
    assert.equal((await readInstalledRecord(code))?.code, code);
  }
  for (const [code] of additionalAssets) {
    const expectedPackageRequests =
      (["b_cuv", "MDR", "GeneralUser-GS"].includes(code) ? 3 : 2) + 1;
    assert.equal(
      packageRequests.get(code),
      expectedPackageRequests,
      `${code} package was not fetched`,
    );
    if (code !== "b_cuv" && code !== "GeneralUser-GS") {
      assert.equal(
        metadataRequests.get(code),
        3,
        `${code} hymn index was not fetched`,
      );
    }
  }
  assert.equal(packageRequests.get("b_kjv"), 5);

  await page.goto(new URL("/kidung", origin).href);
  await page.locator(".kidung-desktop-filter .control-select-trigger").click();
  await page.getByRole("option", { name: "English", exact: true }).click();
  await page.locator('.pujian-item[data-id="hymne-001"]').waitFor({
    state: "visible",
  });
  await context.setOffline(true);
  await page.reload();
  await page.locator(".kidung-desktop-filter .control-select-trigger").click();
  await page.getByRole("option", { name: "English", exact: true }).click();
  await page.locator('.pujian-item[data-id="hymne-001"]').waitFor({
    state: "visible",
  });

  await page.locator('.pujian-item[data-id="hymne-001"] .pujian-title').click();
  await page
    .locator('.pdf-reader-hymn canvas[data-pdf-rendered="true"]')
    .first()
    .waitFor({ state: "visible", timeout: 45_000 });

  console.log(
    JSON.stringify({
      runtime: "packaged Tauri WebView2",
      assets:
        "all eight optional Bible, hymnal, and SoundFont release packages via local BFF",
      transientFailureRetry: "passed",
      interruptedBiblePackageRetry: "passed",
      interruptedTransferRecovery: "Bible, hymnal, and SoundFont passed",
      offlineKjvAndCuvRead: "passed",
      offlineAllHymnalPdfs: "passed",
      offlineBibleRead: "passed",
      offlineHymnePdfRead: "passed",
      offlineSoundfontPlayback: "passed",
      offlineRead: "passed",
      offlineRestartRead: "passed",
      offlineSplitRestartRead:
        "KJV and TB panes, sync preference, and 52% divider passed",
      offlineFirstKjvRead:
        "KJV package and SQLite runtime first read after same-profile offline restart",
      removeReinstall: "all eight optional packages passed",
      packageUpdates: "all seven non-HYMNE packages passed",
      packageRequests: Object.fromEntries(packageRequests),
      metadataRequests: Object.fromEntries(metadataRequests),
    }),
  );
} catch (error) {
  console.error(error);
  throw error;
} finally {
  await browser?.close().catch(() => undefined);
  await closeAppTree(app, true);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(profile, { recursive: true, force: true });
      break;
    } catch (error) {
      if (error.code !== "EBUSY" || attempt === 4) {
        console.warn(`Temporary WebView2 profile remains locked: ${profile}`);
        break;
      }
      await delay(1_000);
    }
  }
}
