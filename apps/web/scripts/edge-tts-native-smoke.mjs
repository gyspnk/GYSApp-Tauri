import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "@playwright/test";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const executable = resolve(
  process.argv[2] ??
    resolve(repoRoot, "apps/native/src-tauri/target/release/gysapp-native.exe"),
);
// Keep the first page of 40 matches under 1.5s once the packaged reader is ready.
const BIBLE_BROAD_SEARCH_BUDGET_MS = 1_500;
const MIDI_FIRST_FIXTURE = Buffer.from([
  0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x01, 0x01,
  0xe0, 0x4d, 0x54, 0x72, 0x6b, 0x00, 0x00, 0x00, 0x17, 0x00, 0xff, 0x51, 0x03,
  0x07, 0xa1, 0x20, 0x00, 0xc0, 0x00, 0x00, 0x90, 0x3c, 0x64, 0x83, 0x60, 0x80,
  0x3c, 0x40, 0x00, 0xff, 0x2f, 0x00,
]);
const MIDI_NEXT_FIXTURE = Buffer.from([
  0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x01, 0x01,
  0xe0, 0x4d, 0x54, 0x72, 0x6b, 0x00, 0x00, 0x00, 0x17, 0x00, 0xff, 0x51, 0x03,
  0x07, 0xa1, 0x20, 0x00, 0xc0, 0x00, 0x00, 0x90, 0x3c, 0x64, 0x83, 0x60, 0x80,
  0x3c, 0x40, 0x00, 0xff, 0x2f, 0x00,
]);
assert.equal(process.platform, "win32", "Native Edge smoke requires Windows");
assert.ok(existsSync(executable), `Missing Tauri executable: ${executable}`);

const packagedSauhSnapshot = JSON.parse(
  await readFile(
    resolve(repoRoot, "apps/web/public/offline/sauh.json"),
    "utf8",
  ),
);
const packagedSauhTitle = packagedSauhSnapshot.items?.[0]?.title;
assert.ok(packagedSauhTitle, "Packaged Sauh snapshot has no title");
const packagedSauhReference = packagedSauhSnapshot.items?.[0]?.reference;

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

const policyDebugPort = Number(process.env.GYS_WEBVIEW2_POLICY_DEBUG_PORT);
const useWebView2PolicyDebugging =
  Number.isInteger(policyDebugPort) &&
  policyDebugPort > 0 &&
  policyDebugPort <= 65_535;

async function allocateDevToolsPort() {
  return useWebView2PolicyDebugging ? policyDebugPort : allocatePort();
}

function webView2LaunchEnvironment(profile, port) {
  const env = { ...process.env };
  if (useWebView2PolicyDebugging) {
    for (const name of [
      "WEBVIEW2_BROWSER_EXECUTABLE_FOLDER",
      "WEBVIEW2_USER_DATA_FOLDER",
      "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
      "WEBVIEW2_CHANNEL_SEARCH_KIND",
      "WEBVIEW2_RELEASE_CHANNELS",
    ])
      delete env[name];
  } else {
    env.WEBVIEW2_USER_DATA_FOLDER = profile;
    env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = `--remote-debugging-port=${port} --remote-allow-origins=*`;
  }
  return env;
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
      // The WebView2 DevTools endpoint appears after its window is created.
    }
    await delay(250);
  }
  throw new Error("Timed out waiting for the WebView2 DevTools endpoint");
}

async function waitForMidiButtonLabel(page, expected, timeout = 30_000) {
  await page.waitForFunction(
    (label) =>
      document
        .querySelector(".media-surface .media-primary-control")
        ?.getAttribute("aria-label") === label,
    expected,
    { timeout },
  );
}

function nativeRouteUrl(path, origin) {
  const [pathname, query] = path.split("?", 2);
  const url = new URL("/", origin);
  url.searchParams.set("p", pathname);
  if (query) url.searchParams.set("q", query);
  return url.href;
}

async function readPinnedAsset(item, sourceCommit, destination) {
  const relativePath = item.path.replace(/^docs\//, "");
  const localSource = resolve(
    repoRoot,
    ".tmp-gyschordweb-a3d1ea7",
    "docs",
    relativePath,
  );
  let bytes;
  if (existsSync(localSource)) bytes = await readFile(localSource);
  if (
    !bytes ||
    bytes.byteLength !== item.size ||
    createHash("sha256").update(bytes).digest("hex") !== item.sha256
  ) {
    const urlPath = relativePath
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    const response = await fetch(
      `https://raw.githubusercontent.com/gyspnk/gyschordweb/${encodeURIComponent(sourceCommit)}/docs/${urlPath}`,
      { signal: AbortSignal.timeout(60_000) },
    );
    assert.equal(
      response.ok,
      true,
      `Upstream asset request failed: ${item.path}`,
    );
    bytes = Buffer.from(await response.arrayBuffer());
  }
  assert.equal(
    bytes.byteLength,
    item.size,
    `Upstream size mismatch: ${item.path}`,
  );
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    item.sha256,
    `Upstream SHA-256 mismatch: ${item.path}`,
  );
  await writeFile(destination, bytes);
}

function rawMusicAssetUrl(path, sourceCommit) {
  const relativePath = path
    .replace(/^docs\//, "")
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `https://raw.githubusercontent.com/gyspnk/gyschordweb/${encodeURIComponent(sourceCommit)}/docs/${relativePath}`;
}

function smokeMusicAssetUrl(path, sourceCommit) {
  const base = process.env.VITE_BFF_BASE_URL?.trim();
  return base
    ? `${base.replace(/\/$/u, "")}/api/v1/content/music?commit=${encodeURIComponent(sourceCommit)}&path=${encodeURIComponent(path)}`
    : rawMusicAssetUrl(path, sourceCommit);
}

async function cachePinnedFile(
  page,
  cacheName,
  cacheKey,
  filePath,
  expectedSize,
  expectedSha256,
) {
  const bytes = await readFile(filePath);
  assert.equal(
    bytes.byteLength,
    expectedSize,
    `Pinned cache size mismatch: ${filePath}`,
  );
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    expectedSha256,
    `Pinned cache checksum mismatch: ${filePath}`,
  );
  await page.evaluate(() => {
    window.__gysNativeSmokeChunks = [];
  });
  const chunkSize = 4 * 1024 * 1024;
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize).toString("base64");
    await page.evaluate((encoded) => {
      const binary = atob(encoded);
      const chunkBytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index++)
        chunkBytes[index] = binary.charCodeAt(index);
      window.__gysNativeSmokeChunks.push(chunkBytes.buffer);
    }, chunk);
  }
  const storedSize = await page.evaluate(
    async ({ name, key, size }) => {
      const payload = new Blob(window.__gysNativeSmokeChunks);
      if (payload.size !== size)
        throw new Error(`Cache fixture size ${payload.size}; expected ${size}`);
      const cache = await caches.open(name);
      await cache.put(key, new Response(payload));
      window.__gysNativeSmokeChunks = [];
      const stored = await cache.match(key);
      if (!stored)
        throw new Error("Pinned asset was not stored in Cache Storage");
      return (await stored.arrayBuffer()).byteLength;
    },
    { name: cacheName, key: cacheKey, size: expectedSize },
  );
  assert.equal(
    storedSize,
    expectedSize,
    `Pinned Cache Storage write failed: ${filePath}`,
  );
}

async function waitForDiagnostic(page, scope, timeout = 30_000) {
  await page.waitForFunction(
    (target) =>
      JSON.parse(localStorage.getItem("gys-diagnostics-v1") ?? "[]").some(
        (event) => event.scope === target,
      ),
    scope,
    { timeout },
  );
  return await page.evaluate((target) => {
    const events = JSON.parse(
      localStorage.getItem("gys-diagnostics-v1") ?? "[]",
    );
    return events.filter((event) => event.scope === target);
  }, scope);
}

async function openSpeechSettings(page) {
  await page.locator(".reader-hamburger-btn").click();
  const card = page.locator(".drawer-speech-card");
  if (!(await card.isVisible()))
    await page.locator(".speech-settings-toggle").click();
  await card.waitFor({ state: "visible" });
  return card.locator("select");
}

async function openHymnTypographySettings(page) {
  const summary = page.locator(".hymn-reader-settings-summary");
  if (!(await summary.isVisible()))
    await page.locator(".hymn-more-actions-summary").click();
  await summary.click();
  const controls = page.locator(".hymn-reading-settings .reader-preferences");
  await controls.waitFor({ state: "visible" });
  return controls;
}

async function ensureChordVisible(page) {
  const show = page.getByRole("button", {
    name: "Tampilkan chord",
    exact: true,
  });
  if (await show.count()) await show.click();
  else
    await page
      .getByRole("button", { name: "Sembunyikan chord", exact: true })
      .waitFor({ state: "visible", timeout: 10_000 });
}

async function closeAppTree(app, force = true) {
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
    const shutdownDeadline = Date.now() + 10_000;
    while (app.exitCode === null && Date.now() < shutdownDeadline)
      await delay(100);
  }
  return app.exitCode !== null;
}

const profile = await mkdtemp(resolve(tmpdir(), "gysapp-edge-smoke-"));
let port;
let app;
let browser;

