import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.use({ serviceWorkers: "block" });
test.setTimeout(240_000);

const viewports = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

const routes = [
  { id: "home", path: "/", ready: ".home-grid", meaningful: ".continue-panel" },
  {
    id: "bible",
    path: "/bible",
    ready: ".bible-reader",
    meaningful: ".bible-reader article",
  },
  {
    id: "kidung",
    path: "/kidung",
    ready: ".hymn-catalog-shell",
    meaningful: ".pujian-item",
  },
  { id: "iman", path: "/iman", ready: ".faith-page", meaningful: ".faith-row" },
  {
    id: "literatur",
    path: "/literatur",
    ready: ".literature-page",
    meaningful: ".literature-row",
  },
  {
    id: "suara",
    path: "/suara",
    ready: ".suara-page",
    meaningful: ".suara-library-item",
  },
  {
    id: "lainnya",
    path: "/lainnya",
    ready: ".more-page",
    meaningful: ".more-card",
  },
] as const;

const transparentPixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=",
  "base64",
);

type Route = (typeof routes)[number];
type Viewport = (typeof viewports)[number];

type BrowserPerformance = {
  longTaskCount: number;
  longTaskDuration: number;
  layoutShift: number;
};

type RuntimeCase = {
  id: string;
  route: string;
  viewport: string;
  readyMs: number;
  domContentLoadedMs: number;
  firstPaintMs: number;
  longTaskCount: number;
  longTaskDuration: number;
  layoutShift: number;
  scrollWidth: number;
  clientWidth: number;
  imageRequests: number;
  loadedImages: number;
  pdfRequests: number;
  duplicateAssets: string[];
  visibleLoadingPanels: number;
  errors: string[];
};

function isPdfUrl(url: string): boolean {
  return /(?:\.pdf(?:$|[?#])|pdf(?:\.worker|\.mjs))/i.test(url);
}

function isPdfDocumentUrl(url: string): boolean {
  return /\.pdf(?:$|[?#])/i.test(url);
}

async function prepare(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date("2026-09-16T06:00:00+07:00"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "gys-shell-settings-v1",
      JSON.stringify({ version: 1, locale: "id", theme: "light" }),
    );
    window.localStorage.setItem("gys-locale", "id");
    window.localStorage.setItem("gys-theme", "light");

    const state: BrowserPerformance = {
      longTaskCount: 0,
      longTaskDuration: 0,
      layoutShift: 0,
    };
    const target = window as unknown as {
      __gysRuntimePerformance: BrowserPerformance;
    };
    target.__gysRuntimePerformance = state;
    if ("PerformanceObserver" in window) {
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            state.longTaskCount += 1;
            state.longTaskDuration += entry.duration;
          }
        }).observe({ type: "longtask", buffered: true });
      } catch {
        // Unsupported observers are reported as zero in the baseline artifact.
      }
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as PerformanceEntry[]) {
            const shift = entry as PerformanceEntry & {
              hadRecentInput?: boolean;
              value?: number;
            };
            if (!shift.hadRecentInput) state.layoutShift += shift.value ?? 0;
          }
        }).observe({ type: "layout-shift", buffered: true });
      } catch {
        // Unsupported observers are reported as zero in the baseline artifact.
      }
    }
  });
  await page.route("**/api/v1/content/**", (route) => route.abort());
  await page.route("https://raw.githubusercontent.com/**", (route) =>
    route.abort(),
  );
  await page.route("https://github.com/**", (route) => route.abort());
  await page.route("https://tjc.org/**", (route) => route.abort());
  await page.route("https://www.tjc.org/**", (route) => route.abort());
  await page.route("https://tjcorguploads.s3.amazonaws.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/png",
      headers: { "cache-control": "public, max-age=604800" },
      body: transparentPixel,
    }),
  );
}

async function browserMetrics(page: Page): Promise<BrowserPerformance> {
  return page.evaluate(() => {
    const state = (
      window as unknown as { __gysRuntimePerformance?: BrowserPerformance }
    ).__gysRuntimePerformance;
    return state ?? { longTaskCount: 0, longTaskDuration: 0, layoutShift: 0 };
  });
}

