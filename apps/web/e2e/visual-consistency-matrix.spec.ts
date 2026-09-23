import { expect, test, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block" });
test.setTimeout(420_000);

const viewports = [
  { name: "320x720", width: 320, height: 720 },
  { name: "390x844", width: 390, height: 844 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "1440x900", width: 1440, height: 900 },
] as const;

const routes = [
  { id: "home", path: "/", ready: ".home-grid" },
  { id: "bible", path: "/bible", ready: ".bible-reader" },
  { id: "kidung", path: "/kidung", ready: ".hymn-catalog-shell" },
  { id: "iman", path: "/iman", ready: ".faith-page" },
  { id: "literatur", path: "/literatur", ready: ".literature-page" },
  { id: "suara", path: "/suara", ready: ".suara-page" },
  { id: "lainnya", path: "/lainnya", ready: ".more-page" },
] as const;

const representativeLocales = ["id", "en", "zh"] as const;
const representativeThemes = ["light", "dark", "sepia", "amoled"] as const;
const transparentPixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=",
  "base64",
);

type Route = (typeof routes)[number];
type Viewport = (typeof viewports)[number];
type Locale = (typeof representativeLocales)[number];
type Theme = (typeof representativeThemes)[number];

type CaseResult = {
  id: string;
  route: string;
  viewport: string;
  locale: Locale;
  theme: Theme;
  geometry?: Record<string, unknown>;
  errors: string[];
};

function caseId(
  route: Route,
  viewport: Viewport,
  locale: Locale,
  theme: Theme,
) {
  return `${route.id}-${viewport.name}-${locale}-${theme}`;
}

async function prepare(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date("2026-09-16T06:00:00+07:00"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const params = new URLSearchParams(window.location.search);
    const locale = params.get("__gys_locale");
    const theme = params.get("__gys_theme");
    if (!locale || !theme) return;
    const settings = JSON.stringify({ version: 1, locale, theme });
    window.localStorage.setItem("gys-shell-settings-v1", settings);
    window.localStorage.setItem("gys-locale", locale);
    window.localStorage.setItem("gys-theme", theme);
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

function visible(element: Element): boolean {
  const node = element as HTMLElement;
  const style = getComputedStyle(node);
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    node.getClientRects().length > 0
  );
}

async function readGeometry(page: Page) {
  return page.evaluate(() => {
    const box = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      const rect = element?.getBoundingClientRect();
      return rect
        ? {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          }
        : null;
    };
    const isVisible = (element: Element) => {
      const node = element as HTMLElement;
      const style = getComputedStyle(node);
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        node.getClientRects().length > 0
      );
    };
    const criticalSelectors = [
      ".control-select-trigger",
      ".search-trigger",
      ".account-button",
      ".primary-button",
      ".quiet-button",
      ".navigation-shell .nav-item",
      ".reader-context-button",
      ".reader-context-book-picker",
      ".kidung-local-nav a",
      ".more-cat-btn",
    ];
    const targets = criticalSelectors.flatMap((selector) =>
      [...document.querySelectorAll<HTMLElement>(selector)]
        .filter(isVisible)
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            selector,
            name:
              element.getAttribute("aria-label") ||
              element.textContent?.trim() ||
              "",
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          };
        }),
    );
    const panels = [
      ".loading-panel",
      ".error-panel",
      ".empty-panel",
      ".empty-state",
      ".route-loading",
      ".route-recovery",
    ].flatMap((selector) =>
      [...document.querySelectorAll<HTMLElement>(selector)]
        .filter(isVisible)
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            selector,
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          };
        }),
    );
    const heading = [...document.querySelectorAll<HTMLElement>("h1")].find(
      isVisible,
    );
    const body = [
      ...document.querySelectorAll<HTMLElement>(
        "p, .intro-copy, .sauh-excerpt, .online-article-body, .faith-row-copy, .pujian-title",
      ),
    ].find(isVisible);
    const headingStyle = heading ? getComputedStyle(heading) : undefined;
    const bodyStyle = body ? getComputedStyle(body) : undefined;

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      topbar: box(".topbar"),
      navigation: box(".navigation-shell"),
      main: box("#main-content"),
      heading: box("h1"),
      headingCount: [...document.querySelectorAll("h1")].filter(isVisible)
        .length,
      headingFontSize: headingStyle
        ? Number.parseFloat(headingStyle.fontSize)
        : 0,
      bodyFontSize: bodyStyle ? Number.parseFloat(bodyStyle.fontSize) : 0,
      targets,
      panels,
    };
  });
}

function addFinding(findings: string[], condition: boolean, message: string) {
  if (!condition) findings.push(message);
}

