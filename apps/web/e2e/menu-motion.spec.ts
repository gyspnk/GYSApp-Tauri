import { expect, test, type Page } from "@playwright/test";
import { preparePinnedReaderAssets } from "./pinned-reader-fixtures.js";
import { focusMediaControl } from "../scripts/native-media-controls.mjs";

test("native disclosure restores focus before its delayed toggle event", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = window as Window & { delayDetailsToggle?: boolean };
    document.addEventListener(
      "toggle",
      (event) => {
        if (state.delayDetailsToggle) event.stopImmediatePropagation();
      },
      true,
    );
  });
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=lyrics");
  const summary = page.locator(".hymn-more-actions-summary");
  const menu = page.locator(".hymn-more-actions-panel");
  await summary.click();
  await summary.click();
  await expect(menu).toHaveAttribute("inert", "");
  const inert = await page.evaluate(async () => {
    (window as Window & { delayDetailsToggle: boolean }).delayDetailsToggle =
      true;
    const summary = document.querySelector<HTMLElement>(
      ".hymn-more-actions-summary",
    )!;
    const menu = document.querySelector<HTMLElement>(
      ".hymn-more-actions-panel",
    )!;
    summary.click();
    await Promise.resolve();
    return menu.inert;
  });
  expect(inert).toBe(false);
  const control = menu.locator("button").first();
  await focusMediaControl(control);
  await expect(control).toBeFocused();
  const closedInert = await page.evaluate(async () => {
    document.querySelector<HTMLElement>(".hymn-more-actions-summary")!.click();
    await Promise.resolve();
    return document.querySelector<HTMLElement>(".hymn-more-actions-panel")!
      .inert;
  });
  expect(closedInert).toBe(true);
});

async function sampleExit(
  page: Page,
  selector: string,
  native = false,
  close?: { selector?: string; key?: string },
) {
  return page.evaluate(
    ({ selector, native, close }) =>
      new Promise<
        Array<{
          visible: boolean;
          opacity: number;
          x: number;
          y: number;
          right: number;
          bottom: number;
          inert: boolean;
          opensUp: boolean;
        }>
      >((resolve) => {
        const frames: Array<{
          visible: boolean;
          opacity: number;
          x: number;
          y: number;
          right: number;
          bottom: number;
          inert: boolean;
          opensUp: boolean;
        }> = [];
        if (close) {
          const trigger = close.selector
            ? document.querySelector<HTMLElement>(close.selector)!
            : (document.activeElement as HTMLElement);
          if (close.key)
            trigger.dispatchEvent(
              new KeyboardEvent("keydown", { key: close.key, bubbles: true }),
            );
          else trigger.click();
        }
        let started: number | undefined;
        const sample = (time: number) => {
          started ??= time;
          const node = document.querySelector<HTMLElement>(selector);
          const style =
            node &&
            getComputedStyle(
              native ? node.parentElement! : node,
              native ? "::details-content" : null,
            );
          const box = node?.getBoundingClientRect();
          frames.push({
            visible: node?.checkVisibility() ?? false,
            opacity: Number(style?.opacity ?? 0),
            x: box?.x ?? 0,
            y: box?.y ?? 0,
            right: box?.right ?? 0,
            bottom: box?.bottom ?? 0,
            inert: node?.inert ?? true,
            opensUp: node?.classList.contains("is-open-up") ?? false,
          });
          if (time - started < 260) requestAnimationFrame(sample);
          else resolve(frames);
        };
        requestAnimationFrame(sample);
      }),
    { selector, native, close },
  );
}

