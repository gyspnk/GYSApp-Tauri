import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { launchNative, nativeRoute } from "./native-session.mjs";

const executable = resolve(
  process.argv[2] ?? "../native/src-tauri/target/release/gysapp-native.exe",
);
const samples = Number(process.env.GYS_NATIVE_BENCHMARK_SAMPLES ?? 30);
assert.ok(
  Number.isInteger(samples) && samples >= 5 && samples <= 100,
  "Native samples must be 5..100; release evidence requires >=30",
);
const profile = await mkdtemp(resolve(tmpdir(), "gysapp-benchmark-"));
const runs = [];
let session;
let previousMode;
async function marked(page, marker) {
  try {
    await page.waitForFunction(
      (name) => performance.getEntriesByName(name).length > 0,
      marker,
      { timeout: 15000, polling: 100 },
    );
  } catch (error) {
    const diagnostic = await page
      .evaluate(() => ({
        url: location.href,
        readyState: document.readyState,
        visibility: document.visibilityState,
        root: document.querySelector("#root")?.textContent?.slice(0, 1200),
        body: document.body?.textContent?.slice(0, 1200),
        marks: performance.getEntriesByType("mark").map((entry) => entry.name),
        resources: performance
          .getEntriesByType("resource")
          .map((entry) => entry.name),
      }))
      .catch(() => ({ unavailable: true }));
    console.error(JSON.stringify({ marker, diagnostic }));
    throw error;
  }
  return page.evaluate(
    (name) => ({
      origin: performance.timeOrigin,
      elapsed: performance.getEntriesByName(name).at(-1).startTime,
    }),
    marker,
  );
}
function summary(key) {
  const values = runs
    .map((run) => run[key])
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const percentile = (fraction) => {
    if (!values.length) return null;
    const i = (values.length - 1) * fraction,
      lower = Math.floor(i);
    return (
      values[lower] +
      ((values[Math.ceil(i)] ?? values[lower]) - values[lower]) * (i - lower)
    );
  };
  return {
    measured: values.length,
    medianMs: percentile(0.5),
    p95Ms: percentile(0.95),
  };
}
function memorySummary(key) {
  const values = runs
    .map((row) => row.processMemory[key])
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const percentile = (fraction) => {
    if (!values.length) return null;
    const index = (values.length - 1) * fraction;
    const low = Math.floor(index);
    return (
      values[low] + (values[Math.ceil(index)] - values[low]) * (index - low)
    );
  };
  return {
    measured: values.length,
    medianBytes: percentile(0.5),
    p95Bytes: percentile(0.95),
  };
}
try {
  for (let run = 0; run < samples; run++) {
    session = await launchNative(executable, profile);
    const { page, context } = session;
    assert.equal(
      await page.evaluate(async () =>
        "serviceWorker" in navigator
          ? (await navigator.serviceWorker.getRegistrations()).length
          : 0,
      ),
      0,
      "Packaged native must not depend on a browser shell worker",
    );
    const shell = await marked(page, "gys-shell-ready");
    const home = await marked(page, "gys-home-ready");
    const origin = await page.evaluate(() => location.origin);
    await context.route(/^https?:\/\//, (route) =>
      new URL(route.request().url()).origin === origin
        ? route.continue()
        : route.abort(),
    );
    const row = {
      run: run + 1,
      profileMode: session.profileMode,
      processShellMs: shell.origin + shell.elapsed - session.startedAt,
      processGreetingMs: home.origin + home.elapsed - session.startedAt,
    };
    for (const [route, marker, key] of [
      ["/", "gys-home-ready", "offlineGreetingMs"],
      ["/kidung", "gys-hymn-catalog-ready", "catalogMs"],
      ["/bible", "gys-bible-chapter-ready", "chapterMs"],
    ]) {
      await page.goto(nativeRoute(route, origin));
      row[key] = (await marked(page, marker)).elapsed;
    }
    await page.locator(".reader-search-btn").click();
    const form = page.locator(".bible-search");
    for (const [query, key] of [
      ["Allah", "firstSearchMs"],
      ["kasih", "indexedSearchMs"],
    ]) {
      await page.evaluate(() => {
        performance.clearMarks("gys-bible-search-ready");
        performance.clearMarks("gys-bible-search-start");
      });
      await form.locator("#bible-query").fill(query);
      await form.locator("button[type='submit']").click();
      await marked(page, "gys-bible-search-ready");
      row[key] = await page.evaluate(
        () =>
          performance.getEntriesByName("gys-bible-search-ready").at(-1)
            .startTime -
          performance.getEntriesByName("gys-bible-search-start").at(-1)
            .startTime,
      );
      assert.ok(await page.locator(".result-item").count());
    }
    previousMode = await page.evaluate(() =>
      localStorage.getItem("gys-hymn-view-mode-v1"),
    );
    await page.evaluate(() =>
      localStorage.setItem(
        "gys-hymn-view-mode-v1",
        JSON.stringify({ version: 1, modes: { "hymn-001": "pdf" } }),
      ),
    );
    await page.goto(nativeRoute("/kidung/hymn-001", origin));
    row.pdfFirstPageMs = (await marked(page, "gys-pdf-page-ready")).elapsed;
    await page
      .locator(".pdf-reader canvas[data-pdf-rendered='true']")
      .first()
      .waitFor({ state: "visible" });
    const cdp = await context.newCDPSession(page);
    const heap = await cdp.send("Runtime.getHeapUsage");
    row.rendererHeapBytes = heap.usedSize;
    row.audioFirstSampleMs = null; // A rendered control does not prove a hardware audio sample.
    const rootPid = session.app.pid;
    const memory = JSON.parse(
      execFileSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          `$ids = [System.Collections.Generic.HashSet[int]]::new(); [void]$ids.Add(${rootPid}); $all = Get-CimInstance Win32_Process; do { $added = $false; foreach ($p in $all) { if ($ids.Contains([int]$p.ParentProcessId) -and $ids.Add([int]$p.ProcessId)) { $added = $true } } } while ($added); $stats = $ids | ForEach-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue }; @{ processCount = @($stats).Count; privateBytesSum = ($stats | Measure-Object PrivateMemorySize64 -Sum).Sum; workingSetBytesSum = ($stats | Measure-Object WorkingSet64 -Sum).Sum } | ConvertTo-Json -Compress`,
        ],
        { encoding: "utf8", timeout: 15000, windowsHide: true },
      ),
    );
    row.processMemory = memory;
    await page.evaluate((value) => {
      if (value === null) localStorage.removeItem("gys-hymn-view-mode-v1");
      else localStorage.setItem("gys-hymn-view-mode-v1", value);
    }, previousMode);
    previousMode = undefined;
    runs.push(row);
    console.log(
      `[native-benchmark] sample ${run + 1}/${samples} shell=${row.processShellMs.toFixed(1)}ms`,
    );
    await session.close();
    session = undefined;
  }
  const metrics = Object.fromEntries(
    [
      "processShellMs",
      "processGreetingMs",
      "offlineGreetingMs",
      "catalogMs",
      "chapterMs",
      "firstSearchMs",
      "indexedSearchMs",
      "pdfFirstPageMs",
      "audioFirstSampleMs",
    ].map((key) => [key, summary(key)]),
  );
  const result = {
    runtime: "packaged Windows/WebView2",
    condition:
      "OS process relaunch with same app profile; offline local-content navigations after launch",
    samples,
    metrics,
    memory: {
      rendererHeapBytes: (() => {
        const { measured, medianMs, p95Ms } = summary("rendererHeapBytes");
        return { measured, medianBytes: medianMs, p95Bytes: p95Ms };
      })(),
      privateBytes: memorySummary("privateBytesSum"),
      workingSetBytes: memorySummary("workingSetBytesSum"),
    },
    runs,
    exclusions: [
      "Not a cold OS/filesystem cache or reference physical-device benchmark",
      "Fresh app-data/first signed installation is not isolated by the runner debugging policy",
      "Audio first physical sample is unmeasured; full playback is verified separately",
      "Process working-set sum can count shared pages; private byte sum is reported separately",
    ],
  };
  const output =
    process.env.GYS_NATIVE_BENCHMARK_OUTPUT ?? "native-benchmark.json";
  await writeFile(output, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ output, ...result, runs: undefined }));
} finally {
  if (session && previousMode !== undefined)
    await session.page
      .evaluate((value) => {
        if (value === null) localStorage.removeItem("gys-hymn-view-mode-v1");
        else localStorage.setItem("gys-hymn-view-mode-v1", value);
      }, previousMode)
      .catch(() => undefined);
  await session?.close();
  await rm(profile, { recursive: true, force: true }).catch(() => undefined);
}