function inspectGeometry(
  result: Awaited<ReturnType<typeof readGeometry>>,
  label: string,
  findings: string[],
) {
  const { width, height } = result.viewport;
  const insideHorizontally = (rect: { left: number; right: number }) =>
    rect.left >= -1 && rect.right <= width + 1;
  addFinding(
    findings,
    result.scrollWidth <= result.clientWidth + 1,
    `${label}: document overflows horizontally (${result.scrollWidth} > ${result.clientWidth})`,
  );

  for (const [name, rect] of [
    ["topbar", result.topbar],
    ["navigation", result.navigation],
    ["main", result.main],
  ] as const) {
    if (rect) {
      addFinding(
        findings,
        insideHorizontally(rect),
        `${label}: ${name} escapes viewport horizontally`,
      );
    }
  }

  addFinding(
    findings,
    result.headingCount === 1,
    `${label}: expected one visible h1, got ${result.headingCount}`,
  );
  addFinding(
    findings,
    result.headingFontSize >= 20 &&
      result.headingFontSize > result.bodyFontSize,
    `${label}: heading/body hierarchy is not measurable (${result.headingFontSize}px/${result.bodyFontSize}px)`,
  );

  for (const target of result.targets) {
    addFinding(
      findings,
      target.width >= 44 - 0.01 && target.height >= 44 - 0.01,
      `${label}: ${target.selector} "${target.name}" is ${target.width.toFixed(2)}x${target.height.toFixed(2)}px`,
    );
    addFinding(
      findings,
      insideHorizontally(target),
      `${label}: ${target.selector} "${target.name}" escapes viewport horizontally`,
    );
  }
  for (const panel of result.panels) {
    addFinding(
      findings,
      insideHorizontally(panel),
      `${label}: ${panel.selector} escapes viewport horizontally`,
    );
  }
}

test("primary routes visual consistency matrix", async ({ page }, testInfo) => {
  await prepare(page);
  const findings: string[] = [];
  const cases: CaseResult[] = [];
  let activeCase = "setup";
  const caseErrors = new Map<string, string[]>();
  page.on("pageerror", (error) => {
    caseErrors.get(activeCase)?.push(`pageerror: ${error.message}`);
  });
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.text().includes("Failed to load resource: net::ERR_FAILED")
    ) {
      caseErrors.get(activeCase)?.push(`console: ${message.text()}`);
    }
  });

  const runCase = async (
    route: Route,
    viewport: Viewport,
    locale: Locale,
    theme: Theme,
    screenshot: boolean,
  ) => {
    const id = caseId(route, viewport, locale, theme);
    activeCase = id;
    caseErrors.set(id, []);
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await page.goto(
      `/GYSApp-Tauri${route.path}?__gys_locale=${locale}&__gys_theme=${theme}`,
    );
    try {
      await page.locator(route.ready).first().waitFor({
        state: "visible",
        timeout: 20_000,
      });
      await page.evaluate(() => document.fonts.ready);
      const geometry = await readGeometry(page);
      const errors = caseErrors.get(id) ?? [];
      cases.push({
        id,
        route: route.path,
        viewport: viewport.name,
        locale,
        theme,
        geometry,
        errors,
      });
      inspectGeometry(geometry, id, findings);
      findings.push(...errors.map((error) => `${id}: ${error}`));
      addFinding(
        findings,
        (await page.locator("html").getAttribute("data-theme")) === theme,
        `${id}: expected theme ${theme}`,
      );
      if (screenshot) {
        await testInfo.attach(`matrix-${id}.png`, {
          body: await page.screenshot({
            animations: "disabled",
            caret: "hide",
          }),
          contentType: "image/png",
        });
      }
    } catch (error) {
      const errors = caseErrors.get(id) ?? [];
      cases.push({
        id,
        route: route.path,
        viewport: viewport.name,
        locale,
        theme,
        errors,
      });
      findings.push(`${id}: route did not become ready (${String(error)})`);
      findings.push(...errors.map((entry) => `${id}: ${entry}`));
      await testInfo.attach(`matrix-${id}-failure.png`, {
        body: await page.screenshot({ animations: "disabled", caret: "hide" }),
        contentType: "image/png",
      });
    }
  };

  for (const route of routes) {
    for (const viewport of viewports) {
      await runCase(route, viewport, "id", "light", true);
    }
  }

  const localeSamples = [
    { route: routes[0], viewport: viewports[1] },
    { route: routes[1], viewport: viewports[2] },
    { route: routes[2], viewport: viewports[3] },
    { route: routes[3], viewport: viewports[1] },
    { route: routes[4], viewport: viewports[2] },
    { route: routes[5], viewport: viewports[1] },
    { route: routes[6], viewport: viewports[2] },
  ] as const;
  for (const sample of localeSamples) {
    for (const locale of representativeLocales) {
      await runCase(sample.route, sample.viewport, locale, "light", false);
    }
  }

  const themeSamples = [
    { route: routes[0], viewport: viewports[1] },
    { route: routes[1], viewport: viewports[2] },
    { route: routes[2], viewport: viewports[3] },
    { route: routes[3], viewport: viewports[1] },
  ] as const;
  for (const sample of themeSamples) {
    for (const theme of representativeThemes) {
      await runCase(sample.route, sample.viewport, "id", theme, false);
    }
  }

  await testInfo.attach("visual-consistency-matrix.json", {
    body: Buffer.from(JSON.stringify({ cases, findings }, null, 2)),
    contentType: "application/json",
  });
  expect(findings, findings.join("\n")).toEqual([]);
});
