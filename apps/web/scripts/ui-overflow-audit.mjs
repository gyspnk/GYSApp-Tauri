import { chromium } from "@playwright/test";

const baseUrl =
  process.env.UI_AUDIT_BASE ?? "http://127.0.0.1:4173/GYSApp-Tauri";
const viewports = (
  process.env.UI_AUDIT_VIEWPORTS ?? "320x720,360x800,390x844,414x896"
)
  .split(",")
  .map((entry) => {
    const [width, height] = entry.split("x").map(Number);
    return { name: entry, width, height };
  });
const routes = (
  process.env.UI_AUDIT_ROUTES ??
  [
    "/",
    "/sauh",
    "/bible",
    "/kidung",
    "/kidung/1",
    "/iman",
    "/literatur",
    "/suara",
    "/lainnya",
    "/lainnya?section=appearance",
    "/lainnya?section=audio",
    "/lainnya?section=kidung",
  ].join(",")
).split(",");
const themes = (process.env.UI_AUDIT_THEMES ?? "light,dark").split(",");

const browser = await chromium.launch();
const findings = [];
for (const viewport of viewports) {
  for (const theme of themes) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
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
      await page.waitForTimeout(450);
      const report = await page.evaluate(() => {
        const describe = (el) => {
          const parts = [];
          let node = el;
          while (node && node.nodeType === 1 && parts.length < 4) {
            const id = node.id ? `#${node.id}` : "";
            const cls =
              typeof node.className === "string" && node.className.trim()
                ? `.${node.className.trim().split(/\s+/).slice(0, 2).join(".")}`
                : "";
            parts.unshift(`${node.tagName.toLowerCase()}${id}${cls}`);
            node = node.parentElement;
          }
          return parts.join(" > ");
        };
        const clipped = [];
        for (const el of document.querySelectorAll("body *")) {
          const style = getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden")
            continue;
          if (el.closest(".sr-only, [aria-hidden='true'], svg")) continue;
          const overflows = el.scrollWidth - el.clientWidth;
          if (overflows <= 1) continue;
          if (style.overflowX !== "hidden" && style.overflowX !== "clip")
            continue;
          // Deliberate single-line truncation and line clamps are design, not bugs.
          if (style.textOverflow === "ellipsis") continue;
          if (style.webkitLineClamp && style.webkitLineClamp !== "none")
            continue;
          if ((el.textContent ?? "").trim().length < 4) continue;
          // Scroll containers are deliberate; plain overflow visible never clips.
          if (el.scrollWidth - el.clientWidth <= 1) continue;
          const rect = el.getBoundingClientRect();
          if (rect.width < 8 || rect.height < 8) continue;
          clipped.push({
            element: describe(el),
            overflows,
            width: Math.round(rect.width),
            overflowX: style.overflowX,
            whiteSpace: style.whiteSpace,
            textOverflow: style.textOverflow,
            text: (el.textContent ?? "").trim().slice(0, 60),
          });
        }
        const boxes = [
          ...document.querySelectorAll(".topbar .topbar-actions > *"),
        ]
          .filter((el) => el.getBoundingClientRect().width > 0)
          .map((el) => ({
            label: describe(el),
            rect: el.getBoundingClientRect().toJSON(),
          }));
        const overlaps = [];
        for (let i = 0; i < boxes.length; i += 1) {
          for (let j = i + 1; j < boxes.length; j += 1) {
            const a = boxes[i].rect;
            const b = boxes[j].rect;
            const overlap =
              Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
              Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
            if (overlap)
              overlaps.push(`${boxes[i].label} <> ${boxes[j].label}`);
          }
        }
        return {
          documentOverflow:
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
          clipped: clipped.slice(0, 12),
          overlaps,
        };
      });
      findings.push({ viewport: viewport.name, theme, route, ...report });
    }
    await context.close();
  }
}
await browser.close();

const problems = findings.filter(
  (entry) =>
    entry.documentOverflow > 0 ||
    entry.clipped.length > 0 ||
    entry.overlaps.length > 0,
);
console.log(JSON.stringify({ checked: findings.length, problems }, null, 2));
