import { readFile, writeFile } from "node:fs/promises";

async function replaceExact(path, before, after) {
  const source = await readFile(path, "utf8");
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Expected source block not found in ${path}`);
  }
  await writeFile(path, source.replace(before, after));
}

await replaceExact(
  "apps/web/e2e/direct-manipulation.spec.ts",
  `  await expect(\n    page.locator('.pdf-reader-hymn input[type="range"]'),\n  ).toBeHidden();\n\n  // Technical controls begin collapsed, but remain available as an explicit`,
  `  await expect(\n    page.locator('.pdf-reader-hymn input[type="range"]'),\n  ).toBeHidden();\n  await expect(\n    page.locator(".pdf-reader-hymn .pdf-view-scroll-toggle"),\n  ).toBeHidden();\n\n  // Technical controls begin collapsed, but remain available as an explicit`,
);

await replaceExact(
  "apps/web/e2e/direct-manipulation.spec.ts",
  `  await options.click();\n  await expect(advanced).toBeVisible();\n  await expect(\n    advanced.getByRole("button", { name: "Perbesar PDF" }),\n  ).toBeVisible();`,
  `  await options.click();\n  await expect(advanced).toBeVisible();\n  await expect(page.locator(".pdf-reader-hymn .pdf-layout-toggle")).toBeVisible();\n  await expect(\n    advanced.getByRole("button", { name: "Perbesar PDF" }),\n  ).toBeVisible();`,
);

await replaceExact(
  "apps/web/e2e/media-load.spec.ts",
  `  await page\n    .locator(".pdf-view-scroll-toggle")\n    .getByRole("button", { name: "Gulir mendatar" })\n    .click();\n  await expect(page.locator(".pdf-stage")).toHaveAttribute(\n    "data-pdf-layout",\n    "horizontal",\n  );\n  await page.setViewportSize({ width: 390, height: 844 });\n  await expect(page.locator(".pdf-advanced-controls")).toHaveClass(/is-open/);\n  await page.getByRole("button", { name: "2 halaman" }).click();`,
  `  const pdfOptions = page.getByRole("button", { name: "Opsi PDF" });\n  await expect(page.locator(".pdf-advanced-controls")).not.toHaveClass(/is-open/);\n  await pdfOptions.click();\n  await page\n    .locator(".pdf-layout-toggle")\n    .getByRole("button", { name: "Mendatar" })\n    .click();\n  await expect(page.locator(".pdf-stage")).toHaveAttribute(\n    "data-pdf-layout",\n    "horizontal",\n  );\n  await pdfOptions.click();\n  await page.setViewportSize({ width: 390, height: 844 });\n  await expect(page.locator(".pdf-advanced-controls")).not.toHaveClass(/is-open/);\n  await pdfOptions.click();\n  await page.getByRole("button", { name: "2 halaman" }).click();`,
);

await replaceExact(
  "apps/web/e2e/navigation-layout.spec.ts",
  `    await expect(page.locator(".pdf-advanced-controls.is-open")).toBeVisible();`,
  `    await expect(page.locator(".pdf-advanced-controls")).not.toHaveClass(/is-open/);\n    const pdfOptions = page.getByRole("button", { name: "Opsi PDF" });\n    await expect(pdfOptions).toBeVisible();\n    await pdfOptions.click();\n    await expect(page.locator(".pdf-advanced-controls.is-open")).toBeVisible();`,
);
