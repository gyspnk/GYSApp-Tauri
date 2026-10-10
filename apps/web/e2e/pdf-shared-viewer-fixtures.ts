import { expect, type Page } from "@playwright/test";
import { documentBytes } from "./pdf-fixtures.js";

export async function openSharedReader(
  page: Page,
  kind: "faith" | "literature",
) {
  await page.route(/^https:\/\//, (route) => route.abort());
  if (kind === "faith") {
    await page.goto("/GYSApp-Tauri/iman");
    await page.locator('button[aria-label*="PDF"]').first().click();
  } else {
    await page.route("**/offline/literature.json", (route) =>
      route.fulfill({
        json: {
          source: "tjc.org",
          generatedAt: "2026-10-06T00:00:00Z",
          items: [
            {
              id: "shared-pdf",
              category: "buku",
              title: "Literatur PDF",
              description: "",
              url: "https://tjc.org/id/shared-viewer.pdf",
              format: "pdf",
              publishedAt: "2026-10-01T00:00:00Z",
              updatedAt: "2026-10-01T00:00:00Z",
              source: "tjc.org",
            },
          ],
        },
      }),
    );
    await page.route("**/api/v1/content/pdf?**", (route) =>
      route.fulfill({
        body: documentBytes(4),
        contentType: "application/pdf",
        headers: { "access-control-allow-origin": "*" },
      }),
    );
    await page.goto("/GYSApp-Tauri/literatur/shared-pdf?read=1");
  }
  const reader = page.locator(".pdf-reader");
  await expect(
    reader.locator('canvas[data-pdf-rendered="true"]').first(),
  ).toBeVisible({ timeout: 15_000 });
  return reader;
}
