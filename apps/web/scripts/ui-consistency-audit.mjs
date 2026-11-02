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
    "/lainnya?section=audio",
    "/lainnya?section=kidung",
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
              // Swatches are colour pickers: their paint IS the content.
              !/swatch/.test(
                typeof el.className === "string" ? el.className : "",
              ) &&
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
              // Swatches are colour pickers: their paint IS the content.
              !/swatch/.test(
                typeof el.className === "string" ? el.className : "",
              ) &&
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
      // Content centring: a control may be the right size and colour but still
      // push its icon or its only child off the middle line.
      const centering = await page.evaluate(() => {
        const label = (el) => {
          const cls =
            typeof el.className === "string" && el.className.trim()
              ? `.${el.className.trim().split(/\s+/).slice(0, 3).join(".")}`
              : "";
          return `${el.tagName.toLowerCase()}${cls}`;
        };
        const selector =
          "button, a[role='button'], a[class*='button'], a[class*='trigger'], a[class*='action'], a[class*='portal'], summary, .hymn-action, .hymn-partitur-toggle, .hymn-more-actions-summary";
        const out = [];
        for (const el of document.querySelectorAll(selector)) {
          if (
            typeof el.checkVisibility === "function" &&
            !el.checkVisibility({
              checkOpacity: true,
              checkVisibilityCSS: true,
            })
          )
            continue;
          const box = el.getBoundingClientRect();
          if (box.width < 24 || box.height < 24) continue;
          const style = getComputedStyle(el);
          if (!/flex|grid/.test(style.display)) continue;
          const svg = [
            ...el.querySelectorAll(":scope > svg, :scope > span > svg"),
          ].find((node) => {
            const box = node.getBoundingClientRect();
            // A chevron hidden at phone widths still renders a zero box.
            return box.width >= 8 && box.height >= 8;
          });
          const text = [
            ...el.querySelectorAll(
              ":scope > span, :scope > strong, :scope > label",
            ),
          ].find((node) => {
            if (!(node.textContent ?? "").trim().length) return false;
            if (node.querySelector("svg")) return false;
            const box = node.getBoundingClientRect();
            // Screen-reader-only labels are 1px wide boxes parked off the
            // visible line; comparing against them invents a huge offset.
            return box.width >= 8 && box.height >= 8;
          });
          if (svg && text) {
            const a = svg.getBoundingClientRect();
            const b = text.getBoundingClientRect();
            const delta = Math.abs(
              a.top + a.height / 2 - (b.top + b.height / 2),
            );
            // Cards stack the icon above its label on purpose; only a
            // side-by-side row is expected to share one middle line.
            const stacked =
              Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) <= 0;
            if (delta > 1.5 && !stacked)
              out.push({
                element: label(el),
                kind: "icon-text",
                delta: Number(delta.toFixed(1)),
              });
          }
          const kids = [...el.children].filter(
            (node) => node.getBoundingClientRect().height > 0,
          );
          if (kids.length === 1) {
            const child = kids[0].getBoundingClientRect();
            if (child.height < box.height - 4) {
              const delta = Math.abs(
                child.top + child.height / 2 - (box.top + box.height / 2),
              );
              if (delta > 2)
                out.push({
                  element: label(el),
                  kind: "only-child",
                  delta: Number(delta.toFixed(1)),
                });
            }
          }
        }
        return out.slice(0, 12);
      });
      if (groups.length || centering.length)
        findings.push({
          viewport: viewport.name,
          theme,
          route,
          groups,
          centering,
        });
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
