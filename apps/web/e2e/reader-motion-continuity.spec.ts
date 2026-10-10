import { expect, test } from "@playwright/test";
import { openSharedReader } from "./pdf-shared-viewer-fixtures.js";
import {
  preparePinnedReaderAssets,
  preparePinnedMidiAsset,
} from "./pinned-reader-fixtures.js";

for (const kind of ["hymn", "faith", "literature"] as const) {
  for (const [layout, label] of [
    ["single", "Tampilan 1 halaman"],
    ["two", "Tampilan 2 halaman"],
    ["vertical", "Vertikal"],
    ["horizontal", "Mendatar"],
  ] as const) {
    test(`${kind} ${layout}: PDF follows real pinch without snapping on release`, async ({
      page,
      context,
    }) => {
      await page.setViewportSize({
        width: layout === "two" ? 768 : 390,
        height: 844,
      });
      await page.route(/^https:\/\//, (route) => route.abort());
      let reader;
      if (kind === "hymn") {
        await preparePinnedReaderAssets(page);
        await page.goto("/GYSApp-Tauri/kidung/hymn-133?mode=pdf");
        reader = page.locator(".pdf-reader-hymn");
      } else reader = await openSharedReader(page, kind);
      await expect(
        reader.locator('canvas[data-pdf-rendered="true"]').first(),
      ).toBeVisible({ timeout: 30_000 });
      await reader.locator(".pdf-advanced-toggle").click();
      if (kind === "hymn")
        await reader.locator(".pdf-layout-menu-toggle").click();
      await reader.getByRole("button", { name: label, exact: true }).click();
      const stage = reader.locator(".pdf-stage");
      await expect(stage).toHaveAttribute("data-pdf-layout", layout);
      if (layout === "two")
        await expect(
          stage.locator(".pdf-page-frame > canvas").nth(1),
        ).toHaveAttribute("data-pdf-rendered", "true");
      const canvas = stage.locator(".pdf-page-frame > canvas").first();
      await expect(canvas).toBeVisible();
      await expect(canvas).toHaveAttribute("data-pdf-painted", "true");
      await canvas.evaluate(async (el) => {
        await Promise.all(
          el.getAnimations().map((a) => a.finished.catch(() => {})),
        );
        el.addEventListener("animationstart", (event) => {
          if ((event as AnimationEvent).animationName === "pdf-page-reveal")
            el.setAttribute("data-reveal-restarted", "true");
        });
      });
      const box = (await stage.boundingBox())!;
      const initial = (await canvas.boundingBox())!.width;
      const cdp = await context.newCDPSession(page);
      await cdp.send("Emulation.setTouchEmulationEnabled", {
        enabled: true,
        maxTouchPoints: 2,
      });
      const touches = (distance: number) => [
        {
          id: 1,
          x: box.x + box.width / 2 - distance / 2,
          y: box.y + Math.min(150, box.height / 2),
        },
        {
          id: 2,
          x: box.x + box.width / 2 + distance / 2,
          y: box.y + Math.min(150, box.height / 2),
        },
      ];
      let activeTouch = false;
      try {
        for (const direction of [1, -1]) {
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: touches(direction === 1 ? 100 : 200),
          });
          activeTouch = true;
          for (let step = 1; step <= 10; step++) {
            const distance =
              direction === 1 ? 100 + step * 10 : 200 - step * 10;
            await cdp.send("Input.dispatchTouchEvent", {
              type: "touchMove",
              touchPoints: touches(distance),
            });
            await page.evaluate(() => new Promise(requestAnimationFrame));
          }
          await expect(stage).toHaveAttribute("data-pdf-zooming", "true");
          const bitmap = await canvas.getAttribute("data-pdf-zoom");
          await page.waitForTimeout(180);
          await expect(canvas).toHaveAttribute("data-pdf-zoom", bitmap!);
          await expect(canvas).toHaveAttribute("data-pdf-painted", "true");
          expect(
            await canvas.evaluate(
              (el) =>
                el.parentElement?.parentElement?.querySelector(
                  ".pdf-page-placeholder",
                ) !== null,
            ),
          ).toBe(false);
          const before = (await canvas.boundingBox())!.width;
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchEnd",
            touchPoints: [],
          });
          activeTouch = false;
          const after = (await canvas.boundingBox())!.width;
          expect(
            Math.abs(after - before),
            "release must not snap geometry to a lagging target",
          ).toBeLessThanOrEqual(2);
          expect(
            before / initial,
            "geometry must follow the fingers during the gesture",
          ).toBeCloseTo(direction === 1 ? 2 : 1, 1);
          await expect(stage).not.toHaveAttribute("data-pdf-zooming", "true");
        }
        await expect(canvas).toHaveAttribute("data-pdf-rendered", "true");
        await expect(canvas).not.toHaveAttribute(
          "data-reveal-restarted",
          "true",
        );
      } finally {
        if (activeTouch)
          await cdp
            .send("Input.dispatchTouchEvent", {
              type: "touchCancel",
              touchPoints: [],
            })
            .catch(() => {});
        await cdp.detach().catch(() => {});
      }
    });
  }
}

