import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, resolve, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "@playwright/test";

assert.equal(process.platform, "win32", "This smoke requires Windows");
const [baselineExe, currentExe] = process.argv
  .slice(2)
  .map((path) => resolve(path));
assert.ok(
  baselineExe && currentExe,
  "Pass baseline and current executable paths",
);

const profile = await mkdtemp(resolve(tmpdir(), "gysapp-profile-upgrade-"));
const profiles = [profile];
let active;

async function allocatePort() {
  const server = createServer();
  await new Promise((ok, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", ok);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  await new Promise((ok, fail) =>
    server.close((error) => (error ? fail(error) : ok())),
  );
  return address.port;
}

async function launch(executable, userDataFolder = profile) {
  const port = await allocatePort();
  const app = spawn(executable, [], {
    stdio: "ignore",
    env: {
      ...process.env,
      WEBVIEW2_USER_DATA_FOLDER: userDataFolder,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-allow-origins=*`,
    },
  });
  active = { app, browser: undefined };
  const deadline = Date.now() + 30_000;
  let endpoint;
  while (Date.now() < deadline) {
    if (app.exitCode !== null)
      throw new Error(`${executable} exited early (${app.exitCode})`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) {
        endpoint = await response.json();
        break;
      }
    } catch {
      // WebView2 exposes DevTools after creating its first window.
    }
    await delay(250);
  }
  assert.ok(endpoint, `Timed out waiting for ${executable} WebView2`);
  const browser = await chromium.connectOverCDP(endpoint.webSocketDebuggerUrl, {
    timeout: 30_000,
  });
  active.browser = browser;
  const context = browser.contexts()[0];
  assert.ok(context, "Tauri did not expose a WebView2 context");
  const page = context.pages()[0] ?? (await context.newPage());
  await page.waitForFunction(() => location.href !== "about:blank", null, {
    timeout: 15_000,
  });
  await page.locator("html").waitFor({ state: "visible" });
  return { app, browser, page };
}

async function closeActive() {
  if (!active) return;
  const { app, browser } = active;
  await browser?.close().catch(() => undefined);
  if (app.exitCode === null && app.pid) {
    const closer = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `$process = [System.Diagnostics.Process]::GetProcessById(${app.pid}); if (-not $process.CloseMainWindow()) { exit 1 }`,
      ],
      { stdio: "ignore", windowsHide: true },
    );
    await new Promise((ok, fail) => {
      closer.once("error", fail);
      closer.once("exit", (code) =>
        code === 0 ? ok() : fail(new Error("Could not request graceful close")),
      );
    });
    const deadline = Date.now() + 10_000;
    while (app.exitCode === null && Date.now() < deadline) await delay(100);
  }
  assert.notEqual(
    app.exitCode,
    null,
    "Tauri remained open after graceful close",
  );
  active = undefined;
}

try {
  const baseline = await launch(baselineExe);
  console.log(JSON.stringify({ phase: "baseline-launched" }));
  const origin = await baseline.page.evaluate(() => location.origin);
  const seed = {
    shell: JSON.stringify({ version: 1, locale: "en", theme: "dark" }),
    ui: JSON.stringify({ version: 1, density: "compact", font: "sans" }),
    marker: "baseline-to-current-profile-continuity",
  };
  await baseline.page.evaluate((values) => {
    localStorage.setItem("gys-shell-settings-v1", values.shell);
    localStorage.setItem("gys-ui-preferences-v1", values.ui);
    localStorage.setItem("gys-profile-upgrade-smoke-marker-v1", values.marker);
  }, seed);
  await baseline.page.reload();
  await baseline.page.waitForFunction(
    () =>
      document.documentElement.dataset.theme === "dark" &&
      document.documentElement.dataset.uiDensity === "compact",
  );
  console.log(JSON.stringify({ phase: "baseline-settings-applied", origin }));
  const baselineState = await baseline.page.evaluate(() => ({
    origin: location.origin,
    shell: localStorage.getItem("gys-shell-settings-v1"),
    ui: localStorage.getItem("gys-ui-preferences-v1"),
    marker: localStorage.getItem("gys-profile-upgrade-smoke-marker-v1"),
  }));
  assert.equal(baselineState.origin, origin);
  console.log(JSON.stringify({ phase: "baseline-state", baselineState }));
  await closeActive();
  console.log(JSON.stringify({ phase: "baseline-closed" }));

  const current = await launch(currentExe);
  console.log(JSON.stringify({ phase: "current-launched" }));
  await current.page.locator(".home-grid").waitFor({
    state: "visible",
    timeout: 30_000,
  });
  const currentInitialState = await current.page.evaluate(() => ({
    origin: location.origin,
    theme: document.documentElement.dataset.theme ?? null,
    density: document.documentElement.dataset.uiDensity ?? null,
    shell: localStorage.getItem("gys-shell-settings-v1"),
    ui: localStorage.getItem("gys-ui-preferences-v1"),
    marker: localStorage.getItem("gys-profile-upgrade-smoke-marker-v1"),
  }));
  console.log(
    JSON.stringify({ phase: "current-initial-state", currentInitialState }),
  );
  await current.page.waitForFunction(
    () =>
      document.documentElement.dataset.theme === "dark" &&
      document.documentElement.dataset.uiDensity === "compact",
    null,
    { timeout: 15_000 },
  );
  const currentState = await current.page.evaluate(() => ({
    origin: location.origin,
    shell: localStorage.getItem("gys-shell-settings-v1"),
    ui: localStorage.getItem("gys-ui-preferences-v1"),
    marker: localStorage.getItem("gys-profile-upgrade-smoke-marker-v1"),
  }));
  assert.deepEqual(currentState, baselineState);
  console.log(
    JSON.stringify(
      { profileContinuity: "passed", baselineState, currentState },
      null,
      2,
    ),
  );
  await closeActive();
  console.log(JSON.stringify({ phase: "current-closed" }));

  const coldProfile = await mkdtemp(resolve(tmpdir(), "gysapp-cold-start-"));
  profiles.push(coldProfile);
  assert.deepEqual(
    await readdir(coldProfile),
    [],
    "Cold-start profile was not empty",
  );
  const firstLaunch = await launch(currentExe, coldProfile);
  await firstLaunch.page.locator(".home-grid").waitFor({
    state: "visible",
    timeout: 30_000,
  });
  const firstPaint = await firstLaunch.page.evaluate(() => ({
    origin: location.origin,
    theme: document.documentElement.dataset.theme ?? null,
    density: document.documentElement.dataset.uiDensity ?? null,
    locale:
      JSON.parse(localStorage.getItem("gys-shell-settings-v1") ?? "null")
        ?.locale ?? null,
    marker: localStorage.getItem("gys-profile-upgrade-smoke-marker-v1"),
  }));
  assert.equal(firstPaint.origin, "http://tauri.localhost");
  assert.equal(firstPaint.theme, "light");
  assert.equal(firstPaint.density, "standard");
  assert.equal(firstPaint.locale, "id");
  assert.equal(firstPaint.marker, null);
  console.log(
    JSON.stringify({
      coldStartFirstPaint: "passed",
      profileWasEmpty: true,
      firstPaint,
    }),
  );
  await closeActive();
} finally {
  if (active) await closeActive();
  const tempRoot = resolve(tmpdir());
  for (const ownedProfile of profiles) {
    const absoluteProfile = resolve(ownedProfile);
    assert.ok(isAbsolute(absoluteProfile));
    assert.ok(absoluteProfile.startsWith(`${tempRoot}${sep}`));
    assert.match(
      absoluteProfile,
      /[\\/]gysapp-(?:profile-upgrade|cold-start)-[^\\/]+$/,
    );
    await rm(absoluteProfile, { recursive: true, force: true }).catch(
      (error) => {
        console.warn(
          JSON.stringify({
            phase: "temporary-profile-retained",
            profile: absoluteProfile,
            error: error.message,
          }),
        );
      },
    );
  }
}
