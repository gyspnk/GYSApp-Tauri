// Reports rows of peer controls whose paint differs (background, radius,
// border, height). A group is only interesting when at least three controls
// share one parent: two-button pairs are usually intentional emphasis.
//
//   pnpm ui:consistency
//   UI_CONSISTENCY_ROUTES=/kidung/hymn-001 UI_CONSISTENCY_VIEWPORTS=390x844 pnpm ui:consistency
import { chromium } from "@playwright/test";

const baseUrl =
  process.env.UI_AUDIT_BASE ?? "http://127.0.0.1:4173/GYSApp-Tauri";
const viewports = (process.env.UI_CONSISTENCY_VIEWPORTS ?? "390x844,1440x900")
  .split(",")
  .map((entry) => {
    const [width, height] = entry.split("x").map(Number);
    return { name: entry, width, height };
  });
const routes = (
  process.env.UI_CONSISTENCY_ROUTES ??
  [
    "/",
    "/bible",
    "/kidung",
    "/kidung/hymn-001",
    "/iman",
    "/literatur",
    "/suara",
    "/lainnya",
    "/lainnya?section=appearance",
  ].join(",")
).split(",");
const themes = (process.env.UI_AUDIT_THEMES ?? "light").split(",");

const browser = await chromium.launch();
const findings = [];
for (const viewport of viewports) {
  for (const theme of themes) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: viewport.width < 800,
      isMobile: viewport.width < 800,
    });
    await context.addInitScript((value) => {
      window.localStorage.setItem(
        "gys-shell-settings-v1",
        JSON.stringify({ version: 1, locale: "id", theme: value }),
      );
    }, theme);
    const page = await context.newPage();
    for (const route of routes) {
      await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(700);
      const groups = await page.evaluate(() => {
        const describe = (el) => {
          const cls =
            typeof el.className === "string" && el.className.trim()
              ? `.${el.className.trim().split(/\s+/).slice(0, 3).join(".")}`
              : "";
          return `${el.tagName.toLowerCase()}${cls}`;
        };
        const paint = (el) => {
          const s = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return {
            background: s.backgroundColor,
            radius: s.borderRadius,
            border: s.borderTopWidth,
            height: Math.round(r.height),
            width: Math.round(r.width),
          };
        };
        // Links styled as controls paint like buttons, so they belong in the
        // same comparison; plain prose links stay out.
        const selector =
          "button, a[role='button'], a[class*='button'], a[class*='trigger'], a[class*='action'], a[class*='portal'], summary, .hymn-action, .hymn-partitur-toggle, .hymn-more-actions-summary";
        const out = [];
        for (const parent of document.querySelectorAll("body *")) {
          // A row may deliberately carry one emphasized action; parity is about
          // the quiet peers that remain.
          const emphasized = (el) =>
            /primary|danger|destructive|is-active|is-selected/.test(
              typeof el.className === "string" ? el.className : "",
            );
          const kids = [...parent.children].filter(
            (el) =>
              el.matches(selector) &&
              el.getBoundingClientRect().width > 0 &&
              // Popovers that exist but are not shown must not be compared.
              (typeof el.checkVisibility !== "function" ||
                el.checkVisibility({
                  checkOpacity: true,
                  checkVisibilityCSS: true,
                })) &&
              !el.hasAttribute("aria-pressed") &&
              el.dataset.variant !== "primary" &&
              !emphasized(el),
          );
          if (kids.length < 3) continue;
          const paints = kids.map(paint);
          const style = (key) =>
            [...new Set(paints.map((p) => p[key]))].join(" | ");
          // Only report a group whose peers disagree on paint, not on width.
          if (style("background") === "") continue;
          const variants = {
            background: [...new Set(paints.map((p) => p.background))],
            radius: [...new Set(paints.map((p) => p.radius))],
            border: [...new Set(paints.map((p) => p.border))],
            height: [...new Set(paints.map((p) => p.height))],
          };
          const painted = Object.entries(variants).filter(
            ([, values]) => values.length > 1,
          );
          if (!painted.length) continue;
          out.push({
            container: describe(parent),
            members: kids.map((el, index) => ({
              element: describe(el),
              ...paints[index],
            })),
            variants,
          });
        }
        // The same row can wrap its controls in different elements (select
        // wrappers, account menu shells), so compare controls that simply sit
        // on one horizontal line and next to each other.
        const rowControls = [...document.querySelectorAll(selector)].filter(
          (el) => {
            const rect = el.getBoundingClientRect();
            return (
              rect.width >= 24 &&
              rect.height >= 24 &&
              (typeof el.checkVisibility !== "function" ||
                el.checkVisibility({
                  checkOpacity: true,
                  checkVisibilityCSS: true,
                }))
            );
          },
        );
        const rows = [];
        for (const el of rowControls) {
          const rect = el.getBoundingClientRect();
          const row = rows.find(
            (candidate) =>
              Math.abs(candidate.centerY - (rect.top + rect.height / 2)) <= 4,
          );
          if (row) row.items.push(el);
          else rows.push({ centerY: rect.top + rect.height / 2, items: [el] });
        }
        for (const row of rows) {
          if (row.items.length < 3) continue;
          const sorted = row.items
            .map((el) => ({ el, rect: el.getBoundingClientRect() }))
            .sort((a, b) => a.rect.left - b.rect.left);
          let cluster = [];
          const flush = () => {
            if (cluster.length >= 3) {
              const paints = cluster.map((entry) => paint(entry.el));
              const variants = {
                background: [...new Set(paints.map((p) => p.background))],
                radius: [...new Set(paints.map((p) => p.radius))],
                border: [...new Set(paints.map((p) => p.border))],
                height: [...new Set(paints.map((p) => p.height))],
              };
              if (
                Object.values(variants).filter((values) => values.length > 1)
                  .length
              )
                out.push({
                  container: `row@${Math.round(row.centerY)}`,
                  members: cluster.map((entry, index) => ({
                    element: describe(entry.el),
                    ...paints[index],
                  })),
                  variants,
                });
            }
            cluster = [];
          };
          for (const entry of sorted) {
            const previous = cluster[cluster.length - 1];
            if (
              previous &&
              entry.rect.left - (previous.rect.left + previous.rect.width) > 40
            )
              flush();
            cluster.push(entry);
          }
          flush();
        }
        return out.slice(0, 8);
      });
      if (groups.length)
        findings.push({ viewport: viewport.name, theme, route, groups });
    }
    await context.close();
  }
}
await browser.close();
console.log(
  JSON.stringify(
    { checked: routes.length * viewports.length * themes.length, findings },
    null,
    2,
  ),
);