async function runRoute(
  page: Page,
  route: Route,
  viewport: Viewport,
): Promise<RuntimeCase> {
  const id = `${route.id}-${viewport.name}`;
  const errors: string[] = [];
  const requests: { url: string; type: string }[] = [];
  page.on("request", (request) => {
    requests.push({ url: request.url(), type: request.resourceType() });
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.text().includes("Failed to load resource: net::ERR_FAILED")
    ) {
      errors.push(`console: ${message.text()}`);
    }
  });
  await page.setViewportSize({
    width: viewport.width,
    height: viewport.height,
  });
  const started = Date.now();
  await page.goto(`/GYSApp-Tauri${route.path}`, {
    waitUntil: "domcontentloaded",
  });
  await page
    .locator(route.ready)
    .first()
    .waitFor({ state: "visible", timeout: 15_000 });
  await page
    .locator(route.meaningful)
    .first()
    .waitFor({ state: "visible", timeout: 15_000 });
  const readyMs = Date.now() - started;
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(100);

  const metrics = await page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0] as
      PerformanceNavigationTiming | undefined;
    const paint = performance
      .getEntriesByType("paint")
      .find((entry) => entry.name === "first-contentful-paint");
    const state = (
      window as unknown as { __gysRuntimePerformance?: BrowserPerformance }
    ).__gysRuntimePerformance;
    const images = [...document.images];
    return {
      domContentLoadedMs: navigation?.domContentLoadedEventEnd ?? 0,
      firstPaintMs: paint?.startTime ?? 0,
      longTaskCount: state?.longTaskCount ?? 0,
      longTaskDuration: state?.longTaskDuration ?? 0,
      layoutShift: state?.layoutShift ?? 0,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      loadedImages: images.filter(
        (image) => image.complete && image.naturalWidth > 0,
      ).length,
      visibleLoadingPanels: [
        ...document.querySelectorAll<HTMLElement>(
          ".loading-panel, .route-loading",
        ),
      ].filter((element) => {
        const style = getComputedStyle(element);
        return style.display !== "none" && element.getClientRects().length > 0;
      }).length,
    };
  });

  const assetUrls = requests
    .filter(({ type, url }) => type === "image" || isPdfUrl(url))
    .map(({ url }) => url);
  const counts = new Map<string, number>();
  for (const url of assetUrls) counts.set(url, (counts.get(url) ?? 0) + 1);
  const duplicateAssets = [...counts]
    .filter(([, count]) => count > 1)
    .map(([url]) => url);
  return {
    id,
    route: route.path,
    viewport: viewport.name,
    readyMs,
    ...metrics,
    imageRequests: requests.filter(({ type }) => type === "image").length,
    pdfRequests: requests.filter(({ url }) => isPdfDocumentUrl(url)).length,
    duplicateAssets,
    errors,
  };
}

test("primary routes runtime performance baseline", async ({
  page,
}, testInfo) => {
  const results: RuntimeCase[] = [];
  for (const route of routes) {
    for (const viewport of viewports) {
      const casePage = await page.context().newPage();
      try {
        await prepare(casePage);
        results.push(await runRoute(casePage, route, viewport));
      } finally {
        await casePage.close();
      }
    }
  }

  await testInfo.attach("runtime-performance-baseline.json", {
    body: Buffer.from(JSON.stringify({ results }, null, 2)),
    contentType: "application/json",
  });
  console.log(`[runtime-performance] ${JSON.stringify(results)}`);
  expect(results).toHaveLength(routes.length * viewports.length);
  for (const result of results) {
    expect(result.readyMs, result.id).toBeLessThan(15_000);
    expect(result.scrollWidth, result.id).toBeLessThanOrEqual(
      result.clientWidth + 1,
    );
    expect(result.layoutShift, result.id).toBeLessThan(0.35);
    expect(result.longTaskDuration, result.id).toBeLessThan(8_000);
    expect(result.duplicateAssets, result.id).toEqual([]);
    expect(result.errors, result.id).toEqual([]);
  }
});

test("local PDF runtime has one fetch and reaches rendered state", async ({
  page,
}, testInfo) => {
  const pdf = await readFile(
    new URL(
      "../public/assets/pdf/001_Pujilah Allah Yang Maha Esa.pdf",
      import.meta.url,
    ),
  );
  await prepare(page);
  await page.route("**/offline/literature.json", (route) =>
    route.fulfill({
      json: {
        source: "tjc.org",
        generatedAt: "2026-09-16T00:00:00.000Z",
        items: [
          {
            id: "runtime-pdf",
            category: "panduan",
            title: "Runtime PDF Baseline",
            description: "Deterministic local PDF performance fixture.",
            url: "http://127.0.0.1:5174/GYSApp-Tauri/runtime-baseline.pdf",
            format: "pdf",
            publishedAt: "2026-09-16T00:00:00.000Z",
            updatedAt: "2026-09-16T00:00:00.000Z",
            source: "tjc.org",
          },
        ],
      },
    }),
  );
  await page.route("**/runtime-baseline.pdf", (route) =>
    route.fulfill({ status: 200, contentType: "application/pdf", body: pdf }),
  );
  const pdfRequests: string[] = [];
  const pageErrors: string[] = [];
  page.on("request", (request) => {
    if (isPdfDocumentUrl(request.url())) pdfRequests.push(request.url());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  const started = Date.now();
  await page.goto("/GYSApp-Tauri/literatur/runtime-pdf?read=1", {
    waitUntil: "domcontentloaded",
  });
  const reader = page.locator(".pdf-reader");
  await expect(reader).toHaveAttribute("data-pdf-loading-phase", "ready", {
    timeout: 30_000,
  });
  await expect(reader.locator(".pdf-pages canvas").first()).toHaveCount(1);
  const readyMs = Date.now() - started;
  const metrics = await browserMetrics(page);
  await testInfo.attach("runtime-pdf-baseline.json", {
    body: Buffer.from(
      JSON.stringify({ readyMs, pdfRequests, metrics, pageErrors }, null, 2),
    ),
    contentType: "application/json",
  });
  expect(pageErrors).toEqual([]);
  expect(new Set(pdfRequests).size).toBe(1);
  expect(pdfRequests).toHaveLength(1);
  expect(metrics.layoutShift).toBeLessThan(0.35);
});