for (const width of [390, 768, 1440]) {
  test(`lyric menu animates its exit and reverses rapid toggles at ${width}px`, async ({
    page,
  }) => {
    await page.route(/^https:\/\//, (route) => route.abort());
    await page.setViewportSize({ width, height: 700 });
    await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=lyrics");
    const summary = page.locator(".hymn-more-actions-summary");
    const menu = page.locator(".hymn-more-actions-panel");
    await summary.click();
    await expect
      .poll(() =>
        menu.evaluate((node) =>
          Number(
            getComputedStyle(node.parentElement!, "::details-content").opacity,
          ),
        ),
      )
      .toBe(1);
    expect(
      await menu.evaluate((node) => getComputedStyle(node).animationName),
    ).toBe("none");
    const frames = await sampleExit(page, ".hymn-more-actions-panel", true, {
      selector: ".hymn-more-actions-summary",
    });
    expect(
      frames.some(
        (frame) =>
          frame.visible && frame.opacity > 0.01 && frame.opacity < 0.99,
      ),
    ).toBe(true);
    expect(frames.at(-1)!.opacity).toBeLessThan(0.001);
    await expect(menu).toBeHidden();
    const visible = frames.filter((frame) => frame.visible);
    for (const frame of visible) {
      expect(Math.abs(frame.x - visible[0]!.x)).toBeLessThan(1);
      expect(Math.abs(frame.y - visible[0]!.y)).toBeLessThan(1);
    }
    await expect(menu).toHaveAttribute("inert", "");
    await page.evaluate(() => {
      const summary = document.querySelector<HTMLElement>(
        ".hymn-more-actions-summary",
      )!;
      summary.click();
      setTimeout(() => summary.click(), 45);
      setTimeout(() => summary.click(), 85);
    });
    await expect(page.locator(".hymn-more-actions")).toHaveAttribute(
      "open",
      "",
    );
    await expect
      .poll(() =>
        menu.evaluate((node) =>
          Number(
            getComputedStyle(node.parentElement!, "::details-content").opacity,
          ),
        ),
      )
      .toBe(1);
    await expect(menu).not.toHaveAttribute("inert");
    await summary.press("Escape");
    await expect(menu).toBeHidden();
    await expect(summary).toBeFocused();
    await summary.click();
    await page.locator(".lyrics-sheet").click();
    await expect(menu).toBeHidden();
  });
}

for (const width of [390, 1440]) {
  test(`shared select keeps its placement during exit and rapid reopening (${width}px)`, async ({
    page,
  }) => {
    await page.route(/^https:\/\//, (route) => route.abort());
    await page.setViewportSize({ width, height: 650 });
    await page.goto("/GYSApp-Tauri/kidung?section=settings");
    await page.locator('[data-setting="appearance"] > summary').click();
    const root = page
      .locator('[data-setting="appearance"] .control-select')
      .first();
    const trigger = root.getByRole("combobox", {
      name: "Pilih Tema",
      exact: true,
    });
    const menu = root.locator(".control-select-menu");
    await trigger.click();
    await expect
      .poll(() => menu.evaluate((node) => getComputedStyle(node).opacity))
      .toBe("1");
    const opensUp = (await menu.getAttribute("class"))!.includes("is-open-up");
    await menu.evaluate((node) =>
      node.setAttribute("data-menu-probe", "retained"),
    );
    const frames = await sampleExit(
      page,
      '[data-menu-probe="retained"]',
      false,
      { key: "Escape" },
    );
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(
      frames.some(
        (frame) =>
          frame.visible && frame.opacity > 0.01 && frame.opacity < 0.99,
      ),
    ).toBe(true);
    const visible = frames.filter((frame) => frame.visible);
    for (const frame of visible) {
      expect(frame.inert).toBe(true);
      expect(frame.opensUp).toBe(opensUp);
      expect(Math.abs(frame.right - visible[0]!.right)).toBeLessThan(1);
      expect(
        Math.abs(
          (opensUp ? frame.bottom : frame.y) -
            (opensUp ? visible[0]!.bottom : visible[0]!.y),
        ),
      ).toBeLessThan(1);
    }
    await expect(menu).toHaveCount(0);
    await trigger.click();
    await expect
      .poll(() => menu.evaluate((node) => getComputedStyle(node).opacity))
      .toBe("1");
    await menu.evaluate((node) =>
      node.setAttribute("data-menu-probe", "same-node"),
    );
    await trigger.evaluate((node) => {
      node.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      setTimeout(() => (node as HTMLElement).click(), 45);
    });
    await expect(menu).toHaveAttribute("data-menu-probe", "same-node");
    await expect(menu).not.toHaveAttribute("inert");
    await expect
      .poll(() => menu.evaluate((node) => getComputedStyle(node).opacity))
      .toBe("1");
    await page.keyboard.press("Home");
    await page.keyboard.press("Enter");
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
}

for (const width of [320, 390, 768, 1440]) {
  test(`text and score mode buttons share geometry and glyph scale (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 700 });
    await page.route(/^https:\/\//, (route) => route.abort());
    await preparePinnedReaderAssets(page);
    await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=lyrics");
    const score = page.locator(".hymn-partitur-toggle");
    const before = await score.evaluate((node) => ({
      width: node.getBoundingClientRect().width,
      height: node.getBoundingClientRect().height,
      glyph: node.querySelector("svg")!.getBoundingClientRect().width,
      background: getComputedStyle(node).backgroundColor,
      radius: getComputedStyle(node).borderRadius,
    }));
    expect(before.width).toBeGreaterThanOrEqual(44);
    expect(before.width).toBeLessThanOrEqual(56);
    await score.click();
    await expect(
      page.locator('canvas[data-pdf-rendered="true"]').first(),
    ).toBeVisible({ timeout: 20_000 });
    const text = page.locator(".hymn-pdf-text-toggle");
    await page.mouse.move(0, 0);
    await expect
      .poll(() =>
        text.evaluate((node) => getComputedStyle(node).backgroundColor),
      )
      .toBe(before.background);
    const after = await text.evaluate((node) => ({
      width: node.getBoundingClientRect().width,
      height: node.getBoundingClientRect().height,
      glyph: parseFloat(getComputedStyle(node.querySelector("span")!).fontSize),
      background: getComputedStyle(node).backgroundColor,
      radius: getComputedStyle(node).borderRadius,
    }));
    expect(after).toEqual(before);
    for (const control of await page
      .locator(".hymn-pdf-viewer-chrome .viewer-chrome-button")
      .all()) {
      expect((await control.boundingBox())!.width).toBe(before.width);
    }
    await page.locator(".pdf-music-menu > summary").click();
    const music = page.locator(".pdf-music-menu-panel");
    await expect
      .poll(() =>
        music.evaluate((node) =>
          Number(
            getComputedStyle(node.parentElement!, "::details-content").opacity,
          ),
        ),
      )
      .toBe(1);
    if (width < 768) {
      const box = (await music.boundingBox())!;
      const dock = (await page.locator(".pdf-toolbar").boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(60);
      expect(box.y + box.height).toBeLessThanOrEqual(dock.y - 4);
    }
    const musicFrames = await sampleExit(page, ".pdf-music-menu-panel", true, {
      selector: ".pdf-music-menu > summary",
    });
    expect(
      musicFrames.some(
        (frame) =>
          frame.visible && frame.opacity > 0.01 && frame.opacity < 0.99,
      ),
    ).toBe(true);
    await expect(music).toBeHidden();
    const settings = page.locator(".pdf-advanced-toggle");
    await settings.click();
    const tools = page.locator(".pdf-advanced-controls");
    await expect
      .poll(() => tools.evaluate((node) => getComputedStyle(node).opacity))
      .toBe("1");
    const frames = await sampleExit(page, ".pdf-advanced-controls", false, {
      selector: ".pdf-advanced-toggle",
    });
    expect(
      frames.some(
        (frame) =>
          frame.visible && frame.opacity > 0.01 && frame.opacity < 0.99,
      ),
    ).toBe(true);
    await expect(tools).toBeHidden();
    await text.click();
    await expect(page.locator(".lyrics-sheet")).toBeVisible();
    expect(
      await score.evaluate((node) => node.getBoundingClientRect().width),
    ).toBe(before.width);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
  });
}

test("settings disclosures collapse with intermediate heights", async ({
  page,
}) => {
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/GYSApp-Tauri/lainnya");
  const details = page.locator(
    '.more-setting-section[data-setting="appearance"]',
  );
  await details.locator(":scope > summary").click();
  await expect
    .poll(() =>
      details.evaluate((node) =>
        Number(getComputedStyle(node, "::details-content").opacity),
      ),
    )
    .toBe(1);
  await details.evaluate(async (node) => {
    getComputedStyle(node, "::details-content").blockSize;
    await Promise.all(
      node
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished),
    );
  });
  const expanded = (await details.boundingBox())!.height;
  const duration = await details.evaluate(
    (node) => getComputedStyle(node, "::details-content").transitionDuration,
  );
  expect(
    duration
      .split(",")
      .every((part) => parseFloat(part) > 0 && parseFloat(part) <= 0.2),
  ).toBe(true);
  // Chromium's native details pseudo-element does not expose its block-size
  // transition through getAnimations(). Stretch only this probe's timeline,
  // while checking the real duration above, so busy CI cannot skip every frame.
  await page.addStyleTag({
    content:
      '.more-setting-section[data-setting="appearance"]::details-content { transition-duration: 1s; }',
  });
  const heights = await details.evaluate(
    (node) =>
      new Promise<number[]>((resolve) => {
        (node.querySelector(":scope > summary") as HTMLElement).click();
        const heights: number[] = [];
        let started: number | undefined;
        const sample = (time: number) => {
          started ??= time;
          heights.push(node.getBoundingClientRect().height);
          if (time - started < 450) requestAnimationFrame(sample);
          else resolve(heights);
        };
        requestAnimationFrame(sample);
      }),
  );
  await expect
    .poll(() => details.evaluate((node) => node.getBoundingClientRect().height))
    .toBeLessThan(expanded - 50);
  expect(heights.some((height) => height < expanded - 2 && height > 90)).toBe(
    true,
  );
});

test("Bible menu fades and slides out, restores focus and reopens smoothly", async ({
  page,
}) => {
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/GYSApp-Tauri/bible");
  const trigger = page.locator(".reader-hamburger-btn");
  const drawer = page.locator(".reader-hamburger-drawer");
  await trigger.click();
  await expect
    .poll(() => drawer.evaluate((node) => getComputedStyle(node).opacity))
    .toBe("1");
  await drawer.locator(".speech-settings-toggle").click();
  const speech = drawer.locator(".drawer-speech-motion");
  await expect
    .poll(() => speech.evaluate((node) => getComputedStyle(node).opacity))
    .toBe("1");
  const speechFrames = await sampleExit(page, ".drawer-speech-motion", false, {
    selector: ".speech-settings-toggle",
  });
  expect(
    speechFrames.some(
      (frame) => frame.visible && frame.opacity > 0.01 && frame.opacity < 0.99,
    ),
  ).toBe(true);
  await expect(speech).toHaveCount(0);
  await drawer.locator(".hamburger-drawer-close").focus();
  const frames = await sampleExit(page, ".reader-hamburger-drawer", false, {
    key: "Escape",
  });
  expect(
    frames.some(
      (frame) => frame.visible && frame.opacity > 0.01 && frame.opacity < 0.99,
    ),
  ).toBe(true);
  const visible = frames.filter((frame) => frame.visible);
  expect(visible.at(-1)!.x - visible[0]!.x).toBeGreaterThan(5);
  expect(visible.every((frame) => frame.inert)).toBe(true);
  await expect(drawer).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(drawer).toBeVisible();
  await page
    .locator(".reader-hamburger-backdrop")
    .click({ position: { x: 5, y: 150 } });
  await expect(drawer).toHaveCount(0);
});

test("appearance panel animates its exit and returns focus to its launcher", async ({
  page,
}) => {
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/GYSApp-Tauri/lainnya");
  await page.locator('[data-setting="appearance"] > summary').click();
  const launcher = page.locator(".ui-preferences-open");
  const panel = page.locator(".ui-preferences-dialog-layer");
  await launcher.click();
  await expect
    .poll(() => panel.evaluate((node) => getComputedStyle(node).opacity))
    .toBe("1");
  const frames = await sampleExit(page, ".ui-preferences-dialog-layer", false, {
    selector: ".ui-preferences-close",
  });
  expect(
    frames.some(
      (frame) => frame.visible && frame.opacity > 0.01 && frame.opacity < 0.99,
    ),
  ).toBe(true);
  expect(
    frames.filter((frame) => frame.visible).every((frame) => frame.inert),
  ).toBe(true);
  await expect(panel).toHaveCount(0);
  await expect(launcher).toBeFocused();
});

test("main search and Bible picker retain their closing animation", async ({
  page,
}) => {
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/GYSApp-Tauri/");
  const searchTrigger = page.locator(".search-trigger");
  await searchTrigger.click();
  const search = page.locator(".search-backdrop");
  await expect
    .poll(() => search.evaluate((node) => getComputedStyle(node).opacity))
    .toBe("1");
  await page.locator(".global-search input").focus();
  const searchFrames = await sampleExit(page, ".search-backdrop", false, {
    key: "Escape",
  });
  expect(
    searchFrames.some(
      (frame) => frame.visible && frame.opacity > 0.01 && frame.opacity < 0.99,
    ),
  ).toBe(true);
  await expect(search).toHaveCount(0);
  await expect(searchTrigger).toBeFocused();
  await page.goto("/GYSApp-Tauri/bible");
  const pickerTrigger = page.locator(".reader-context-book-picker");
  await pickerTrigger.click();
  const picker = page.locator(".bible-picker-backdrop");
  await expect
    .poll(() => picker.evaluate((node) => getComputedStyle(node).opacity))
    .toBe("1");
  await page.locator('[data-picker-field="chapter"]').focus();
  const pickerFrames = await sampleExit(page, ".bible-picker-backdrop", false, {
    key: "Escape",
  });
  expect(
    pickerFrames.some(
      (frame) => frame.visible && frame.opacity > 0.01 && frame.opacity < 0.99,
    ),
  ).toBe(true);
  await expect(picker).toHaveCount(0);
  await expect(pickerTrigger).toBeFocused();
});

test("faith PDF source menu fades without clipping its floating content", async ({
  page,
}) => {
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/GYSApp-Tauri/iman");
  await page.locator('button[aria-label*="PDF"]').first().click();
  // Sample disclosure frames after the first PDF render, so CPU-heavy decoding
  // does not consume the complete close transition between sampled frames.
  await expect(
    page.locator('.faith-pdf-overlay canvas[data-pdf-rendered="true"]').first(),
  ).toBeVisible({ timeout: 30_000 });
  const menu = page.locator(".faith-pdf-source-menu");
  const summary = page.locator(".faith-pdf-sources > summary");
  await summary.click();
  await expect
    .poll(() =>
      menu.evaluate((node) =>
        Number(
          getComputedStyle(node.parentElement!, "::details-content").opacity,
        ),
      ),
    )
    .toBe(1);
  const frames = await sampleExit(page, ".faith-pdf-source-menu", true, {
    selector: ".faith-pdf-sources > summary",
  });
  expect(
    frames.some(
      (frame) => frame.visible && frame.opacity > 0.01 && frame.opacity < 0.99,
    ),
  ).toBe(true);
  await expect(menu).toBeHidden();
  await summary.click();
  await summary.press("Escape");
  await expect(menu).toBeHidden();
  await expect(summary).toBeFocused();
});

test("reduced motion closes menus immediately without retained surfaces", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=lyrics");
  const summary = page.locator(".hymn-more-actions-summary");
  await summary.click();
  await summary.click();
  expect(
    await page
      .locator(".hymn-more-actions-panel")
      .evaluate((node) => node.checkVisibility()),
  ).toBe(false);
  await page.goto("/GYSApp-Tauri/bible");
  const version = page
    .locator(".reader-version-select-wrap .control-select-trigger")
    .first();
  await version.click();
  await version.press("Escape");
  expect(
    await page
      .locator(".reader-version-select-wrap .control-select-menu")
      .count(),
  ).toBe(0);
  await page.locator(".reader-hamburger-btn").click();
  await expect(page.locator(".reader-hamburger-drawer")).toBeVisible();
  await page.locator(".hamburger-drawer-close").click();
  expect(await page.locator(".reader-hamburger-drawer").count()).toBe(0);
});
