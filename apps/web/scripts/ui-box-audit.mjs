// Reports cards that sit inside other cards. The owner reads the interface as
// "boxes inside boxes" when a framed, rounded panel wraps another framed,
// rounded panel; controls themselves are expected to sit on a card, so buttons,
// selects, inputs and summaries never count as the inner box.
//
//   pnpm ui:boxes
//   UI_BOX_ROUTES=/kidung/hymn-001 UI_BOX_VIEWPORTS=390x844 pnpm ui:boxes
import { chromium } from "@playwright/test";

const baseUrl =
  process.env.UI_AUDIT_BASE ?? "http://127.0.0.1:4173/GYSApp-Tauri";
const viewports = (process.env.UI_BOX_VIEWPORTS ?? "390x844,1440x900")
  .split(",")
  .map((entry) => {
    const [width, height] = entry.split("x").map(Number);
    return { name: entry, width, height };
  });
const routes = (
  process.env.UI_BOX_ROUTES ??
  [
    "/",
    "/sauh",
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
      reducedMotion: "reduce",
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
      const nested = await page.evaluate(() => {
        const CONTROL =
          "button, select, input, textarea, summary, a, [role='button'], [role='tab'], label";
        const describe = (el) => {
          const cls =
            typeof el.className === "string" && el.className.trim()
              ? `.${el.className.trim().split(/\s+/).slice(0, 3).join(".")}`
              : "";
          return `${el.tagName.toLowerCase()}${cls}`;
        };
        const isCard = (el) => {
          if (el.matches(CONTROL) || el.closest(CONTROL) === el) return false;
          const style = getComputedStyle(el);
          const box = el.getBoundingClientRect();
          const filled =
            style.backgroundColor !== "rgba(0, 0, 0, 0)" &&
            style.backgroundColor !== "transparent";
          const bordered =
            Number.parseFloat(style.borderTopWidth) > 0 &&
            style.borderTopStyle !== "none";
          const rounded = Number.parseFloat(style.borderTopLeftRadius) > 0;
          const visible =
            typeof el.checkVisibility !== "function" ||
            el.checkVisibility({
              checkOpacity: true,
              checkVisibilityCSS: true,
            });
          return (
            visible &&
            (filled || bordered) &&
            rounded &&
            box.width >= 160 &&
            box.height >= 48
          );
        };
        const out = [];
        for (const el of document.querySelectorAll("body *")) {
          if (!isCard(el)) continue;
          const parents = [];
          let node = el.parentElement;
          while (node && node !== document.body) {
            if (isCard(node)) parents.push(describe(node));
            node = node.parentElement;
          }
          if (parents.length) out.push({ card: describe(el), inside: parents });
        }
        return out.slice(0, 10);
      });
      if (nested.length)
        findings.push({ viewport: viewport.name, theme, route, nested });
    }
    await context.close();
  }
}
await browser.close();
console.log(
  JSON.stringify(
    {
      checked: routes.length * viewports.length * themes.length,
      findings,
    },
    null,
    2,
  ),
);
