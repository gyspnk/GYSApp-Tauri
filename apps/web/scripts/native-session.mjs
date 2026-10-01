import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "@playwright/test";

export async function allocatePort() {
  const listener = createServer();
  await new Promise((ok, fail) => {
    listener.once("error", fail);
    listener.listen(0, "127.0.0.1", ok);
  });
  const { port } = listener.address();
  await new Promise((ok, fail) =>
    listener.close((error) => (error ? fail(error) : ok())),
  );
  return port;
}

export async function launchNative(executable, profile) {
  assert.equal(
    process.platform,
    "win32",
    "Packaged native verification requires Windows/WebView2",
  );
  const policyPort = Number(process.env.GYS_WEBVIEW2_POLICY_DEBUG_PORT);
  const policy =
    Number.isInteger(policyPort) && policyPort > 0 && policyPort <= 65535;
  const port = policy ? policyPort : await allocatePort();
  const env = { ...process.env };
  if (policy)
    for (const key of [
      "WEBVIEW2_USER_DATA_FOLDER",
      "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
      "WEBVIEW2_BROWSER_EXECUTABLE_FOLDER",
      "WEBVIEW2_CHANNEL_SEARCH_KIND",
      "WEBVIEW2_RELEASE_CHANNELS",
    ])
      delete env[key];
  else {
    env.WEBVIEW2_USER_DATA_FOLDER = profile;
    env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = `--remote-debugging-port=${port} --remote-allow-origins=*`;
  }
  const startedAt = Date.now();
  const app = spawn(executable, [], { stdio: "ignore", env });
  let browser;
  const close = async () => {
    await browser?.close().catch(() => undefined);
    if (app.exitCode === null && app.pid) {
      await new Promise((ok) => {
        const closer = spawn(
          "powershell.exe",
          [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            `$p = [System.Diagnostics.Process]::GetProcessById(${app.pid}); if (-not $p.CloseMainWindow()) { exit 1 }`,
          ],
          { stdio: "ignore", windowsHide: true },
        );
        closer.once("error", ok);
        closer.once("exit", ok);
      });
      const deadline = Date.now() + 10000;
      while (app.exitCode === null && Date.now() < deadline) await delay(100);
      if (app.exitCode === null)
        await new Promise((ok) => {
          const killer = spawn(
            "taskkill.exe",
            ["/PID", String(app.pid), "/T", "/F"],
            { stdio: "ignore", windowsHide: true },
          );
          killer.once("error", ok);
          killer.once("exit", ok);
        });
    }
  };
  try {
    const deadline = Date.now() + 30000;
    let endpoint;
    while (Date.now() < deadline) {
      if (app.exitCode !== null)
        throw new Error(`Tauri exited early: ${app.exitCode}`);
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/version`);
        if (response.ok) {
          endpoint = await response.json();
          break;
        }
      } catch {}
      await delay(100);
    }
    assert.ok(endpoint, "WebView2 DevTools did not start");
    browser = await chromium.connectOverCDP(endpoint.webSocketDebuggerUrl, {
      timeout: 30000,
    });
    const context = browser.contexts()[0];
    assert.ok(context, "Missing WebView2 context");
    const page = context.pages()[0] ?? (await context.newPage());
    await page.bringToFront();
    await page.waitForFunction(() => location.origin !== "null", null, {
      timeout: 15000,
    });
    return {
      app,
      browser,
      context,
      page,
      startedAt,
      profileMode: policy
        ? "runner-default-profile"
        : "requested-isolated-webview-profile",
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}

export function nativeRoute(path, origin) {
  const [pathname, query] = path.split("?", 2);
  const url = new URL("/", origin);
  url.searchParams.set("p", pathname);
  if (query) url.searchParams.set("q", query);
  return url.href;
}