test("MIDI collapse reserves lyric geometry until its entrance finishes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/^https:\/\//, (route) => route.abort());
  await preparePinnedReaderAssets(page);
  await preparePinnedMidiAsset(page);
  await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=lyrics");
  await page.locator(".hymn-midi-toggle").click();
  const player = page.locator(".media-surface.is-kidung-media");
  await expect(player).toBeVisible({ timeout: 30_000 });
  await player.evaluate((el) => {
    const animate = el.animate.bind(el);
    el.animate = (frames, options) => {
      const animation = animate(frames, options);
      if (animation.effect!.getTiming().duration === 480) animation.pause();
      return animation;
    };
  });
  const space = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue(
      "--reader-media-space",
    ),
  );
  await player.locator(".media-minimize").click();
  await expect(player).toHaveClass(/is-minimized/);
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue(
        "--reader-media-space",
      ),
    ),
  ).toBe(space);
  await player.evaluate((el) =>
    el
      .getAnimations()
      .find((a) => a.id === "gys-midi-dock-enter")!
      .finish(),
  );
  await expect
    .poll(() =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue(
          "--reader-media-space",
        ),
      ),
    )
    .toBe("");
});

test("starting mouse pan interrupts wheel zoom at the visible size", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 900 });
  const reader = await openSharedReader(page, "literature");
  const stage = reader.locator(".pdf-stage");
  const box = (await stage.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await stage.evaluate((el) => {
    el.dataset.zoomStarts = "0";
    el.addEventListener(
      "pdfzoomstart",
      () => (el.dataset.zoomStarts = String(Number(el.dataset.zoomStarts) + 1)),
    );
    const width = () =>
      el.querySelector(".pdf-page-frame > canvas")!.getBoundingClientRect()
        .width;
    el.addEventListener(
      "pointerdown",
      () => el.setAttribute("data-pan-before", String(width())),
      { capture: true, once: true },
    );
    el.addEventListener(
      "pointerdown",
      () => el.setAttribute("data-pan-after", String(width())),
      { once: true },
    );
    el.dispatchEvent(
      new WheelEvent("wheel", {
        ctrlKey: true,
        deltaY: -1000,
        clientX: el.getBoundingClientRect().x + el.clientWidth / 2,
        clientY: el.getBoundingClientRect().y + el.clientHeight / 2,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect(stage).toHaveAttribute("data-pdf-pannable", "true");
  await page.mouse.down();
  const before = Number(await stage.getAttribute("data-pan-before"));
  const after = Number(await stage.getAttribute("data-pan-after"));
  await page.mouse.up();
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await expect(stage).toHaveAttribute("data-zoom-starts", "1");
  expect(
    Math.abs(after - before),
    "pan must freeze the visible zoom rather than jump to its pending target",
  ).toBeLessThanOrEqual(2);
});