try {
  const musicLock = JSON.parse(
    await readFile(
      resolve(repoRoot, "apps/web/public/offline/music-lock.json"),
      "utf8",
    ),
  );
  const smokeMusicLock = structuredClone(musicLock);
  const hymnCatalog = JSON.parse(
    await readFile(
      resolve(repoRoot, "apps/web/public/offline/hymn-catalog.json"),
      "utf8",
    ),
  );
  const assetManifest = JSON.parse(
    await readFile(
      resolve(repoRoot, "apps/web/public/offline/asset-manifest.json"),
      "utf8",
    ),
  );
  const hymnOne = hymnCatalog.items.find((item) => item.id === "hymn-001");
  assert.ok(hymnOne, "Packaged hymn catalog omitted hymn-001");
  const hymnOnePdf = musicLock.items.find(
    (item) => item.path === hymnOne.pdfPath,
  );
  assert.ok(hymnOnePdf, "Pinned music lock omitted hymn-001 PDF");
  assert.equal(
    assetManifest.items.find((item) => item.path === hymnOne.pdfPath)?.source,
    "local",
    "Packaged asset manifest did not seed the canonical hymn-001 PDF",
  );
  const hymnOnePdfPath = resolve(repoRoot, "apps/web/public", hymnOne.pdfPath);
  const hymnOnePdfBytes = await readFile(hymnOnePdfPath);
  assert.equal(hymnOnePdfBytes.byteLength, hymnOnePdf.size);
  assert.equal(
    createHash("sha256").update(hymnOnePdfBytes).digest("hex"),
    hymnOnePdf.sha256,
    "Packaged hymn-001 PDF differs from its pinned source",
  );
  const distributedAssets = JSON.parse(
    await readFile(
      resolve(repoRoot, "apps/web/public/offline/distributed-assets.json"),
      "utf8",
    ),
  );
  const soundfont = distributedAssets.items.find(
    (item) => item.code === "GeneralUser-GS",
  );
  assert.ok(
    soundfont,
    "Pinned distributed asset manifest omitted GeneralUser-GS",
  );
  const soundfontItem = musicLock.items.find(
    (item) => item.path === "assets/soundfont/GeneralUser-GS.sf2",
  );
  const midiPaths = [
    "assets/midi/001_Pujilah Allah Yang Maha Esa.mid",
    "assets/midi/002_Pujilah Allah Yang Mahakudus.mid",
  ];
  assert.ok(soundfontItem, "Pinned music lock omitted GeneralUser-GS");
  assert.equal(soundfontItem.size, soundfont.sizeBytes);
  assert.equal(soundfontItem.sha256, soundfont.checksumSha256);
  const upstreamMidiItem = musicLock.items.find(
    (item) => item.path === midiPaths[0],
  );
  const upstreamNextMidiItem = musicLock.items.find(
    (item) => item.path === midiPaths[1],
  );
  assert.ok(upstreamMidiItem, "Pinned music lock omitted the first MIDI track");
  assert.ok(
    upstreamNextMidiItem,
    "Pinned music lock omitted the second MIDI track",
  );
  const recoveryPdfItem = musicLock.items.find(
    (item) => item.path === "assets/pdf/051A_Batu Zaman.pdf",
  );
  assert.ok(recoveryPdfItem, "Pinned music lock omitted hymn-051A PDF");
  const recoveryChordItem = musicLock.items.find(
    (item) => item.kind === "chord" && /001_/.test(item.path),
  );
  assert.ok(recoveryChordItem, "Pinned music lock omitted hymn-001 chord");
  const recoveryChordNumber =
    recoveryChordItem.path.match(/(\d{3}[a-z]?)_/i)?.[1];
  assert.equal(recoveryChordNumber?.toUpperCase(), "001");
  const recoveryChordSongId = `hymn-${recoveryChordNumber.toUpperCase()}`;
  const soundfontPath = resolve(profile, soundfont.installFileName);
  const upstreamMidiPath = resolve(profile, "upstream-hymn-001.mid");
  const upstreamNextMidiPath = resolve(profile, "upstream-hymn-002.mid");
  const recoveryPdfPath = resolve(profile, "upstream-hymn-051A.pdf");
  const recoveryChordPath = resolve(profile, "upstream-hymn-001.chord.json");
  const midiFixtures = [MIDI_FIRST_FIXTURE, MIDI_NEXT_FIXTURE];
  const midiItems = [];
  const midiFiles = new Map();
  await readPinnedAsset(soundfontItem, musicLock.sourceCommit, soundfontPath);
  await readPinnedAsset(
    upstreamMidiItem,
    musicLock.sourceCommit,
    upstreamMidiPath,
  );
  await readPinnedAsset(
    upstreamNextMidiItem,
    musicLock.sourceCommit,
    upstreamNextMidiPath,
  );
  await readPinnedAsset(
    recoveryPdfItem,
    musicLock.sourceCommit,
    recoveryPdfPath,
  );
  await readPinnedAsset(
    recoveryChordItem,
    musicLock.sourceCommit,
    recoveryChordPath,
  );
  for (const [index, path] of midiPaths.entries()) {
    const item = smokeMusicLock.items.find(
      (candidate) => candidate.path === path,
    );
    assert.ok(item, `Pinned music lock omitted MIDI smoke track: ${path}`);
    const bytes = midiFixtures[index];
    const digest = createHash("sha256").update(bytes).digest("hex");
    item.size = bytes.byteLength;
    item.sha256 = digest;
    const destination = resolve(profile, `native-smoke-${index + 1}.mid`);
    await writeFile(destination, bytes);
    midiItems.push(item);
    midiFiles.set(item.path, destination);
  }

  port = await allocateDevToolsPort();
  app = spawn(executable, [], {
    stdio: ["ignore", "pipe", "pipe"],
    env: webView2LaunchEnvironment(profile, port),
  });
  let appStdout = "";
  let appStderr = "";
  app.stdout.setEncoding("utf8");
  app.stdout.on("data", (chunk) => {
    appStdout = `${appStdout}${chunk}`.slice(-12_000);
  });
  app.stderr.setEncoding("utf8");
  app.stderr.on("data", (chunk) => {
    appStderr = `${appStderr}${chunk}`.slice(-12_000);
  });
  app.once("exit", (code, signal) => {
    if (code !== 0 || signal) {
      console.error(`Native app exited: ${JSON.stringify({ code, signal })}`);
      if (appStdout.trim())
        console.error(`Native app stdout: ${appStdout.trim()}`);
      if (appStderr.trim())
        console.error(`Native app stderr: ${appStderr.trim()}`);
    }
  });
  const devTools = await waitForDevTools(app, port);
  browser = await chromium.connectOverCDP(devTools.webSocketDebuggerUrl, {
    timeout: 30_000,
  });
  const context = browser.contexts()[0];
  assert.ok(context, "Tauri did not expose a WebView2 context");
  const page = context.pages()[0] ?? (await context.newPage());
  page.once("crash", () => console.error("Native WebView renderer crashed"));
  page.on("pageerror", (error) =>
    console.error(`Native WebView uncaught error: ${error.message}`),
  );
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /pdf|tjcorguploads|cors/i.test(message.text())
    )
      console.error(`Native WebView PDF console error: ${message.text()}`);
  });
  page.on("requestfailed", (request) => {
    if (/\.pdf(?:\?|$)|api\/v1\/content\/pdf/i.test(request.url()))
      console.error(
        `Native WebView PDF request failed: ${JSON.stringify({ url: request.url(), error: request.failure()?.errorText })}`,
      );
  });
  page.on("response", (response) => {
    if (/\.pdf(?:\?|$)|api\/v1\/content\/pdf/i.test(response.url()))
      console.error(
        `Native WebView PDF response: ${JSON.stringify({ url: response.url(), status: response.status(), accessControlAllowOrigin: response.headers()["access-control-allow-origin"] ?? null })}`,
      );
  });
  await page.waitForFunction(() => location.href !== "about:blank", null, {
    timeout: 15_000,
  });
  const runtimeOrigin = await page.evaluate(() => location.origin);
  const blockedOfflineShellRequests = [];
  await context.route("**/*", async (route) => {
    const requestUrl = route.request().url();
    if (new URL(requestUrl).origin === runtimeOrigin) return route.continue();
    blockedOfflineShellRequests.push(requestUrl);
    return route.abort();
  });

  const homeStartedAt = Date.now();
  await page.locator(".home-grid").waitFor({ state: "visible" });
  const homeReadyMs = Date.now() - homeStartedAt;
  const homeFailurePage = page;
  await homeFailurePage.addInitScript(() => {
    if (window.sessionStorage.getItem("gys-native-home-fixture-used") === "1")
      return;
    window.sessionStorage.setItem("gys-native-home-fixture-used", "1");
    for (const storage of [window.localStorage, window.sessionStorage]) {
      for (let index = storage.length - 1; index >= 0; index--) {
        const key = storage.key(index);
        if (
          key === "gys-activity-v1" ||
          key === "gys_suara_feed_v3" ||
          key === "gys_literature_catalog_v5" ||
          key?.startsWith("gys_sauh_v2_day_")
        )
          storage.removeItem(key);
      }
    }
    window.__gysNativeHomeRequests = {
      sauh: 0,
      suara: 0,
      literature: 0,
      publisher: 0,
    };
    window.__gysNativeHomeFeedsAvailable = false;
    const fixtures = new Map([
      ["/offline/sauh.json", ["sauh", { items: [] }]],
      [
        "/offline/suara-sejati.json",
        ["suara", { source: "tjc.org", items: [] }],
      ],
      [
        "/offline/literature.json",
        ["literature", { source: "tjc.org", items: [] }],
      ],
    ]);
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const requestUrl = input instanceof Request ? input.url : String(input);
      const url = new URL(requestUrl, window.location.href);
      const fixture =
        url.origin === window.location.origin
          ? fixtures.get(
              url.pathname.slice(url.pathname.lastIndexOf("/offline/")),
            )
          : undefined;
      if (fixture) {
        const [name, emptyValue] = fixture;
        window.__gysNativeHomeRequests[name] += 1;
        if (window.__gysNativeHomeFeedsAvailable)
          return nativeFetch(input, init);
        return Promise.resolve(
          new Response(JSON.stringify(emptyValue), {
            headers: { "content-type": "application/json" },
          }),
        );
      }
      if (url.origin !== window.location.origin) {
        window.__gysNativeHomeRequests.publisher += 1;
        return Promise.reject(new TypeError("Failed to fetch"));
      }
      return nativeFetch(input, init);
    };
  });
  await homeFailurePage.goto(new URL("/", runtimeOrigin).href);
  await homeFailurePage.locator(".home-grid").waitFor({ state: "visible" });
  const homeSauhError = homeFailurePage.locator(".sauh-offline-state");
  const homeSuaraError = homeFailurePage.locator(
    ".home-suara-section .error-panel",
  );
  const homeLiteratureError = homeFailurePage.locator(
    ".home-literature-section .error-panel",
  );
  await homeSauhError.waitFor({ state: "visible", timeout: 15_000 });
  await homeSuaraError.waitFor({ state: "visible", timeout: 15_000 });
  await homeLiteratureError.waitFor({ state: "visible", timeout: 15_000 });
  await homeFailurePage
    .locator(".continue-panel .empty-inline")
    .waitFor({ state: "visible" });
  assert.equal(
    await homeFailurePage.locator(".continue-panel .continue-item").count(),
    0,
    "Fresh packaged Home displayed recent activity",
  );
  assert.equal(
    await homeFailurePage.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth + 1,
    ),
    true,
    "Packaged Home feed errors introduced horizontal overflow",
  );
  const homeInitialRequests = await homeFailurePage.evaluate(
    () => window.__gysNativeHomeRequests,
  );
  const homeRetryRequests = { ...homeInitialRequests };
  for (const [errorPanel, requestKey] of [
    [homeSauhError, "sauh"],
    [homeSuaraError, "suara"],
    [homeLiteratureError, "literature"],
  ]) {
    const previous = homeRetryRequests[requestKey];
    await errorPanel.locator("button").click();
    await homeFailurePage.waitForFunction(
      ({ key, count }) => window.__gysNativeHomeRequests[key] > count,
      { key: requestKey, count: previous },
      { timeout: 5_000 },
    );
    await errorPanel.waitFor({ state: "visible", timeout: 5_000 });
    homeRetryRequests[requestKey] = await homeFailurePage.evaluate(
      (key) => window.__gysNativeHomeRequests[key],
      requestKey,
    );
  }
  await homeFailurePage.evaluate(() => {
    window.__gysNativeHomeFeedsAvailable = true;
  });
  const beforeHomeRecovery = { ...homeRetryRequests };
  await homeSauhError.locator("button").click();
  await homeFailurePage.locator(".sauh-card-body").waitFor({
    state: "visible",
    timeout: 15_000,
  });
  const recoveredHomeSauhTitle = await homeFailurePage
    .locator(".sauh-card-body .sauh-title")
    .innerText();
  assert.equal(
    recoveredHomeSauhTitle,
    packagedSauhTitle,
    "Packaged Home recovery did not render its official Sauh snapshot",
  );
  const recoveredHomeSauhReference = await homeFailurePage
    .locator(".verse-panel .section-heading small")
    .textContent();
  if (packagedSauhReference)
    assert.equal(recoveredHomeSauhReference, packagedSauhReference);
  await homeSauhError.waitFor({ state: "hidden" });
  await homeSuaraError.locator("button").click();
  await homeFailurePage
    .locator(".home-suara-section .suara-library-item")
    .first()
    .waitFor({ state: "visible", timeout: 15_000 });
  await homeSuaraError.waitFor({ state: "hidden" });
  await homeLiteratureError.locator("button").click();
  await homeFailurePage
    .locator(".home-literature-section .suara-library-item")
    .first()
    .waitFor({ state: "visible", timeout: 15_000 });
  await homeLiteratureError.waitFor({ state: "hidden" });
  const recoveredHomeRequests = await homeFailurePage.evaluate(
    () => window.__gysNativeHomeRequests,
  );
  assert.ok(recoveredHomeRequests.sauh > beforeHomeRecovery.sauh);
  assert.ok(recoveredHomeRequests.suara > beforeHomeRecovery.suara);
  assert.ok(recoveredHomeRequests.literature > beforeHomeRecovery.literature);
  assert.equal(
    await homeFailurePage.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth + 1,
    ),
    true,
    "Recovered packaged Home feeds introduced horizontal overflow",
  );
  const packagedHomeResilience = {
    emptyActivity: "passed",
    feedErrorsAndRetries: "passed",
    feedRecoveryFromPackagedSnapshots: "passed",
    sauhTitle: recoveredHomeSauhTitle,
    contentRequestsAfterRetry: {
      sauh: homeRetryRequests.sauh,
      suara: homeRetryRequests.suara,
      literature: homeRetryRequests.literature,
    },
    externalRequestsBlocked: true,
    noHorizontalOverflow: true,
  };
  const initialServiceWorker = await page.evaluate(() => ({
    supported: "serviceWorker" in navigator,
    controller: navigator.serviceWorker?.controller?.scriptURL ?? null,
  }));
  const bibleStartedAt = Date.now();
  try {
    await page.locator('.primary-nav .nav-item[href="/bible"]').click();
  } catch (error) {
    const state = await page.evaluate(() => ({
      url: location.href,
      title: document.title,
      body: document.body.innerText.slice(0, 500),
      bibleLinks: document.querySelectorAll(
        '.primary-nav .nav-item[href="/bible"]',
      ).length,
    }));
    throw new Error(
      `Bible route link failed: ${JSON.stringify({ ...state, initialServiceWorker })}`,
      {
        cause: error,
      },
    );
  }
  try {
    await page.locator(".reader-speech-btn").waitFor({ state: "visible" });
  } catch (error) {
    const state = await page.evaluate(() => ({
      url: location.href,
      title: document.title,
      tauri: Boolean(window.__TAURI_INTERNALS__),
      body: document.body.innerText.slice(0, 500),
    }));
    throw new Error(
      `Bible speech button unavailable: ${JSON.stringify(state)}`,
      {
        cause: error,
      },
    );
  }
  const bibleReadyMs = Date.now() - bibleStartedAt;

  const bibleSearchForm = page.locator("#bible-search-form");
  assert.equal(
    await bibleSearchForm.getAttribute("aria-hidden"),
    "true",
    "Closed Bible search remained exposed to accessibility APIs",
  );
  assert.equal(
    await bibleSearchForm.getAttribute("inert"),
    "",
    "Closed Bible search remained in the keyboard order",
  );

  const searchToggle = page.getByRole("button", {
    name: "Buka pencarian ayat di Alkitab",
  });
  assert.equal(
    await searchToggle.isEnabled(),
    true,
    "Bible search did not activate after the packaged reader became ready",
  );
  await searchToggle.click();
  await page.waitForFunction(
    () => document.activeElement === document.querySelector("#bible-query"),
    null,
    { timeout: 5_000 },
  );
  const searchInput = page.getByLabel("Cari Alkitab", { exact: true });
  await searchInput.fill("Allah");
  const searchStartedAt = Date.now();
  await bibleSearchForm
    .getByRole("button", { name: "Cari", exact: true })
    .click();
  const searchResults = page.locator(".result-item");
  await searchResults.nth(39).waitFor({ state: "visible", timeout: 10_000 });
  const bibleSearchMs = Date.now() - searchStartedAt;
  assert.equal(
    await searchResults.count(),
    40,
    "Packaged broad Bible search did not bound visible results to 40",
  );
  assert.match(
    await searchResults.first().innerText(),
    /Kejadian 1:1/,
    "Packaged broad Bible search lost its first matching verse",
  );
  assert.ok(
    bibleSearchMs <= BIBLE_BROAD_SEARCH_BUDGET_MS,
    `Packaged broad Bible search took ${bibleSearchMs}ms; budget is ${BIBLE_BROAD_SEARCH_BUDGET_MS}ms`,
  );
  const moreSearchResults = page.getByRole("button", {
    name: "Tampilkan lebih banyak ayat",
    exact: true,
  });
  assert.equal(
    await moreSearchResults.count(),
    1,
    "Packaged broad Bible search did not expose the next result page",
  );
  await moreSearchResults.click();
  await page.waitForFunction(
    () => document.querySelectorAll(".result-item").length === 80,
    null,
    { timeout: 10_000 },
  );
  const bibleExpandedSearchResults = await searchResults.count();
  assert.equal(
    bibleExpandedSearchResults,
    80,
    "Packaged broad Bible search did not expand to 80 visible results",
  );
  assert.equal(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth + 1,
    ),
    true,
    "Packaged Bible search introduced horizontal overflow",
  );
  await page
    .locator(".search-results")
    .getByRole("button", { name: "Tutup", exact: true })
    .click();
  await searchToggle.click();
  const offlineShellBlockedRequestCount = blockedOfflineShellRequests.length;
  const nativeFaithRoute = nativeRouteUrl("/iman", runtimeOrigin);
  await page.goto(nativeFaithRoute);
  await page.locator(".faith-row").first().waitFor({
    state: "visible",
    timeout: 20_000,
  });
  const offlineFaithItems = await page.locator(".faith-row").count();

  await page.goto(nativeRouteUrl("/literatur", runtimeOrigin));
  await page.locator(".literature-row").first().waitFor({
    state: "visible",
    timeout: 20_000,
  });
  const offlineLiteratureItems = await page.locator(".literature-row").count();

  await page.goto(nativeRouteUrl("/sauh", runtimeOrigin));
  await page.waitForFunction(
    () =>
      document
        .querySelector(".sauh-article")
        ?.getAttribute("data-sauh-status") !== "loading",
    null,
    { timeout: 20_000 },
  );
  const offlineSauhStatus = await page
    .locator(".sauh-article")
    .getAttribute("data-sauh-status");
  const offlineSauhTitle = await page.locator(".sauh-article h1").innerText();
  assert.equal(
    offlineSauhStatus,
    "ready",
    "Fresh packaged Sauh snapshot did not render while off-origin requests were blocked",
  );
  assert.ok(offlineSauhTitle.trim(), "Packaged Sauh snapshot has no title");
  assert.equal(
    offlineSauhTitle,
    packagedSauhTitle,
    "Offline Sauh detail did not render the official packaged snapshot",
  );
  const offlineSauhReference = await page
    .locator(".sauh-article .online-article-reference")
    .textContent();
  if (packagedSauhReference)
    assert.equal(offlineSauhReference, packagedSauhReference);

  await page.goto(nativeRouteUrl("/suara", runtimeOrigin));
  await page.locator(".suara-library-item").first().waitFor({
    state: "visible",
    timeout: 20_000,
  });
  const offlineSuaraItems = await page.locator(".suara-library-item").count();
  const offlineContentBlockedRequestCount =
    blockedOfflineShellRequests.length - offlineShellBlockedRequestCount;
  const offlineContentRoutes = {
    faithItems: offlineFaithItems,
    literatureItems: offlineLiteratureItems,
    sauhStatus: offlineSauhStatus,
    sauhTitle: offlineSauhTitle,
    sauhReference: offlineSauhReference,
    suaraItems: offlineSuaraItems,
  };
  await page.goto(nativeRouteUrl("/bible", runtimeOrigin));
  await page.locator(".reader-speech-btn").waitFor({ state: "visible" });
  await context.unroute("**/*");

  let faithPdfProgressAfterRead = null;
  if (process.env.VITE_BFF_BASE_URL?.trim()) {
    await page.goto(nativeRouteUrl("/iman?item=1", runtimeOrigin));
    const faithPdfTopic = page.locator(".faith-modal");
    await faithPdfTopic.waitFor({ state: "visible", timeout: 20_000 });
    await faithPdfTopic.locator(".faith-read-more").click();
    await page.waitForFunction(
      () => {
        const phase = document
          .querySelector(".faith-pdf-overlay .pdf-reader")
          ?.getAttribute("data-pdf-loading-phase");
        return phase === "ready" || phase === "error";
      },
      null,
      { timeout: 45_000 },
    );
    const faithPdfPhase = await page
      .locator(".faith-pdf-overlay .pdf-reader")
      .getAttribute("data-pdf-loading-phase");
    const faithPdfError = await page
      .locator(".faith-pdf-overlay .pdf-error-state")
      .evaluate((element) => ({
        message: element.innerText,
        status: element.getAttribute("data-pdf-error-status"),
      }))
      .catch(() => null);
    assert.equal(
      faithPdfPhase,
      "ready",
      `Faith source PDF did not render in packaged Tauri: ${JSON.stringify(faithPdfError)}`,
    );
    const faithPdfPageJump = page.locator(
      ".faith-pdf-overlay .pdf-page-jump input",
    );
    await faithPdfPageJump.waitFor({ state: "visible" });
    await faithPdfPageJump.fill("2");
    await faithPdfPageJump.press("Enter");
    await page.waitForFunction(() => {
      const progress = JSON.parse(
        localStorage.getItem("gys-faith-pdf-1") ?? "null",
      );
      return (
        progress?.page === 2 &&
        progress.totalPages > 1 &&
        localStorage.getItem("gys-pdf-page:faith:dk-1") === "2"
      );
    });
    faithPdfProgressAfterRead = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("gys-faith-pdf-1") ?? "null"),
    );
  } else {
    console.log(
      "Skipping packaged Faith PDF progress: VITE_BFF_BASE_URL is unset and the official host blocks WebView2 CORS.",
    );
  }

  await page.goto(nativeRouteUrl("/sauh", runtimeOrigin));
  await page.waitForFunction(
    () =>
      document
        .querySelector(".sauh-article")
        ?.getAttribute("data-sauh-status") === "ready",
    null,
    { timeout: 30_000 },
  );
  const recoveredSauhTitle = await page.locator(".sauh-article h1").innerText();
  assert.ok(recoveredSauhTitle.trim(), "Live Sauh recovery has no title");
  await page.goto(nativeRouteUrl("/bible", runtimeOrigin));
  await page.locator(".reader-speech-btn").waitFor({ state: "visible" });

  await page.locator(".verse-text").first().click();
  const annotationToolbar = page.getByRole("toolbar", {
    name: "Aksi ayat terpilih",
  });
  await annotationToolbar
    .getByRole("button", { name: "Catatan ayat", exact: true })
    .click();
  const annotationDialog = page.getByRole("dialog", {
    name: "Catatan ayat",
  });
  await page.getByLabel("Catatan pribadi").fill("Packaged annotation restore");
  await annotationDialog
    .getByRole("button", { name: "Simpan catatan", exact: true })
    .click();
  await annotationDialog
    .getByRole("button", { name: "Tutup catatan ayat", exact: true })
    .click();
  await annotationToolbar.getByRole("button", { name: "Sorot biru" }).click();
  const customAnnotatedVerse = page.locator(".verse-row").nth(1);
  await customAnnotatedVerse.locator(".verse-text").click();
  await annotationToolbar
    .getByLabel("Warna khusus sorotan")
    .evaluate((element) => {
      const input = element;
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(input, "#ca7231");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  await page.waitForFunction(() => {
    const palette = JSON.parse(
      localStorage.getItem("gys-bible-highlight-palette-v1") ?? "[]",
    );
    const highlights = JSON.parse(
      localStorage.getItem("gys-bible-highlights-v1") ?? "{}",
    );
    return palette.includes("#ca7231") && highlights["1:1:2"] === "#ca7231";
  });
  const annotatedVerse = page.locator(".verse-row").first();
  await annotatedVerse.locator(".verse-number").click();
  await page.waitForFunction(() => {
    const bookmarks = JSON.parse(
      localStorage.getItem("gys-bible-bookmarks") ?? "[]",
    );
    const notes = JSON.parse(
      localStorage.getItem("gys-bible-notes-v1") ?? "{}",
    );
    const highlights = JSON.parse(
      localStorage.getItem("gys-bible-highlights-v1") ?? "{}",
    );
    return (
      bookmarks.includes("1:1:1") &&
      notes["1:1:1"]?.some(
        (note) => note.text === "Packaged annotation restore",
      ) &&
      highlights["1:1:1"] === "blue"
    );
  });
  await annotationToolbar
    .getByRole("button", { name: "Tutup ayat terpilih" })
    .click();

  const settings = await openSpeechSettings(page);
  await settings.nth(0).selectOption("edge");
  await settings.nth(1).selectOption("id-ID-ArdiNeural");
  await page.locator(".hamburger-drawer-close").click();

  const readerButton = page.locator(".reader-speech-btn");
  const idleLabel = await readerButton.getAttribute("aria-label");
  await readerButton.click();
  await waitForDiagnostic(page, "tts.edge.receive");
  await page.locator(".media-stop-control").click();
  await waitForDiagnostic(page, "tts.edge.abort");
  await page.waitForFunction(
    (label) =>
      document
        .querySelector(".reader-speech-btn")
        ?.getAttribute("aria-label") === label,
    idleLabel,
  );

  const voiceSettings = await openSpeechSettings(page);
  await voiceSettings.nth(1).selectOption("id-ID-GadisNeural");
  assert.equal(
    await page.evaluate(() => localStorage.getItem("gys-speech-voice-v1")),
    "id-ID-GadisNeural",
    "Voice picker did not persist the selected neural voice",
  );
  await page.locator(".hamburger-drawer-close").click();
  await readerButton.click();

  const voices = await waitForDiagnostic(page, "tts.edge.voice");
  const audio = await waitForDiagnostic(page, "tts.edge.audio");
  const playback = await waitForDiagnostic(page, "tts.edge.playback");
  assert.ok(
    voices.some((event) => event.message === "id-ID-GadisNeural"),
    "The changed voice was not sent to the Edge provider",
  );
  assert.ok(
    audio.some((event) => /Received [1-9]\d* audio bytes/.test(event.message)),
    "Edge did not return non-zero audio",
  );
  assert.ok(
    playback.some((event) =>
      /Playing [1-9]\d* audio bytes/.test(event.message),
    ),
    "Edge audio did not enter playback",
  );

  await delay(700);
  await readerButton.click();
  await page.waitForFunction(() =>
    /resume|lanjut/i.test(
      document
        .querySelector(".reader-speech-btn")
        ?.getAttribute("aria-label") ?? "",
    ),
  );
  const pausedLabel = await readerButton.getAttribute("aria-label");
  await delay(700);
  assert.equal(
    await readerButton.getAttribute("aria-label"),
    pausedLabel,
    "Speech did not remain paused",
  );
  await readerButton.click();
  await page.waitForFunction(() =>
    /pause|jeda/i.test(
      document
        .querySelector(".reader-speech-btn")
        ?.getAttribute("aria-label") ?? "",
    ),
  );
  await page.locator(".media-stop-control").click();
  await page.waitForFunction(
    (label) =>
      document
        .querySelector(".reader-speech-btn")
        ?.getAttribute("aria-label") === label,
    idleLabel,
  );

  await readerButton.click();
  await page.waitForFunction(
    ({ voiceCount, audioCount, playbackCount }) => {
      const events = JSON.parse(
        localStorage.getItem("gys-diagnostics-v1") ?? "[]",
      );
      return (
        events.filter((event) => event.scope === "tts.edge.voice").length >
          voiceCount &&
        events.filter((event) => event.scope === "tts.edge.audio").length >
          audioCount &&
        events.filter((event) => event.scope === "tts.edge.playback").length >
          playbackCount
      );
    },
    {
      voiceCount: voices.length,
      audioCount: audio.length,
      playbackCount: playback.length,
    },
  );
  const repeatedVoice = await waitForDiagnostic(page, "tts.edge.voice");
  const repeatedAudio = await waitForDiagnostic(page, "tts.edge.audio");
  const repeatedPlayback = await waitForDiagnostic(page, "tts.edge.playback");
  assert.ok(
    repeatedVoice.length > voices.length &&
      repeatedVoice.at(-1)?.message === "id-ID-GadisNeural",
    "The same selected voice did not reach the repeated request",
  );
  assert.match(
    repeatedAudio.at(-1)?.message ?? "",
    /^Received [1-9]\d* audio bytes$/,
    "The repeated request did not receive non-zero audio",
  );
  assert.match(
    repeatedPlayback.at(-1)?.message ?? "",
    /^Playing [1-9]\d* audio bytes$/,
    "The repeated request did not enter playback",
  );
  await page.locator(".media-stop-control").click();
  await page.waitForFunction(
    (label) =>
      document
        .querySelector(".reader-speech-btn")
        ?.getAttribute("aria-label") === label,
    idleLabel,
  );

  const localSettings = await openSpeechSettings(page);
  await localSettings.nth(0).selectOption("local");
  const localIndonesianVoice = await page.evaluate(() => {
    const voice = window.speechSynthesis
      .getVoices()
      .find(
        (candidate) =>
          candidate.localService && /^id(?:-|_)/i.test(candidate.lang),
      );
    return voice
      ? {
          id: voice.voiceURI,
          name: voice.name,
          language: voice.lang,
          local: voice.localService,
        }
      : undefined;
  });
  assert.ok(
    localIndonesianVoice,
    "Packaged WebView2 has no installed local Indonesian speech voice",
  );
  await page.waitForFunction(
    (voiceId) =>
      [
        ...document.querySelectorAll(".drawer-speech-card select")[1].options,
      ].some((option) => option.value === voiceId),
    localIndonesianVoice.id,
  );
  await localSettings.nth(1).selectOption(localIndonesianVoice.id);
  await page.locator(".hamburger-drawer-close").click();
  await page.evaluate(() => {
    const synthesis = window.speechSynthesis;
    const speak = synthesis.speak.bind(synthesis);
    const state = {
      called: false,
      started: false,
      voiceId: undefined,
      language: undefined,
      local: false,
    };
    window.__gysNativeLocalSpeech = state;
    synthesis.speak = (utterance) => {
      state.called = true;
      state.voiceId = utterance.voice?.voiceURI;
      state.language = utterance.lang;
      state.local = utterance.voice?.localService ?? false;
      utterance.addEventListener(
        "start",
        () => {
          state.started = true;
        },
        { once: true },
      );
      speak(utterance);
    };
  });
  await readerButton.click();
  await page.waitForFunction(
    () => window.__gysNativeLocalSpeech?.started === true,
    null,
    { timeout: 10_000 },
  );
  const localSpeechPlayback = await page.evaluate(
    () => window.__gysNativeLocalSpeech,
  );
  assert.deepEqual(localSpeechPlayback, {
    called: true,
    started: true,
    voiceId: localIndonesianVoice.id,
    language: localIndonesianVoice.language,
    local: true,
  });
  await page.locator(".media-stop-control").click();
  await page.waitForFunction(
    (label) =>
      document
        .querySelector(".reader-speech-btn")
        ?.getAttribute("aria-label") === label,
    idleLabel,
  );
  const restoreEdgeSettings = await openSpeechSettings(page);
  await restoreEdgeSettings.nth(0).selectOption("edge");
  await restoreEdgeSettings.nth(1).selectOption("id-ID-GadisNeural");
  await page.locator(".hamburger-drawer-close").click();
  assert.equal(
    await page.evaluate(() => localStorage.getItem("gys-speech-engine-v1")),
    "edge",
    "Packaged voice verification did not restore the Edge setting",
  );

  const origin = await page.evaluate(() => location.origin);
  await page.goto(new URL("/kidung", origin).href);
  await page.locator(".pujian-item").first().waitFor({
    state: "visible",
    timeout: 20_000,
  });
  const collectionFilter = page.locator(
    ".kidung-desktop-filter .control-select",
  );
  await collectionFilter.locator(".control-select-trigger").click();
  const collectionLabels = await collectionFilter
    .locator(".control-select-option")
    .allTextContents();
  const expectedCollectionLabels = [
    "Semua koleksi",
    ...[...new Set(hymnCatalog.items.map((item) => item.book))]
      .sort()
      .map((book) =>
        book
          .split("-")
          .map(
            (word) => word.charAt(0).toLocaleUpperCase("id-ID") + word.slice(1),
          )
          .join(" "),
      ),
  ];
  assert.deepEqual(
    collectionLabels,
    expectedCollectionLabels,
    "Packaged hymnal collection names differ from the installed catalog",
  );
  for (const label of expectedCollectionLabels.slice(1)) {
    await collectionFilter
      .getByRole("option", { name: label, exact: true })
      .click();
    assert.equal(
      await collectionFilter.locator(".control-select-value").innerText(),
      label,
      `Packaged collection filter did not select ${label}`,
    );
    assert.ok(
      (await page.locator(".pujian-item").count()) > 0,
      `Packaged collection ${label} returned no hymns`,
    );
    await collectionFilter.locator(".control-select-trigger").click();
  }
  await collectionFilter
    .getByRole("option", { name: "Semua koleksi", exact: true })
    .click();

  await page.goto(new URL("/kidung/hymn-051A", origin).href);
  await page.getByRole("heading", { name: "Batu Zaman", exact: true }).waitFor({
    state: "visible",
    timeout: 20_000,
  });
  await page
    .getByRole("button", { name: "Tampilkan chord", exact: true })
    .click();
  const unavailableChord = page.locator(".error-panel");
  await unavailableChord.waitFor({ state: "visible", timeout: 10_000 });
  const unavailableChordMessage = await unavailableChord.innerText();
  assert.match(unavailableChordMessage, /Chord belum tersedia/);
  assert.doesNotMatch(
    unavailableChordMessage,
    /Sambungkan internet lalu coba lagi\./,
  );
  assert.equal(
    await unavailableChord.getByRole("button", { name: "Coba lagi" }).count(),
    0,
    "A missing canonical chord must not offer a network retry",
  );
  assert.equal(
    await unavailableChord.getAttribute("role"),
    "status",
    "A missing canonical chord should be announced as informational status",
  );

  const recoveryChordBytes = await readFile(recoveryChordPath);
  const recoveryChordRef = {
    songId: recoveryChordSongId,
    path: recoveryChordItem.path,
    sourceCommit: musicLock.sourceCommit,
    size: recoveryChordItem.size,
    sha256: recoveryChordItem.sha256,
  };
  const recoveryChordCacheKey = `chord/${encodeURIComponent(recoveryChordSongId)}/${recoveryChordItem.sha256}`;
  const recoveryChordIndexKey = "gys-chord-cache-index-v1";
  const recoveryChordRawUrl = rawMusicAssetUrl(
    recoveryChordItem.path,
    musicLock.sourceCommit,
  );
  const recoveryChordUrl = smokeMusicAssetUrl(
    recoveryChordItem.path,
    musicLock.sourceCommit,
  );
  const previousChordCacheState = await page.evaluate(
    async ({ indexKey, songId, blobKey }) => {
      const invoke = window.__TAURI_INTERNALS__?.invoke?.bind(
        window.__TAURI_INTERNALS__,
      );
      if (!invoke) throw new Error("Tauri invoke is unavailable");
      const encodedIndex = await invoke("key_value_get", { key: indexKey });
      const index = encodedIndex ? JSON.parse(encodedIndex) : {};
      const entry = index[songId] ?? null;
      return {
        hadIndex: encodedIndex !== null && encodedIndex !== undefined,
        entry,
        entryBlob: entry ? await invoke("blob_get", { key: entry.key }) : null,
        testBlob: await invoke("blob_get", { key: blobKey }),
      };
    },
    {
      indexKey: recoveryChordIndexKey,
      songId: recoveryChordSongId,
      blobKey: recoveryChordCacheKey,
    },
  );
  let chordRecoveryFetches = 0;
  let chordOfflineFetches = 0;
  let verifiedChordOfflineFetches = 0;
  let legacyChordOfflineFetches = 0;
  let legacyChordUpgradeFetches = 0;
  const chordRecoveryRoute = async (route) => {
    chordRecoveryFetches += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: recoveryChordBytes,
    });
  };
  let chordOfflineRoute;
  let legacyChordUpgradeRoute;
  let resolveChordOfflineFetch;
  const chordOfflineFetchSeen = new Promise((resolve) => {
    resolveChordOfflineFetch = resolve;
  });
  try {
    const corruptedChordBytes = await page.evaluate(
      async ({ ref, indexKey, blobKey, base64 }) => {
        const invoke = window.__TAURI_INTERNALS__?.invoke?.bind(
          window.__TAURI_INTERNALS__,
        );
        if (!invoke) throw new Error("Tauri invoke is unavailable");
        const source = Uint8Array.from(atob(base64), (value) =>
          value.charCodeAt(0),
        );
        const text = new TextDecoder().decode(source);
        const match = /("chord"\s*:\s*")([^"\\]+)(")/.exec(text);
        if (!match) throw new Error("Chord fixture has no chord field");
        const noteIndex = match[2].search(/[A-G]/i);
        if (noteIndex < 0) throw new Error("Chord fixture has no note letter");
        const note = match[2][noteIndex];
        const nextNote = String.fromCharCode(
          ((note.toUpperCase().charCodeAt(0) - 65 + 1) % 7) + 65,
        );
        const token =
          match[2].slice(0, noteIndex) +
          (note === note.toLowerCase() ? nextNote.toLowerCase() : nextNote) +
          match[2].slice(noteIndex + 1);
        const tokenStart = match.index + match[1].length;
        const corruptedText =
          text.slice(0, tokenStart) +
          token +
          text.slice(tokenStart + match[2].length);
        JSON.parse(corruptedText);
        const corrupted = new TextEncoder().encode(corruptedText);
        if (corrupted.byteLength !== ref.size)
          throw new Error("Corrupted chord fixture changed size");
        let binary = "";
        for (const byte of corrupted) binary += String.fromCharCode(byte);
        const encodedBytes = btoa(binary);
        const encodedIndex = await invoke("key_value_get", { key: indexKey });
        const index = encodedIndex ? JSON.parse(encodedIndex) : {};
        const previous = index[ref.songId];
        await invoke("blob_put_atomic", { key: blobKey, bytes: encodedBytes });
        index[ref.songId] = {
          format: 2,
          ref,
          key: blobKey,
          bytes: ref.size,
          pinned: previous?.pinned ?? false,
          lastAccess: previous?.lastAccess ?? 0,
        };
        await invoke("key_value_set", {
          key: indexKey,
          value: JSON.stringify(index),
        });
        return corrupted.byteLength;
      },
      {
        ref: recoveryChordRef,
        indexKey: recoveryChordIndexKey,
        blobKey: recoveryChordCacheKey,
        base64: recoveryChordBytes.toString("base64"),
      },
    );
    assert.equal(corruptedChordBytes, recoveryChordItem.size);
    await context.route(recoveryChordUrl, chordRecoveryRoute);
    await page.reload();
    await page.goto(new URL("/kidung/hymn-001", origin).href);
    await page
      .getByRole("heading", {
        name: "Pujilah Allah Yang Maha Esa",
        exact: true,
      })
      .waitFor({ state: "visible", timeout: 20_000 });
    await ensureChordVisible(page);
    await page.getByText(/Chord diverifikasi dari/).waitFor({
      state: "visible",
      timeout: 30_000,
    });
    assert.equal(chordRecoveryFetches, 1);
    const repairedChordCache = await page.evaluate(
      async ({ indexKey, songId }) => {
        const invoke = window.__TAURI_INTERNALS__?.invoke?.bind(
          window.__TAURI_INTERNALS__,
        );
        if (!invoke) throw new Error("Tauri invoke is unavailable");
        const encodedIndex = await invoke("key_value_get", { key: indexKey });
        const entry = JSON.parse(encodedIndex ?? "{}")[songId];
        const blob = entry
          ? await invoke("blob_get", { key: entry.key })
          : null;
        return {
          format: entry?.format,
          ref: entry?.ref,
          bytes: blob
            ? Uint8Array.from(atob(blob), (value) => value.charCodeAt(0))
            : null,
        };
      },
      { indexKey: recoveryChordIndexKey, songId: recoveryChordSongId },
    );
    assert.equal(repairedChordCache.format, 2);
    assert.equal(repairedChordCache.ref?.size, recoveryChordItem.size);
    assert.equal(repairedChordCache.ref?.sha256, recoveryChordItem.sha256);
    assert.deepEqual(Buffer.from(repairedChordCache.bytes), recoveryChordBytes);

    await context.unroute(recoveryChordUrl, chordRecoveryRoute);
    chordOfflineRoute = async (route) => {
      chordOfflineFetches += 1;
      await route.abort();
      resolveChordOfflineFetch();
    };
    const chordFetchUrls = new Set([recoveryChordUrl, recoveryChordRawUrl]);
    for (const url of chordFetchUrls)
      await context.route(url, chordOfflineRoute);
    await page.reload();
    await page
      .getByRole("heading", {
        name: "Pujilah Allah Yang Maha Esa",
        exact: true,
      })
      .waitFor({ state: "visible", timeout: 20_000 });
    await ensureChordVisible(page);
    await page.getByText(/Chord diverifikasi dari/).waitFor({
      state: "visible",
      timeout: 30_000,
    });
    assert.equal(chordOfflineFetches, 0);

    verifiedChordOfflineFetches = chordOfflineFetches;
    const legacyChordBytes = Buffer.from(
      JSON.stringify(JSON.parse(recoveryChordBytes.toString("utf8"))),
    );
    assert.notEqual(
      legacyChordBytes.byteLength,
      recoveryChordItem.size,
      "Legacy chord fixture must preserve the old normalized-JSON format",
    );
    const seededLegacyChordBytes = await page.evaluate(
      async ({ ref, indexKey, blobKey, base64 }) => {
        const invoke = window.__TAURI_INTERNALS__?.invoke?.bind(
          window.__TAURI_INTERNALS__,
        );
        if (!invoke) throw new Error("Tauri invoke is unavailable");
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index++)
          bytes[index] = binary.charCodeAt(index);
        const encodedIndex = await invoke("key_value_get", { key: indexKey });
        const index = encodedIndex ? JSON.parse(encodedIndex) : {};
        const previous = index[ref.songId];
        await invoke("blob_put_atomic", { key: blobKey, bytes: base64 });
        index[ref.songId] = {
          ref,
          key: blobKey,
          bytes: ref.size,
          pinned: previous?.pinned ?? false,
          lastAccess: previous?.lastAccess ?? 0,
        };
        await invoke("key_value_set", {
          key: indexKey,
          value: JSON.stringify(index),
        });
        return bytes.byteLength;
      },
      {
        ref: recoveryChordRef,
        indexKey: recoveryChordIndexKey,
        blobKey: recoveryChordCacheKey,
        base64: legacyChordBytes.toString("base64"),
      },
    );
    assert.equal(seededLegacyChordBytes, legacyChordBytes.byteLength);
    await page.reload();
    await page
      .getByRole("heading", {
        name: "Pujilah Allah Yang Maha Esa",
        exact: true,
      })
      .waitFor({ state: "visible", timeout: 20_000 });
    await ensureChordVisible(page);
    await page.getByText(/Chord diverifikasi dari/).waitFor({
      state: "visible",
      timeout: 30_000,
    });
    await chordOfflineFetchSeen;
    const expectedChordFallbackFetches = process.env.VITE_BFF_BASE_URL?.trim()
      ? 2
      : 1;
    assert.equal(chordOfflineFetches, expectedChordFallbackFetches);
    legacyChordOfflineFetches = chordOfflineFetches;
    const preservedLegacyChord = await page.evaluate(
      async ({ indexKey, songId }) => {
        const invoke = window.__TAURI_INTERNALS__?.invoke?.bind(
          window.__TAURI_INTERNALS__,
        );
        if (!invoke) throw new Error("Tauri invoke is unavailable");
        const encodedIndex = await invoke("key_value_get", { key: indexKey });
        const entry = JSON.parse(encodedIndex ?? "{}")[songId];
        const blob = entry
          ? await invoke("blob_get", { key: entry.key })
          : null;
        return { format: entry?.format, blob };
      },
      { indexKey: recoveryChordIndexKey, songId: recoveryChordSongId },
    );
    assert.equal(preservedLegacyChord.format, undefined);
    assert.deepEqual(
      Buffer.from(preservedLegacyChord.blob, "base64"),
      legacyChordBytes,
      "Offline revalidation must keep the legacy blob available",
    );

    for (const url of chordFetchUrls)
      await context.unroute(url, chordOfflineRoute);
    legacyChordUpgradeRoute = async (route) => {
      legacyChordUpgradeFetches += 1;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: recoveryChordBytes,
      });
    };
    await context.route(recoveryChordUrl, legacyChordUpgradeRoute);
    await page.reload();
    await page
      .getByRole("heading", {
        name: "Pujilah Allah Yang Maha Esa",
        exact: true,
      })
      .waitFor({ state: "visible", timeout: 20_000 });
    await ensureChordVisible(page);
    await page.waitForFunction(
      async ({ indexKey, songId }) => {
        const invoke = window.__TAURI_INTERNALS__?.invoke?.bind(
          window.__TAURI_INTERNALS__,
        );
        if (!invoke) return false;
        const encodedIndex = await invoke("key_value_get", { key: indexKey });
        return JSON.parse(encodedIndex ?? "{}")[songId]?.format === 2;
      },
      { indexKey: recoveryChordIndexKey, songId: recoveryChordSongId },
      { timeout: 30_000 },
    );
    assert.equal(legacyChordUpgradeFetches, 1);
    const upgradedLegacyChord = await page.evaluate(
      async ({ indexKey, songId }) => {
        const invoke = window.__TAURI_INTERNALS__?.invoke?.bind(
          window.__TAURI_INTERNALS__,
        );
        if (!invoke) throw new Error("Tauri invoke is unavailable");
        const encodedIndex = await invoke("key_value_get", { key: indexKey });
        const entry = JSON.parse(encodedIndex ?? "{}")[songId];
        const blob = entry
          ? await invoke("blob_get", { key: entry.key })
          : null;
        return {
          format: entry?.format,
          ref: entry?.ref,
          bytes: blob
            ? Uint8Array.from(atob(blob), (value) => value.charCodeAt(0))
            : null,
        };
      },
      { indexKey: recoveryChordIndexKey, songId: recoveryChordSongId },
    );
    assert.equal(upgradedLegacyChord.format, 2);
    assert.equal(upgradedLegacyChord.ref?.sha256, recoveryChordItem.sha256);
    assert.deepEqual(
      Buffer.from(upgradedLegacyChord.bytes),
      recoveryChordBytes,
    );
    const hideChordButton = page.getByRole("button", {
      name: "Sembunyikan chord",
      exact: true,
    });
    if (await hideChordButton.count()) await hideChordButton.click();
    await page.waitForFunction(
      () =>
        JSON.parse(
          localStorage.getItem("gys-hymn-chord-visibility-v1") ?? "null",
        )?.songs?.["hymn-001"] === false,
      null,
      { timeout: 10_000 },
    );
    await delay(100);
  } finally {
    await context
      .unroute(recoveryChordUrl, chordRecoveryRoute)
      .catch(() => undefined);
    if (chordOfflineRoute)
      await context
        .unroute(recoveryChordUrl, chordOfflineRoute)
        .catch(() => undefined);
    if (legacyChordUpgradeRoute)
      await context
        .unroute(recoveryChordUrl, legacyChordUpgradeRoute)
        .catch(() => undefined);
    await page
      .evaluate(
        async ({ indexKey, songId, blobKey, previous }) => {
          const invoke = window.__TAURI_INTERNALS__?.invoke?.bind(
            window.__TAURI_INTERNALS__,
          );
          if (!invoke) throw new Error("Tauri invoke is unavailable");
          const encodedIndex = await invoke("key_value_get", { key: indexKey });
          const index = encodedIndex ? JSON.parse(encodedIndex) : {};
          if (previous.entry) index[songId] = previous.entry;
          else delete index[songId];
          if (previous.hadIndex || Object.keys(index).length > 0)
            await invoke("key_value_set", {
              key: indexKey,
              value: JSON.stringify(index),
            });
          else await invoke("key_value_remove", { key: indexKey });
          const restoreBlob = async (key, bytes) => {
            if (bytes === null || bytes === undefined)
              await invoke("blob_remove", { key });
            else await invoke("blob_put_atomic", { key, bytes });
          };
          await restoreBlob(blobKey, previous.testBlob);
          if (previous.entry && previous.entry.key !== blobKey)
            await restoreBlob(previous.entry.key, previous.entryBlob);
        },
        {
          indexKey: recoveryChordIndexKey,
          songId: recoveryChordSongId,
          blobKey: recoveryChordCacheKey,
          previous: previousChordCacheState,
        },
      )
      .catch((error) =>
        console.error("Failed to restore chord smoke cache", error),
      );
  }

  const blockedPdfRequests = [];
  await context.route("**/*", async (route) => {
    const requestUrl = route.request().url();
    if (new URL(requestUrl).origin === origin) return route.continue();
    blockedPdfRequests.push(requestUrl);
    return route.abort();
  });
  await page.goto(new URL("/kidung/hymn-001", origin).href);
  await page
    .getByRole("heading", { name: "Pujilah Allah Yang Maha Esa", exact: true })
    .waitFor({ state: "visible", timeout: 20_000 });
  await page.getByRole("tab", { name: "PDF", exact: true }).click();
  const pdfReader = page.locator(".pdf-reader-hymn");
  await pdfReader.waitFor({ state: "visible", timeout: 30_000 });
  const renderedPdfPage = pdfReader.locator('canvas[data-pdf-rendered="true"]');
  await renderedPdfPage.first().waitFor({ state: "visible", timeout: 45_000 });
  const pdfCanvas = await renderedPdfPage.first().evaluate((canvas) => ({
    width: canvas.width,
    height: canvas.height,
  }));
  assert.ok(
    pdfCanvas.width > 0 && pdfCanvas.height > 0,
    "Packaged hymn-001 PDF canvas rendered without dimensions",
  );
  const pdfDownloadUrl = await pdfReader
    .locator(".pdf-download")
    .getAttribute("href");
  assert.ok(pdfDownloadUrl, "Packaged hymn PDF omitted its download source");
  assert.ok(
    pdfDownloadUrl.startsWith("blob:"),
    "Verified offline PDF was not exposed from its local bytes",
  );
  assert.ok(
    blockedPdfRequests.some((url) => url.includes("raw.githubusercontent.com")),
    "Smoke did not block the remote Fork PDF before testing the local fallback",
  );
  await page.getByRole("button", { name: "Kembali ke lirik" }).click();

  const recoveryPdfAssetUrl = rawMusicAssetUrl(
    recoveryPdfItem.path,
    musicLock.sourceCommit,
  );
  await cachePinnedFile(
    page,
    "gys-music-assets-v1",
    recoveryPdfAssetUrl,
    recoveryPdfPath,
    recoveryPdfItem.size,
    recoveryPdfItem.sha256,
  );
  const corruptedPdfCacheBytes = await page.evaluate(async (url) => {
    const cache = await caches.open("gys-music-assets-v1");
    const response = await cache.match(url);
    if (!response) throw new Error("Pinned PDF cache entry is missing");
    const bytes = new Uint8Array(await response.arrayBuffer());
    bytes[0] ^= 0xff;
    await cache.put(url, new Response(bytes));
    return bytes.byteLength;
  }, recoveryPdfAssetUrl);
  assert.equal(corruptedPdfCacheBytes, recoveryPdfItem.size);
  let pdfRecoveryFetches = 0;
  const pdfRecoveryRoute = async (route) => {
    pdfRecoveryFetches += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/pdf",
      body: await readFile(recoveryPdfPath),
    });
  };
  await context.route(recoveryPdfAssetUrl, pdfRecoveryRoute);
  await page.goto(new URL("/kidung/hymn-051A", origin).href);
  try {
    await page
      .getByRole("heading", { name: "Batu Zaman", exact: true })
      .waitFor({ state: "visible", timeout: 20_000 });
  } catch (error) {
    const visibleText = await page
      .locator("body")
      .innerText()
      .catch(() => "");
    throw new Error(
      `PDF recovery route did not render Batu Zaman at ${page.url()}: ${visibleText.slice(0, 1200)}`,
      { cause: error },
    );
  }
  await page.getByRole("tab", { name: "PDF", exact: true }).click();
  const recoveredPdfReader = page.locator(".pdf-reader-hymn");
  await recoveredPdfReader.waitFor({ state: "visible", timeout: 30_000 });
  await recoveredPdfReader
    .locator('canvas[data-pdf-rendered="true"]')
    .first()
    .waitFor({ state: "visible", timeout: 45_000 });
  assert.equal(pdfRecoveryFetches, 1);
  const repairedPdfCache = await page.evaluate(async (url) => {
    const response = await (
      await caches.open("gys-music-assets-v1")
    ).match(url);
    if (!response) return undefined;
    const bytes = await response.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return {
      size: bytes.byteLength,
      sha256: [...new Uint8Array(digest)]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join(""),
    };
  }, recoveryPdfAssetUrl);
  assert.deepEqual(repairedPdfCache, {
    size: recoveryPdfItem.size,
    sha256: recoveryPdfItem.sha256,
  });
  await context.unroute(recoveryPdfAssetUrl, pdfRecoveryRoute);
  await page.reload();
  await page
    .locator('.pdf-reader-hymn canvas[data-pdf-rendered="true"]')
    .first()
    .waitFor({ state: "visible", timeout: 45_000 });
  assert.equal(
    blockedPdfRequests.includes(recoveryPdfAssetUrl),
    false,
    "Offline cached PDF replay attempted to fetch the upstream PDF",
  );
  await page.getByRole("button", { name: "Kembali ke lirik" }).click();
  await context.unroute("**/*");
  await page.goto(new URL("/kidung/hymn-001", origin).href);
  await page
    .getByRole("heading", { name: "Pujilah Allah Yang Maha Esa", exact: true })
    .waitFor({ state: "visible", timeout: 20_000 });
  const hymnTypographySettings = await openHymnTypographySettings(page);
  await hymnTypographySettings
    .getByRole("button", { name: "Perbesar ukuran teks" })
    .click();
  await hymnTypographySettings
    .getByRole("button", { name: "Lebarkan jarak baris" })
    .click();
  await page.waitForFunction(() => {
    const store = JSON.parse(
      localStorage.getItem("gys-hymn-typography-v1") ?? "null",
    );
    const settings = store?.songs?.["hymn-001"];
    return settings?.fontSize === 19 && settings?.lineHeight === 1.75;
  });

  const soundfontRecord = {
    code: soundfont.code,
    kind: soundfont.kind,
    version: soundfont.version,
    releaseTag: soundfont.releaseTag,
    installFileName: soundfont.installFileName,
    packageSizeBytes: soundfont.sizeBytes,
    packageChecksumSha256: soundfont.checksumSha256,
    cacheName: "gys-distributed-v1-GeneralUser-GS-native-smoke",
    cacheKey: `https://gysapp.local/distributed-assets/${encodeURIComponent(soundfont.code)}/${encodeURIComponent(soundfont.version)}`,
    payloadBytes: soundfont.sizeBytes,
    payloadChecksumSha256: soundfont.checksumSha256,
    installedAt: new Date().toISOString(),
  };
  await cachePinnedFile(
    page,
    soundfontRecord.cacheName,
    soundfontRecord.cacheKey,
    soundfontPath,
    soundfontRecord.packageSizeBytes,
    soundfontRecord.packageChecksumSha256,
  );
  await page.evaluate((record) => {
    const registry = JSON.parse(
      localStorage.getItem("gys-distributed-assets-v1") ?? "{}",
    );
    registry[record.code] = record;
    localStorage.setItem("gys-distributed-assets-v1", JSON.stringify(registry));
  }, soundfontRecord);
  await cachePinnedFile(
    page,
    "gys-music-assets-v1",
    smokeMusicAssetUrl(upstreamMidiItem.path, musicLock.sourceCommit),
    upstreamMidiPath,
    upstreamMidiItem.size,
    upstreamMidiItem.sha256,
  );
  await cachePinnedFile(
    page,
    "gys-music-assets-v1",
    smokeMusicAssetUrl(upstreamNextMidiItem.path, musicLock.sourceCommit),
    upstreamNextMidiPath,
    upstreamNextMidiItem.size,
    upstreamNextMidiItem.sha256,
  );
  const midiAssetUrl = smokeMusicAssetUrl(
    upstreamMidiItem.path,
    musicLock.sourceCommit,
  );
  let musicRecoveryFetches = 0;
  const musicRecoveryRoute = async (route) => {
    musicRecoveryFetches += 1;
    return route.fulfill({
      status: 200,
      contentType: "audio/midi",
      body: await readFile(upstreamMidiPath),
    });
  };
  await context.route(midiAssetUrl, musicRecoveryRoute);
  const corruptedMidiCacheBytes = await page.evaluate(async (url) => {
    const cache = await caches.open("gys-music-assets-v1");
    const response = await cache.match(url);
    if (!response) throw new Error("Pinned MIDI cache entry is missing");
    const bytes = new Uint8Array(await response.arrayBuffer());
    bytes[0] ^= 0xff;
    await cache.put(url, new Response(bytes));
    return bytes.byteLength;
  }, midiAssetUrl);
  assert.equal(corruptedMidiCacheBytes, upstreamMidiItem.size);
  await context.addInitScript(() => {
    const stats = {
      activeRenders: new Set(),
      cancelledRenders: 0,
    };
    Object.defineProperty(window, "__gysMidiSmoke", { value: stats });
    const NativeWorker = window.Worker;
    window.Worker = new Proxy(NativeWorker, {
      construct(target, args) {
        const worker = Reflect.construct(target, args);
        if (args[1]?.name !== "gys-fluidsynth-midi") return worker;
        const postMessage = worker.postMessage.bind(worker);
        Object.defineProperty(worker, "postMessage", {
          configurable: true,
          value: (...messageArgs) => {
            const [message] = messageArgs;
            if (message?.type === "render") stats.activeRenders.add(message.id);
            return postMessage(...messageArgs);
          },
        });
        worker.addEventListener("message", (event) => {
          if (event.data?.type === "rendered" || event.data?.type === "error")
            stats.activeRenders.delete(event.data.id);
        });
        const terminate = worker.terminate.bind(worker);
        Object.defineProperty(worker, "terminate", {
          configurable: true,
          value: () => {
            stats.cancelledRenders += stats.activeRenders.size;
            stats.activeRenders.clear();
            return terminate();
          },
        });
        return worker;
      },
    });
  });
  await page.goto(new URL("/kidung/hymn-001", origin).href);
  await page
    .getByRole("button", { name: "Putar MIDI", exact: true })
    .waitFor({ state: "visible", timeout: 20_000 });
  await page.getByRole("button", { name: "Putar MIDI", exact: true }).click();
  const upstreamMidiSurface = page.locator(".media-surface.is-kidung-media");
  await upstreamMidiSurface.waitFor({ state: "visible", timeout: 20_000 });
  const upstreamMidiPrimary = upstreamMidiSurface.locator(
    ".media-primary-control",
  );
  await upstreamMidiPrimary.click();
  await page.waitForFunction(
    () => window.__gysMidiSmoke?.activeRenders.size > 0,
    null,
    { timeout: 20_000, polling: 5 },
  );
  await page.locator(".media-stop-control").click();
  await waitForMidiButtonLabel(page, "Putar", 10_000);
  await page.waitForFunction(
    () => window.__gysMidiSmoke?.cancelledRenders > 0,
    null,
    { timeout: 5_000 },
  );
  const midiCancelledRenders = await page.evaluate(
    () => window.__gysMidiSmoke?.cancelledRenders ?? 0,
  );
  assert.ok(
    midiCancelledRenders > 0,
    "Stopping during FluidSynth rendering did not terminate the active worker",
  );
  const recoveredMidiCache = await page.evaluate(async (url) => {
    const response = await (
      await caches.open("gys-music-assets-v1")
    ).match(url);
    if (!response) return undefined;
    const bytes = await response.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return {
      size: bytes.byteLength,
      sha256: [...new Uint8Array(digest)]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join(""),
    };
  }, midiAssetUrl);
  assert.deepEqual(recoveredMidiCache, {
    size: upstreamMidiItem.size,
    sha256: upstreamMidiItem.sha256,
  });
  assert.equal(musicRecoveryFetches, 1);
  await context.unroute(midiAssetUrl, musicRecoveryRoute);

  const blockedCachedMusicRequests = [];
  const blockedCachedMusicUrls = [
    soundfontRecord.cacheKey,
    midiAssetUrl,
    smokeMusicAssetUrl(upstreamNextMidiItem.path, musicLock.sourceCommit),
  ];
  for (const url of blockedCachedMusicUrls) {
    await context.route(url, async (route) => {
      blockedCachedMusicRequests.push(route.request().url());
      return route.abort();
    });
  }
  await page.reload();
  await page
    .getByRole("button", { name: "Putar MIDI", exact: true })
    .waitFor({ state: "visible", timeout: 20_000 });
  await page.getByRole("button", { name: "Putar MIDI", exact: true }).click();
  await upstreamMidiPrimary.click();
  try {
    await page.waitForFunction(
      () =>
        document
          .querySelector(".media-surface.is-kidung-media")
          ?.getAttribute("data-backend") === "fluidsynth" &&
        document
          .querySelector(
            ".media-surface.is-kidung-media .media-primary-control",
          )
          ?.getAttribute("aria-label") === "Jeda",
      null,
      { timeout: 45_000 },
    );
  } catch (error) {
    const fullTrackCache = await page.evaluate(
      async (urls) => {
        const result = [];
        for (const [cacheName, url] of urls) {
          const response = await (await caches.open(cacheName)).match(url);
          if (!response) {
            result.push({ cacheName, url, present: false });
            continue;
          }
          const bytes = await response.arrayBuffer();
          const digest = await crypto.subtle.digest("SHA-256", bytes);
          result.push({
            cacheName,
            url,
            present: true,
            size: bytes.byteLength,
            sha256: [...new Uint8Array(digest)]
              .map((value) => value.toString(16).padStart(2, "0"))
              .join(""),
          });
        }
        return result;
      },
      [
        ["gys-music-assets-v1", midiAssetUrl],
        [
          "gys-distributed-v1-GeneralUser-GS-native-smoke",
          soundfontRecord.cacheKey,
        ],
      ],
    );
    const fullTrackFailureState = await page.evaluate(() => ({
      playlist: localStorage.getItem("gys-midi-playlist-v1"),
      title: document
        .querySelector(".media-surface .media-context-link strong")
        ?.textContent?.trim(),
      surfaceClass: document.querySelector(".media-surface")?.className,
      transportLabel: document
        .querySelector(".media-transport-controls")
        ?.getAttribute("aria-label"),
      backend: document
        .querySelector(".media-surface")
        ?.getAttribute("data-backend"),
      loadingProgress: document
        .querySelector(".media-loading-progress")
        ?.getAttribute("aria-valuenow"),
      position: document.querySelector(
        '.media-surface input[aria-label="Posisi MIDI"]',
      )?.value,
      duration: document.querySelector(
        '.media-surface input[aria-label="Posisi MIDI"]',
      )?.max,
      button: document
        .querySelector(".media-surface .media-primary-control")
        ?.getAttribute("aria-label"),
      worker: window.__gysMidiSmoke
        ? {
            activeRenders: [...window.__gysMidiSmoke.activeRenders],
            cancelledRenders: window.__gysMidiSmoke.cancelledRenders,
          }
        : null,
      diagnostics: JSON.parse(
        localStorage.getItem("gys-diagnostics-v1") ?? "[]",
      )
        .filter((event) => /midi|kidung/i.test(event.scope))
        .slice(-12),
    }));
    console.error(
      `Native MIDI full-track start failed: ${JSON.stringify({ fullTrackFailureState, fullTrackCache, appExitCode: app.exitCode, appSignalCode: app.signalCode, pageClosed: page.isClosed(), browserConnected: browser.isConnected(), appStderr })}`,
    );
    throw error;
  }
  const upstreamMidiBackend =
    await upstreamMidiSurface.getAttribute("data-backend");
  assert.equal(
    upstreamMidiBackend,
    "fluidsynth",
    "Pinned upstream MIDI did not render through the verified SoundFont",
  );
  const upstreamMidiPosition = upstreamMidiSurface.getByLabel("Posisi MIDI");
  const upstreamMidiDuration = Number(
    await upstreamMidiPosition.getAttribute("max"),
  );
  assert.ok(
    upstreamMidiDuration > 30,
    `Expected a full-length pinned MIDI track, got ${upstreamMidiDuration}s`,
  );
  const firstMidiPosition = Number(await upstreamMidiPosition.inputValue());
  await page.waitForFunction(
    (position) =>
      Number(
        document.querySelector(
          '.media-surface.is-kidung-media input[aria-label="Posisi MIDI"]',
        )?.value,
      ) >
      position + 0.25,
    firstMidiPosition,
    { timeout: 10_000 },
  );
  await upstreamMidiPrimary.click();
  await waitForMidiButtonLabel(page, "Putar", 5_000);
  const pausedMidiPosition = Number(await upstreamMidiPosition.inputValue());
  await page.waitForTimeout(500);
  assert.equal(
    Number(await upstreamMidiPosition.inputValue()),
    pausedMidiPosition,
  );
  await upstreamMidiPrimary.click();
  await waitForMidiButtonLabel(page, "Jeda", 5_000);

  const midiVolume = upstreamMidiSurface.getByLabel("Volume MIDI");
  const initialMidiVolume = Number(await midiVolume.inputValue());
  await midiVolume.focus();
  await midiVolume.press("ArrowLeft");
  assert.ok(Number(await midiVolume.inputValue()) < initialMidiVolume);
  await midiVolume.press("ArrowRight");
  assert.equal(Number(await midiVolume.inputValue()), initialMidiVolume);
  const midiMute = upstreamMidiSurface.locator(".media-mute-control");
  await midiMute.click();
  assert.equal(await midiMute.getAttribute("aria-pressed"), "true");
  await midiMute.click();
  assert.equal(await midiMute.getAttribute("aria-pressed"), "false");

  await upstreamMidiSurface.locator(".media-advanced-summary").click();
  const midiTranspose = upstreamMidiSurface.locator(".media-transpose");
  await midiTranspose.locator("button").last().click();
  await page.waitForFunction(
    () =>
      document.querySelector(
        ".media-surface.is-kidung-media .media-transpose strong",
      )?.textContent === "+1",
    null,
    { timeout: 5_000 },
  );
  await waitForMidiButtonLabel(page, "Jeda");
  await midiTranspose.locator("button").first().click();
  await page.waitForFunction(
    () =>
      document.querySelector(
        ".media-surface.is-kidung-media .media-transpose strong",
      )?.textContent === "0",
    null,
    { timeout: 5_000 },
  );
  await waitForMidiButtonLabel(page, "Jeda");

  const midiInstrument = upstreamMidiSurface.locator(
    ".media-instrument-control select",
  );
  const initialMidiInstrument = await midiInstrument.inputValue();
  await midiInstrument.selectOption("40");
  await page.waitForFunction(
    () =>
      document.querySelector(
        ".media-surface.is-kidung-media .media-instrument-control select",
      )?.value === "40",
    null,
    { timeout: 5_000 },
  );
  await waitForMidiButtonLabel(page, "Jeda");
  await midiInstrument.selectOption(initialMidiInstrument);
  await waitForMidiButtonLabel(page, "Jeda");

  await upstreamMidiSurface.locator(".media-tempo-toggle").click();
  const midiTempo = upstreamMidiSurface.locator(".media-tempo-popover input");
  const initialMidiTempo = Number(await midiTempo.inputValue());
  await midiTempo.focus();
  await midiTempo.press("ArrowRight");
  await page.waitForFunction(
    (tempo) =>
      Number(
        document.querySelector(
          ".media-surface.is-kidung-media .media-tempo-popover input",
        )?.value,
      ) ===
      tempo + 1,
    initialMidiTempo,
    { timeout: 5_000 },
  );
  await waitForMidiButtonLabel(page, "Jeda");
  await midiTempo.press("ArrowLeft");
  await page.waitForFunction(
    (tempo) =>
      Number(
        document.querySelector(
          ".media-surface.is-kidung-media .media-tempo-popover input",
        )?.value,
      ) === tempo,
    initialMidiTempo,
    { timeout: 5_000 },
  );
  await waitForMidiButtonLabel(page, "Jeda");

  await page.locator(".media-stop-control").click();
  await waitForMidiButtonLabel(page, "Putar", 10_000);
  assert.equal(Number(await upstreamMidiPosition.inputValue()), 0);
  await upstreamMidiPrimary.click();
  await waitForMidiButtonLabel(page, "Jeda", 5_000);
  const fullTrackStartPosition = Number(
    await upstreamMidiPosition.inputValue(),
  );
  assert.ok(fullTrackStartPosition < 1);

  await midiTempo.press("End");
  await page.waitForFunction(
    () =>
      Number(
        document.querySelector(
          ".media-surface.is-kidung-media .media-tempo-popover input",
        )?.value,
      ) === 220,
    null,
    { timeout: 5_000 },
  );
  await waitForMidiButtonLabel(page, "Jeda");
  const acceleratedMidiDuration = Number(
    await upstreamMidiPosition.getAttribute("max"),
  );
  assert.ok(
    acceleratedMidiDuration > 30,
    `Tempo 220 produced an implausibly short track: ${acceleratedMidiDuration}s`,
  );
  assert.ok(
    acceleratedMidiDuration < upstreamMidiDuration * 0.9,
    `Tempo 220 did not shorten the ${upstreamMidiDuration}s MIDI track: ${acceleratedMidiDuration}s`,
  );
  const midiFullTrackStartedAt = Date.now();
  await waitForMidiButtonLabel(page, "Putar", 150_000);
  const midiFullTrackMs = Date.now() - midiFullTrackStartedAt;
  assert.ok(
    midiFullTrackMs >= acceleratedMidiDuration * 1000 * 0.9,
    `Pinned track ended before its ${acceleratedMidiDuration}s duration at tempo 220: ${midiFullTrackMs}ms from position ${fullTrackStartPosition}s`,
  );

  await page.evaluate(() => {
    localStorage.setItem(
      "gys-midi-playlist-v1",
      JSON.stringify({
        version: 1,
        items: [
          { songId: "hymn-001", title: "Pujilah Allah Yang Maha Esa" },
          { songId: "hymn-002", title: "Pujilah Allah Yang Mahakudus" },
        ],
        currentIndex: 0,
        loop: "all",
        shuffle: false,
        autoNext: true,
        autoNextMode: "playlist",
        crossfadeMs: 0,
      }),
    );
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Putar MIDI", exact: true })
    .waitFor({ state: "visible", timeout: 20_000 });
  const fullQueueSurface = page.locator(".media-surface.is-kidung-media");
  await page.getByRole("button", { name: "Putar MIDI", exact: true }).click();
  await fullQueueSurface.waitFor({ state: "visible", timeout: 20_000 });
  await fullQueueSurface.locator(".media-primary-control").click();
  try {
    await page.waitForFunction(
      () =>
        document
          .querySelector(".media-surface.is-kidung-media")
          ?.getAttribute("data-backend") === "fluidsynth" &&
        document
          .querySelector(
            ".media-surface.is-kidung-media .media-primary-control",
          )
          ?.getAttribute("aria-label") === "Jeda",
      null,
      { timeout: 45_000 },
    );
  } catch (error) {
    const fullQueueFailureState = await page.evaluate(() => ({
      playlist: localStorage.getItem("gys-midi-playlist-v1"),
      title: document
        .querySelector(".media-surface .media-context-link strong")
        ?.textContent?.trim(),
      surfaceClass: document.querySelector(".media-surface")?.className,
      transportLabel: document
        .querySelector(".media-transport-controls")
        ?.getAttribute("aria-label"),
      backend: document
        .querySelector(".media-surface")
        ?.getAttribute("data-backend"),
      loadingProgress: document
        .querySelector(".media-loading-progress")
        ?.getAttribute("aria-valuenow"),
      position: document.querySelector(
        '.media-surface input[aria-label="Posisi MIDI"]',
      )?.value,
      duration: document.querySelector(
        '.media-surface input[aria-label="Posisi MIDI"]',
      )?.max,
      button: document
        .querySelector(".media-surface .media-primary-control")
        ?.getAttribute("aria-label"),
      worker: window.__gysMidiSmoke
        ? {
            activeRenders: [...window.__gysMidiSmoke.activeRenders],
            cancelledRenders: window.__gysMidiSmoke.cancelledRenders,
          }
        : null,
      diagnostics: JSON.parse(
        localStorage.getItem("gys-diagnostics-v1") ?? "[]",
      )
        .filter((event) => /midi|kidung/i.test(event.scope))
        .slice(-12),
    }));
    console.error(
      `Native MIDI full-queue start failed: ${JSON.stringify({ fullQueueFailureState, appExitCode: app.exitCode, appSignalCode: app.signalCode, pageClosed: page.isClosed(), browserConnected: browser.isConnected(), appStderr })}`,
    );
    throw error;
  }
  const fullQueueFirstPosition = fullQueueSurface.getByLabel("Posisi MIDI");
  const fullQueueFirstDuration = Number(
    await fullQueueFirstPosition.getAttribute("max"),
  );
  const fullQueueFirstStartedAt = Date.now();
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem("gys-midi-playlist-v1") ?? "null")
        ?.currentIndex === 1 &&
      document
        .querySelector(
          ".media-surface.is-kidung-media .media-context-link strong",
        )
        ?.textContent?.trim() === "Pujilah Allah Yang Mahakudus",
    null,
    { timeout: 150_000 },
  );
  const fullQueueFirstMs = Date.now() - fullQueueFirstStartedAt;
  assert.ok(
    fullQueueFirstMs >= fullQueueFirstDuration * 1000 * 0.9,
    `Native queue advanced before hymn-001 completed: ${fullQueueFirstMs}ms for ${fullQueueFirstDuration}s`,
  );
  await page.waitForFunction(
    () =>
      document
        .querySelector(".media-surface.is-kidung-media")
        ?.getAttribute("data-backend") === "fluidsynth" &&
      document
        .querySelector(".media-surface.is-kidung-media .media-primary-control")
        ?.getAttribute("aria-label") === "Jeda",
    null,
    { timeout: 45_000 },
  );
  const fullQueueSecondPosition = fullQueueSurface.getByLabel("Posisi MIDI");
  const fullQueueSecondDuration = Number(
    await fullQueueSecondPosition.getAttribute("max"),
  );
  const fullQueueSecondStartedAt = Date.now();
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem("gys-midi-playlist-v1") ?? "null")
        ?.currentIndex === 0 &&
      document
        .querySelector(
          ".media-surface.is-kidung-media .media-context-link strong",
        )
        ?.textContent?.trim() === "Pujilah Allah Yang Maha Esa" &&
      document
        .querySelector(".media-surface.is-kidung-media .media-primary-control")
        ?.getAttribute("aria-label") === "Jeda",
    null,
    { timeout: 180_000 },
  );
  const fullQueueSecondMs = Date.now() - fullQueueSecondStartedAt;
  assert.ok(
    fullQueueSecondMs >= fullQueueSecondDuration * 1000 * 0.9,
    `Native queue advanced before hymn-002 completed: ${fullQueueSecondMs}ms for ${fullQueueSecondDuration}s`,
  );

  await page.locator(".media-stop-control").click();
  await waitForMidiButtonLabel(page, "Putar", 10_000);
  assert.deepEqual(
    blockedCachedMusicRequests,
    [],
    "Packaged MIDI or SoundFont playback attempted a blocked network fetch",
  );
  for (const url of blockedCachedMusicUrls) await context.unroute(url);

  for (const item of midiItems) {
    await cachePinnedFile(
      page,
      "gys-music-assets-v1",
      rawMusicAssetUrl(item.path, musicLock.sourceCommit),
      midiFiles.get(item.path),
      item.size,
      item.sha256,
    );
  }
  await context.addInitScript((lock) => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.endsWith("/offline/music-lock.json"))
        return Promise.resolve(
          new Response(JSON.stringify(lock), {
            headers: { "content-type": "application/json" },
          }),
        );
      return originalFetch(input, init);
    };
  }, smokeMusicLock);
  await context.addInitScript(() => {
    const marker = "gys-native-midi-smoke-v1";
    if (sessionStorage.getItem(marker)) return;
    localStorage.setItem(
      "gys-midi-playlist-v1",
      JSON.stringify({
        version: 1,
        items: [
          { songId: "hymn-001", title: "Pujilah Allah Yang Maha Esa" },
          { songId: "hymn-002", title: "Pujilah Allah Yang Mahakudus" },
        ],
        currentIndex: 0,
        loop: "all",
        shuffle: false,
        autoNext: true,
        autoNextMode: "playlist",
        crossfadeMs: 0,
      }),
    );
    sessionStorage.setItem(marker, "1");
  });
  await page.goto(new URL("/kidung/hymn-001", origin).href);
  const initialMidiQueue = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("gys-midi-playlist-v1") ?? "null"),
  );
  assert.equal(initialMidiQueue?.currentIndex, 0);
  assert.deepEqual(
    initialMidiQueue?.items?.map((item) => item.songId),
    ["hymn-001", "hymn-002"],
  );
  await page
    .getByRole("button", { name: "Putar MIDI", exact: true })
    .waitFor({ state: "visible", timeout: 20_000 });
  const midiStartedAt = Date.now();
  await page.getByRole("button", { name: "Putar MIDI", exact: true }).click();
  const midiSurface = page.locator(".media-surface.is-kidung-media");
  await midiSurface.waitFor({ state: "visible", timeout: 20_000 });
  await midiSurface.locator(".media-primary-control").click();
  await page.waitForFunction(
    () =>
      ["fluidsynth", "oscillator"].includes(
        document
          .querySelector(".media-surface")
          ?.getAttribute("data-backend") ?? "",
      ),
    null,
    { timeout: 45_000 },
  );
  const midiBackend = await midiSurface.getAttribute("data-backend");
  const midiRenderDiagnostic = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("gys-diagnostics-v1") ?? "[]")
        .filter((event) => event.scope === "midi.fluidsynth")
        .at(-1)?.message,
  );
  assert.equal(
    midiBackend,
    "fluidsynth",
    `Pinned SoundFont did not initialize FluidSynth: ${midiRenderDiagnostic ?? "no diagnostic"}`,
  );
  try {
    await page.waitForFunction(
      () =>
        JSON.parse(localStorage.getItem("gys-midi-playlist-v1") ?? "null")
          ?.currentIndex === 1,
      null,
      { timeout: 20_000 },
    );
  } catch (error) {
    const shortFixtureCache = await page.evaluate(
      async (urls) => {
        const cache = await caches.open("gys-music-assets-v1");
        const result = [];
        for (const url of urls) {
          const response = await cache.match(url);
          if (!response) {
            result.push({ url, present: false });
            continue;
          }
          const bytes = await response.arrayBuffer();
          const digest = await crypto.subtle.digest("SHA-256", bytes);
          result.push({
            url,
            present: true,
            size: bytes.byteLength,
            sha256: [...new Uint8Array(digest)]
              .map((value) => value.toString(16).padStart(2, "0"))
              .join(""),
          });
        }
        return result;
      },
      midiItems.map((item) =>
        rawMusicAssetUrl(item.path, musicLock.sourceCommit),
      ),
    );
    const midiFailureState = await page.evaluate(() => ({
      playlist: localStorage.getItem("gys-midi-playlist-v1"),
      title: document
        .querySelector(".media-surface .media-context-link strong")
        ?.textContent?.trim(),
      backend: document
        .querySelector(".media-surface")
        ?.getAttribute("data-backend"),
      position: document.querySelector(
        '.media-surface input[aria-label="Posisi MIDI"]',
      )?.value,
      duration: document.querySelector(
        '.media-surface input[aria-label="Posisi MIDI"]',
      )?.max,
      button: document
        .querySelector(".media-surface .media-primary-control")
        ?.getAttribute("aria-label"),
      diagnostics: localStorage.getItem("gys-diagnostics-v1"),
    }));
    console.error(
      `Native MIDI first transition failed: ${JSON.stringify({ midiFailureState, shortFixtureCache, appExitCode: app.exitCode, appSignalCode: app.signalCode, pageClosed: page.isClosed(), browserConnected: browser.isConnected(), appStderr })}`,
    );
    throw error;
  }
  const midiNextTitle = midiSurface.locator(".media-context-link strong");
  await midiNextTitle.waitFor({ state: "visible" });
  await page.waitForFunction(
    (title) =>
      document
        .querySelector(".media-surface .media-context-link strong")
        ?.textContent?.trim() === title,
    "Pujilah Allah Yang Mahakudus",
    { timeout: 20_000 },
  );
  assert.equal(
    await midiNextTitle.innerText(),
    "Pujilah Allah Yang Mahakudus",
    "Native MIDI playback did not auto-advance to the next pinned track",
  );
  const midiHeapSession = await context.newCDPSession(page);
  await midiHeapSession.send("HeapProfiler.collectGarbage");
  const midiHeapBefore = await midiHeapSession.send("Runtime.getHeapUsage");
  const midiSoakTransitions = 120;
  for (let transition = 0; transition < midiSoakTransitions; transition += 1) {
    const expectedIndex = transition % 2 === 0 ? 0 : 1;
    try {
      await page.waitForFunction(
        (index) =>
          JSON.parse(localStorage.getItem("gys-midi-playlist-v1") ?? "null")
            ?.currentIndex === index,
        expectedIndex,
        { timeout: 10_000 },
      );
    } catch (error) {
      const playlist = await page
        .evaluate(() => localStorage.getItem("gys-midi-playlist-v1"))
        .catch(() => null);
      console.error(
        `Native MIDI soak failed: ${JSON.stringify({ transition, expectedIndex, playlist, appExitCode: app.exitCode, appSignalCode: app.signalCode, pageClosed: page.isClosed(), browserConnected: browser.isConnected(), appStderr })}`,
      );
      throw error;
    }
  }
  const midiAutoplayMs = Date.now() - midiStartedAt;
  await page.locator(".media-stop-control").click();
  await page.waitForFunction(
    () =>
      document
        .querySelector(".media-surface .media-primary-control")
        ?.getAttribute("aria-label") === "Putar",
    null,
    { timeout: 10_000 },
  );
  await midiHeapSession.send("HeapProfiler.collectGarbage");
  const midiHeapAfter = await midiHeapSession.send("Runtime.getHeapUsage");
  const midiHeapRetainedBytes =
    midiHeapAfter.usedSize +
    midiHeapAfter.embedderHeapUsedSize +
    midiHeapAfter.backingStorageSize -
    midiHeapBefore.usedSize -
    midiHeapBefore.embedderHeapUsedSize -
    midiHeapBefore.backingStorageSize;
  await midiHeapSession.detach();
  assert.ok(
    midiHeapRetainedBytes < 16 * 1024 * 1024,
    `Native MIDI retained ${midiHeapRetainedBytes} bytes after ${midiSoakTransitions} track transitions and stop`,
  );

  const persistenceAdvanced = upstreamMidiSurface.locator(
    ".media-advanced-controls",
  );
  if (!(await persistenceAdvanced.evaluate((element) => element.open)))
    await persistenceAdvanced.locator("summary").click();
  const persistenceTranspose = upstreamMidiSurface.locator(".media-transpose");
  await persistenceTranspose.locator("button").first().click();
  await page.waitForFunction(
    () =>
      document.querySelector(
        ".media-surface.is-kidung-media .media-transpose strong",
      )?.textContent === "-1",
    null,
    { timeout: 5_000 },
  );
  await persistenceTranspose.locator("button").first().click();
  await page.waitForFunction(
    () =>
      document.querySelector(
        ".media-surface.is-kidung-media .media-transpose strong",
      )?.textContent === "-2",
    null,
    { timeout: 5_000 },
  );
  const persistenceInstrument = upstreamMidiSurface.locator(
    ".media-instrument-control select",
  );
  await persistenceInstrument.selectOption("40");
  const persistenceVolume = upstreamMidiSurface.getByLabel("Volume MIDI");
  await persistenceVolume.focus();
  await persistenceVolume.press("ArrowLeft");
  const persistenceTempoToggle = upstreamMidiSurface.locator(
    ".media-tempo-toggle",
  );
  if ((await persistenceTempoToggle.getAttribute("aria-expanded")) !== "true")
    await persistenceTempoToggle.click();
  const persistenceTempo = upstreamMidiSurface.locator(
    ".media-tempo-popover input",
  );
  await persistenceTempo.press("End");
  const persistenceVolumeValue = Number(await persistenceVolume.inputValue());
  await page.waitForFunction(
    ({ volume, transpose, instrument }) => {
      const preferences = JSON.parse(
        localStorage.getItem("gys-midi-preferences-v1") ?? "null",
      );
      return (
        preferences?.volume === volume &&
        preferences?.tempo === 220 &&
        preferences?.tempoOverride === true &&
        preferences?.transpose === transpose &&
        preferences?.instrument === instrument
      );
    },
    { volume: persistenceVolumeValue, transpose: -2, instrument: 40 },
  );
  const routeMidiPreferences = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("gys-midi-preferences-v1") ?? "null"),
  );
  assert.deepEqual(routeMidiPreferences, {
    volume: persistenceVolumeValue,
    muted: false,
    tempo: 220,
    tempoOverride: true,
    transpose: -2,
    instrument: 40,
  });
  const routeSpeechPreferences = await page.evaluate(() => ({
    engine: localStorage.getItem("gys-speech-engine-v1"),
    voice: localStorage.getItem("gys-speech-voice-v1"),
    rate: localStorage.getItem("gys-speech-rate-v1"),
    pitch: localStorage.getItem("gys-speech-pitch-v1"),
    volume: localStorage.getItem("gys-speech-volume-v1"),
  }));
  assert.equal(routeSpeechPreferences.engine, "edge");
  assert.equal(routeSpeechPreferences.voice, "id-ID-GadisNeural");

  await page.goto(
    new URL("/bible?book=43&chapter=3&verse=16&version=b_tb", origin).href,
  );
  await page.getByRole("heading", { name: "Yohanes 3" }).waitFor({
    state: "visible",
    timeout: 20_000,
  });
  await page.waitForFunction(() => {
    try {
      const activity = JSON.parse(
        localStorage.getItem("gys-activity-v1") ?? "null",
      );
      return (
        activity?.bible?.book === "Yohanes" && activity.bible.chapter === 3
      );
    } catch {
      return false;
    }
  });
  await page.goto(new URL("/", origin).href);
  const continueLabel = page.locator('.continue-item[href="/bible"] strong');
  await continueLabel.waitFor({ state: "visible" });
  assert.equal(await continueLabel.innerText(), "Yohanes 3");
  await page.goto(new URL("/iman?item=1", origin).href);
  const faithTopic = page.locator(".faith-modal");
  await faithTopic.waitFor({ state: "visible", timeout: 20_000 });
  await faithTopic
    .getByRole("button", { name: "Catatan pribadi", exact: true })
    .click();
  const faithNotes = page.getByRole("dialog", { name: "Catatan pokok iman" });
  await faithNotes.locator("textarea").fill("Packaged Faith note restore");
  await faithNotes
    .getByRole("button", { name: "Simpan catatan", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      localStorage.getItem("gys-faith-note-1") ===
      "Packaged Faith note restore",
  );
  await page.goto(new URL("/", origin).href);
  await page.getByRole("button", { name: "Bahasa", exact: true }).click();
  await page.getByRole("option", { name: "EN", exact: true }).click();
  await page.getByRole("button", { name: "Theme", exact: true }).click();
  await page.getByRole("option", { name: "Dark", exact: true }).click();
  await page.waitForFunction(() => {
    const settings = JSON.parse(
      localStorage.getItem("gys-shell-settings-v1") ?? "null",
    );
    return (
      settings?.locale === "en" &&
      settings?.theme === "dark" &&
      document.documentElement.getAttribute("data-theme") === "dark"
    );
  });

  await browser.close().catch(() => undefined);
  browser = undefined;
  const previousApp = app;
  assert.equal(
    await closeAppTree(previousApp, false),
    true,
    "Tauri did not exit after Windows requested a graceful close",
  );

  port = await allocateDevToolsPort();
  app = spawn(executable, [], {
    stdio: "ignore",
    env: webView2LaunchEnvironment(profile, port),
  });
  const restoredDevTools = await waitForDevTools(app, port);
  browser = await chromium.connectOverCDP(
    restoredDevTools.webSocketDebuggerUrl,
    { timeout: 30_000 },
  );
  const restoredContext = browser.contexts()[0];
  assert.ok(
    restoredContext,
    "Restarted Tauri did not expose a WebView2 context",
  );
  const restoredPage =
    restoredContext.pages()[0] ?? (await restoredContext.newPage());
  await restoredPage.waitForFunction(
    () => location.href !== "about:blank",
    null,
    {
      timeout: 15_000,
    },
  );
  await restoredPage.locator(".home-grid").waitFor({ state: "visible" });
  const restoredContinueLabel = restoredPage.locator(
    '.continue-item[href="/bible"] strong',
  );
  await restoredContinueLabel.waitFor({ state: "visible" });
  assert.equal(
    await restoredContinueLabel.innerText(),
    "Yohanes 3",
    "Bible Continue history did not survive restarting packaged Tauri",
  );
  assert.equal(
    await restoredPage.locator("html").getAttribute("data-theme"),
    "dark",
    "Theme preference did not survive restarting packaged Tauri",
  );
  assert.equal(
    await restoredPage.evaluate(
      () =>
        JSON.parse(localStorage.getItem("gys-shell-settings-v1") ?? "null")
          ?.locale,
    ),
    "en",
    "Language preference did not survive restarting packaged Tauri",
  );
  assert.deepEqual(
    await restoredPage.evaluate(() => ({
      engine: localStorage.getItem("gys-speech-engine-v1"),
      voice: localStorage.getItem("gys-speech-voice-v1"),
      rate: localStorage.getItem("gys-speech-rate-v1"),
      pitch: localStorage.getItem("gys-speech-pitch-v1"),
      volume: localStorage.getItem("gys-speech-volume-v1"),
    })),
    routeSpeechPreferences,
    "Speech settings did not survive restarting packaged Tauri",
  );
  assert.deepEqual(
    await restoredPage.evaluate(() =>
      JSON.parse(localStorage.getItem("gys-midi-preferences-v1") ?? "null"),
    ),
    routeMidiPreferences,
    "MIDI settings did not survive restarting packaged Tauri",
  );
  await restoredPage
    .getByRole("button", { name: "Language", exact: true })
    .click();
  await restoredPage.getByRole("option", { name: "ID", exact: true }).click();
  await restoredPage.getByRole("button", { name: "Tema", exact: true }).click();
  await restoredPage
    .getByRole("option", { name: "Terang", exact: true })
    .click();
  await restoredPage.waitForFunction(() => {
    const settings = JSON.parse(
      localStorage.getItem("gys-shell-settings-v1") ?? "null",
    );
    return (
      settings?.locale === "id" &&
      settings?.theme === "light" &&
      document.documentElement.getAttribute("data-theme") === "light"
    );
  });
  await restoredPage.evaluate(() => {
    localStorage.setItem("gys-bible-book", "1");
    localStorage.setItem("gys-bible-chapter", "1");
  });
  await restoredPage.goto(new URL("/bible", origin).href);
  await restoredPage
    .getByRole("heading", { name: "Kejadian 1" })
    .waitFor({ state: "visible", timeout: 20_000 });
  const restoredAnnotatedVerse = restoredPage.locator(".verse-row").first();
  await restoredPage.waitForFunction(
    () => document.querySelectorAll(".verse-row").length > 0,
  );
  assert.match(
    (await restoredAnnotatedVerse.getAttribute("class")) ?? "",
    /is-highlight-blue/,
    "Bible highlight did not survive restarting packaged Tauri",
  );
  const restoredCustomVerse = restoredPage.locator(".verse-row").nth(1);
  assert.match(
    (await restoredCustomVerse.getAttribute("class")) ?? "",
    /is-highlight-custom/,
    "Custom Bible highlight did not survive restarting packaged Tauri",
  );
  assert.equal(
    await restoredCustomVerse.evaluate((element) =>
      getComputedStyle(element).getPropertyValue("--verse-highlight-color"),
    ),
    "#ca7231",
    "Custom Bible highlight color did not survive restarting packaged Tauri",
  );
  assert.equal(
    await restoredPage.evaluate(() =>
      JSON.parse(
        localStorage.getItem("gys-bible-highlight-palette-v1") ?? "[]",
      ).includes("#ca7231"),
    ),
    true,
    "Custom Bible highlight palette did not survive restarting packaged Tauri",
  );
  assert.equal(
    await restoredAnnotatedVerse
      .locator(".verse-number")
      .getAttribute("aria-pressed"),
    "true",
    "Bible bookmark did not survive restarting packaged Tauri",
  );
  await restoredAnnotatedVerse.locator(".verse-text").click();
  await restoredPage
    .getByRole("toolbar", { name: "Aksi ayat terpilih" })
    .getByRole("button", { name: "Catatan ayat", exact: true })
    .click();
  const restoredNotesDialog = restoredPage.getByRole("dialog", {
    name: "Catatan ayat",
  });
  await restoredNotesDialog
    .locator(".bible-notes-item")
    .getByText("Packaged annotation restore", { exact: true })
    .waitFor({ state: "visible", timeout: 10_000 });
  await restoredNotesDialog
    .getByRole("button", { name: "Tutup catatan ayat", exact: true })
    .click();
  await restoredPage.goto(new URL("/iman?item=1", origin).href);
  const restoredFaithTopic = restoredPage.locator(".faith-modal");
  await restoredFaithTopic.waitFor({ state: "visible", timeout: 20_000 });
  await restoredFaithTopic
    .getByRole("button", { name: /^Catatan pribadi/ })
    .click();
  const restoredFaithNotes = restoredPage.getByRole("dialog", {
    name: "Catatan pokok iman",
  });
  const restoredFaithNote = restoredFaithNotes.locator("textarea");
  await restoredFaithNote.waitFor({ state: "visible", timeout: 10_000 });
  assert.equal(
    await restoredFaithNote.inputValue(),
    "Packaged Faith note restore",
    "Faith topic note did not survive restarting packaged Tauri",
  );
  await restoredFaithNotes
    .getByRole("button", { name: "Tutup catatan", exact: true })
    .click();
  if (faithPdfProgressAfterRead) {
    await restoredFaithTopic.locator(".faith-read-more").click();
    await restoredPage.waitForFunction(
      () => {
        const phase = document
          .querySelector(".faith-pdf-overlay .pdf-reader")
          ?.getAttribute("data-pdf-loading-phase");
        return phase === "ready" || phase === "error";
      },
      null,
      { timeout: 45_000 },
    );
    assert.equal(
      await restoredPage
        .locator(".faith-pdf-overlay .pdf-reader")
        .getAttribute("data-pdf-loading-phase"),
      "ready",
      "Faith source PDF did not render after packaged restart",
    );
    const restoredFaithPdfPageJump = restoredPage.locator(
      ".faith-pdf-overlay .pdf-page-jump input",
    );
    await restoredFaithPdfPageJump.waitFor({ state: "visible" });
    assert.equal(
      Number(await restoredFaithPdfPageJump.inputValue()),
      faithPdfProgressAfterRead.page,
      "Faith PDF page did not survive restarting packaged Tauri",
    );
    const restoredFaithPdfProgress = await restoredPage.evaluate(() =>
      JSON.parse(localStorage.getItem("gys-faith-pdf-1") ?? "null"),
    );
    assert.deepEqual(
      {
        page: restoredFaithPdfProgress.page,
        totalPages: restoredFaithPdfProgress.totalPages,
      },
      {
        page: faithPdfProgressAfterRead.page,
        totalPages: faithPdfProgressAfterRead.totalPages,
      },
      "Faith PDF progress did not survive restarting packaged Tauri",
    );
  }
  await restoredPage.goto(new URL("/kidung/hymn-001", origin).href);
  await restoredPage
    .getByRole("heading", { name: "Pujilah Allah Yang Maha Esa", exact: true })
    .waitFor({ state: "visible", timeout: 20_000 });
  const lyricsReturn = restoredPage.getByRole("button", {
    name: "Kembali ke lirik",
    exact: true,
  });
  if (await lyricsReturn.count()) await lyricsReturn.click();
  const restoredTypographySettings =
    await openHymnTypographySettings(restoredPage);
  assert.equal(
    await restoredTypographySettings.locator("output").innerText(),
    "19 px",
    "Per-song text size did not survive restarting packaged Tauri",
  );
  const restoredLineHeight = await restoredPage
    .locator(".lyrics-sheet")
    .first()
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return (
        Number.parseFloat(style.lineHeight) / Number.parseFloat(style.fontSize)
      );
    });
  assert.equal(
    restoredLineHeight,
    1.75,
    "Per-song line spacing did not survive restarting packaged Tauri",
  );
  await restoredPage
    .getByRole("button", { name: "Putar MIDI", exact: true })
    .click();
  const restoredMidiSurface = restoredPage.locator(
    ".media-surface.is-kidung-media",
  );
  await restoredMidiSurface.waitFor({ state: "visible", timeout: 20_000 });
  const restoredAdvanced = restoredMidiSurface.locator(
    ".media-advanced-controls",
  );
  if (!(await restoredAdvanced.evaluate((element) => element.open)))
    await restoredAdvanced.locator("summary").click();
  assert.equal(
    Number(await restoredMidiSurface.getByLabel("Volume MIDI").inputValue()),
    routeMidiPreferences.volume,
  );
  assert.equal(
    await restoredMidiSurface
      .locator(".media-instrument-control select")
      .inputValue(),
    String(routeMidiPreferences.instrument),
  );
  assert.equal(
    (
      await restoredMidiSurface.locator(".media-transpose strong").innerText()
    ).trim(),
    String(routeMidiPreferences.transpose),
    "MIDI transpose preference did not survive restarting packaged Tauri",
  );
  const restoredTempoToggle = restoredMidiSurface.locator(
    ".media-tempo-toggle",
  );
  if ((await restoredTempoToggle.getAttribute("aria-expanded")) !== "true")
    await restoredTempoToggle.click();
  assert.equal(
    Number(
      await restoredMidiSurface
        .locator(".media-tempo-popover input")
        .inputValue(),
    ),
    routeMidiPreferences.tempo,
  );

  console.log(
    JSON.stringify({
      runtime: "packaged Tauri WebView2 + websocket plugin",
      freshProfileOfflineShell: "passed",
      offlineShellBlockedRequestCount,
      offlineContentBlockedRequestCount,
      offlineContentRoutes,
      packagedHomeResilience,
      sauhRecoveryAfterNetworkRestore: "passed",
      recoveredSauhTitle,
      homeReadyMs,
      bibleReadyMs,
      bibleBroadSearch: "passed",
      bibleSearchMs,
      bibleSearchBudgetMs: BIBLE_BROAD_SEARCH_BUDGET_MS,
      bibleSearchInitialResults: 40,
      bibleSearchExpandedResults: bibleExpandedSearchResults,
      abortedSynthesis: true,
      selectedVoice: "id-ID-GadisNeural",
      localTtsPlayback: localSpeechPlayback,
      receivedAudio: audio.find((event) =>
        /Received [1-9]\d* audio bytes/.test(event.message),
      )?.message,
      playedAudio: playback.find((event) =>
        /Playing [1-9]\d* audio bytes/.test(event.message),
      )?.message,
      pauseResumeStop: "passed",
      repeatRequest: "passed",
      missingChordState: "passed",
      nativeChordCacheRecovery:
        "same-size corruption refetched and source SHA verified",
      nativeChordCacheRecoveryFetches: chordRecoveryFetches,
      nativeChordCacheOfflineReplay: "passed without source fetch",
      nativeChordCacheOfflineFetches: verifiedChordOfflineFetches,
      nativeLegacyChordOfflineRead:
        "legacy entry retained after blocked revalidation",
      nativeLegacyChordOfflineFetches: legacyChordOfflineFetches,
      nativeLegacyChordCacheUpgrade:
        "normalized cache upgraded to pinned raw bytes",
      nativeLegacyChordCacheUpgradeFetches: legacyChordUpgradeFetches,
      installedHymnalCollections: collectionLabels.slice(1),
      packagedCollectionFilter: "passed",
      packagedBibleAnnotationsRestart: "passed",
      packagedFaithNoteRestart: "passed",
      packagedFaithPdfProgressRestart: faithPdfProgressAfterRead
        ? {
            page: faithPdfProgressAfterRead.page,
            totalPages: faithPdfProgressAfterRead.totalPages,
          }
        : "skipped: BFF base is not configured",
      packagedCustomHighlightPaletteRestart: "passed",
      packagedHymnTypographyRestart: "passed",
      packagedShellPreferencesRestart: "passed",
      routeSpecificAudioPreferencesRestart:
        "TTS voice/engine and MIDI volume/tempo/transpose/instrument passed",
      pdfOfflineFallback: "passed",
      pdfCanvas,
      midiBackend,
      upstreamMidiBackend,
      cachedMidiAndSoundFontOffline: "passed",
      nativeMidiCacheRecovery:
        "same-size corruption rejected, evicted, refetched and repaired",
      nativeMidiCacheRecoveryFetches: musicRecoveryFetches,
      nativeMidiRealTrackProgress: `${upstreamMidiDuration}s track played and paused/resumed`,
      nativeMidiControls:
        "volume, mute, tempo, transpose and instrument passed",
      nativeMidiCancelledRenders: midiCancelledRenders,
      nativeMidiFullTrackMs: midiFullTrackMs,
      nativeMidiAcceleratedDuration: acceleratedMidiDuration,
      nativeMidiFullTrack: "passed at 220 BPM",
      nativeMidiFullQueue: "two full upstream tracks auto-advanced at 220 BPM",
      nativeMidiFullQueueFirstTrackMs: fullQueueFirstMs,
      nativeMidiFullQueueSecondTrackMs: fullQueueSecondMs,
      midiAutoAdvance: "passed",
      midiAutoplayMs,
      midiSoakTransitions,
      midiHeapRetainedBytes,
      bibleHistoryRestart: "passed",
    }),
  );
} finally {
  await browser?.close().catch(() => undefined);
  await closeAppTree(app);
  const temporaryRoot = resolve(tmpdir());
  const profileRelative = relative(temporaryRoot, resolve(profile));
  if (
    profileRelative &&
    profileRelative !== ".." &&
    !profileRelative.startsWith(`..${sep}`) &&
    !isAbsolute(profileRelative)
  )
    await rm(profile, { recursive: true, force: true }).catch(() => undefined);
}
