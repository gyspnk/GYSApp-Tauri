import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";

const samples = Number(process.env.GYS_PERF_SAMPLES ?? 30);
assert.ok(Number.isInteger(samples) && samples >= 30 && samples <= 100);
const base =
  process.env.GYS_BENCHMARK_BASE ?? "http://127.0.0.1:4173/GYSApp-Tauri";
const runs = [];
async function mark(page, name) {
  await page.waitForFunction(
    (name) => performance.getEntriesByName(name).length > 0,
    name,
    { timeout: 20000 },
  );
  return page.evaluate(
    (name) => performance.getEntriesByName(name).at(-1).startTime,
    name,
  );
}
async function collect(page, condition, run) {
  const row = { condition, run };
  await page.goto(`${base}/`);
  row.shellMs = await mark(page, "gys-shell-ready");
  row.greetingMs = await mark(page, "gys-home-ready");
  await page.goto(`${base}/kidung`);
  row.catalogMs = await mark(page, "gys-hymn-catalog-ready");
  await page.goto(`${base}/bible`);
  row.chapterMs = await mark(page, "gys-bible-chapter-ready");
  await page.locator(".reader-search-btn").click();
  for (const [query, key] of [
    ["Allah", "firstSearchMs"],
    ["kasih", "indexedSearchMs"],
  ]) {
    await page.evaluate(() => {
      performance.clearMarks("gys-bible-search-ready");
      performance.clearMarks("gys-bible-search-start");
    });
    await page.locator("#bible-query").fill(query);
    await page.locator(".bible-search button[type='submit']").click();
    await mark(page, "gys-bible-search-ready");
    row[key] = await page.evaluate(
      () =>
        performance.getEntriesByName("gys-bible-search-ready").at(-1)
          .startTime -
        performance.getEntriesByName("gys-bible-search-start").at(-1).startTime,
    );
    assert.ok(await page.locator(".result-item").count());
  }
  await page.evaluate(() =>
    localStorage.setItem(
      "gys-hymn-view-mode-v1",
      JSON.stringify({ version: 1, modes: { "hymn-001": "pdf" } }),
    ),
  );
  await page.goto(`${base}/kidung/hymn-001`);
  row.pdfFirstPageMs = await mark(page, "gys-pdf-page-ready");
  await page
    .locator("canvas[data-pdf-rendered='true']")
    .first()
    .waitFor({ state: "visible" });
  const cdp = await page.context().newCDPSession(page);
  row.rendererHeapBytes = (await cdp.send("Runtime.getHeapUsage")).usedSize;
  await cdp.detach();
  row.audioFirstSampleMs = null;
  runs.push(row);
}
function summarize(rows, key) {
  const values = rows
    .map((row) => row[key])
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const quantile = (fraction) => {
    if (!values.length) return null;
    const index = (values.length - 1) * fraction;
    const low = Math.floor(index);
    return (
      values[low] + (values[Math.ceil(index)] - values[low]) * (index - low)
    );
  };
  return {
    measured: values.length,
    median: quantile(0.5),
    p95: quantile(0.95),
  };
}
let browser;
try {
  for (const condition of [
    "fresh-browser-process-and-profile",
    "fresh-context-same-browser",
    "warm-same-profile",
    "prepared-offline-same-profile",
  ]) {
    browser = await chromium.launch();
    let context;
    for (let run = 1; run <= samples; run++) {
      if (condition === "fresh-browser-process-and-profile" && run > 1) {
        await browser.close();
        browser = await chromium.launch();
      }
      if (!context || condition.startsWith("fresh-")) {
        context = await browser.newContext({ serviceWorkers: "allow" });
        // Remote feeds are separate provider evidence and cannot distort local-content latency.
        await context.route(/^https?:\/\//, (route) =>
          new URL(route.request().url()).origin === new URL(base).origin
            ? route.continue()
            : route.abort(),
        );
      }
      const page = await context.newPage();
      if (
        ["prepared-offline-same-profile", "warm-same-profile"].includes(
          condition,
        ) &&
        run === 1
      ) {
        await collect(page, "offline-preparation-excluded", 0);
        runs.pop();
        await page.evaluate(async () => {
          await navigator.serviceWorker.ready;
        });
        await page.waitForFunction(() =>
          Boolean(navigator.serviceWorker.controller),
        );
        if (condition === "prepared-offline-same-profile")
          await context.setOffline(true);
      }
      try {
        await collect(page, condition, run);
      } catch (error) {
        console.error(
          condition,
          run,
          (await page.locator("body").innerText()).slice(-1200),
        );
        throw error;
      }
      await page.close();
      if (condition.startsWith("fresh-")) {
        await context.close();
        context = undefined;
      }
      if (run % 10 === 0)
        console.log(`[browser-benchmark] ${condition}: ${run}/${samples}`);
    }
    await context?.close();
    await browser.close();
    browser = undefined;
  }
  const conditions = Object.fromEntries(
    [...new Set(runs.map((row) => row.condition))].map((condition) => {
      const rows = runs.filter((row) => row.condition === condition);
      return [
        condition,
        Object.fromEntries(
          [
            "shellMs",
            "greetingMs",
            "catalogMs",
            "chapterMs",
            "firstSearchMs",
            "indexedSearchMs",
            "pdfFirstPageMs",
            "rendererHeapBytes",
            "audioFirstSampleMs",
          ].map((key) => [key, summarize(rows, key)]),
        ),
      ];
    }),
  );
  browser = await chromium.launch();
  const profilePage = await browser.newPage({ serviceWorkers: "block" });
  await profilePage.goto(`${base}/`);
  const dataProfile = await profilePage.evaluate(async (samples) => {
    const profiles = {};
    for (const file of [
      "hymn-metadata.json",
      "hymn-catalog.json",
      "bible/tb-reader.json",
    ]) {
      const text = await (await fetch(`/GYSApp-Tauri/offline/${file}`)).text();
      const parseMs = [],
        cloneMs = [];
      for (let run = 0; run < samples; run++) {
        const start = performance.now(),
          value = JSON.parse(text);
        const parsed = performance.now();
        structuredClone(value);
        parseMs.push(parsed - start);
        cloneMs.push(performance.now() - parsed);
      }
      profiles[file] = {
        utf8Bytes: new TextEncoder().encode(text).length,
        parseMs,
        cloneMs,
      };
    }
    return profiles;
  }, samples);
  await browser.close();
  browser = undefined;
  const result = {
    runtime: "production preview / Playwright Chromium / Linux executor",
    samplesPerCondition: samples,
    conditions,
    runs,
    dataProfile,
    exclusions: [
      "Fresh browser context/profile is not first signed native installation",
      "Browser process launch time is excluded: marks are navigation-relative rendered frames",
      "OS cache is not reset",
      "Heap is renderer-only; native process-tree memory is a separate benchmark",
      "Audio physical first sample is unmeasured",
      "Provider traffic is excluded; local core PDF is used",
    ],
  };
  const output =
    process.env.GYS_BROWSER_BENCHMARK_OUTPUT ??
    "browser-roadmap-benchmark.json";
  await writeFile(output, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ output, ...result, runs: undefined }));
} finally {
  await browser?.close();
}
