import { expect, test, type Page } from "@playwright/test";

type TestLocale = "id" | "en" | "zh";

const speechLocaleCopy: Record<
  TestLocale,
  {
    heading: string;
    read: string;
    shell: string;
    drag: string;
    minimize: string;
    restore: string;
    close: string;
    previous: string;
    next: string;
    volume: string;
    speed: string;
  }
> = {
  id: {
    heading: "Alkitab",
    read: "Bacakan",
    shell: "Sedang diputar",
    drag: "Geser pemutar media",
    minimize: "Minimalkan pemutar",
    restore: "Perbesar pemutar",
    close: "Tutup pemutar suara",
    previous: "Ayat sebelumnya",
    next: "Ayat berikutnya",
    volume: "Volume bacaan",
    speed: "Kecepatan bacaan",
  },
  en: {
    heading: "Bible",
    read: "Read aloud",
    shell: "Now playing",
    drag: "Move media player",
    minimize: "Minimize player",
    restore: "Restore player",
    close: "Close speech player",
    previous: "Previous verse",
    next: "Next verse",
    volume: "Reading volume",
    speed: "Reading speed",
  },
  zh: {
    heading: "圣经",
    read: "朗读",
    shell: "正在播放",
    drag: "移动媒体播放器",
    minimize: "最小化播放器",
    restore: "恢复播放器",
    close: "关闭朗读播放器",
    previous: "上一节",
    next: "下一节",
    volume: "朗读音量",
    speed: "朗读速度",
  },
};

async function openSpeechPlayerAtDesktop(
  page: Page,
  locale: TestLocale = "id",
) {
  await page.addInitScript((nextLocale) => {
    localStorage.setItem("gys-speech-engine-v1", "local");
    localStorage.setItem("gys-locale", nextLocale);
    localStorage.setItem(
      "gys-shell-settings-v1",
      JSON.stringify({ version: 1, locale: nextLocale, theme: "light" }),
    );
    const voice = {
      voiceURI: "gys-e2e-id",
      name: "GYS E2E voice",
      lang: "id-ID",
      localService: true,
      default: true,
    };
    const synthesis = {
      getVoices: () => [voice],
      speak: (utterance: { onend?: () => void }) => {
        window.setTimeout(() => utterance.onend?.(), 1_200);
      },
      cancel: () => undefined,
      pause: () => undefined,
      resume: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    };
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: synthesis,
    });
    class TestUtterance {
      public lang = "";
      public voice: unknown = null;
      public rate = 1;
      public pitch = 1;
      public volume = 1;
      public onend?: () => void;
      public onerror?: () => void;
      public constructor(public readonly text: string) {}
    }
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: TestUtterance,
    });
  }, locale);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/GYSApp-Tauri/bible");
  await expect(
    page.getByRole("heading", {
      name: speechLocaleCopy[locale].heading,
      exact: true,
    }),
  ).toBeVisible();
  const read = page.getByRole("button", {
    name: speechLocaleCopy[locale].read,
  });
  await expect(read).toBeEnabled({ timeout: 15_000 });
  await read.click();
  await expect(page.locator(".media-surface")).toBeVisible({ timeout: 15_000 });
}

async function expectCentered(page: Page, width: number) {
  const box = await page.locator(".media-surface").boundingBox();
  expect(box).not.toBeNull();
  expect(Math.abs(box!.x + box!.width / 2 - width / 2)).toBeLessThanOrEqual(3);
  return box!;
}

test("persistent media defaults to one centered semantic dock", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.removeItem("gys-media-position-v1"),
  );
  await openSpeechPlayerAtDesktop(page);
  await expectCentered(page, 1440);
  await expect(page.getByRole("button", { name: "Ciutkan panel" })).toHaveCount(
    0,
  );
  const minimize = page.getByRole("button", { name: "Minimalkan pemutar" });
  await expect(minimize).toHaveCount(1);
  await expect(minimize.locator("svg")).toHaveCount(1);
  const controlBox = await minimize.boundingBox();
  expect(controlBox).not.toBeNull();
  expect(controlBox!.width).toBeGreaterThanOrEqual(44);
  expect(controlBox!.height).toBeGreaterThanOrEqual(44);
  await minimize.click();
  await expect(page.locator(".media-surface.is-minimized")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("gys-media-minimized")),
    )
    .toBe("1");
  const restore = page.getByRole("button", { name: "Perbesar pemutar" });
  await expect(restore.locator("svg")).toHaveCount(1);
  await restore.click();
  await expect(page.locator(".media-surface")).not.toHaveClass(/is-minimized/);
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("gys-media-minimized")),
    )
    .toBe("0");
  await page.getByRole("button", { name: "Tutup pemutar suara" }).click();
  await expect(page.locator(".media-surface")).toHaveCount(0);
});

test("phone ignores a stale dragged position and keeps dock above bottom navigation", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "gys-media-position-v1",
      JSON.stringify({ left: 8, top: 8 }),
    );
    localStorage.setItem("gys-media-minimized", "0");
  });
  await openSpeechPlayerAtDesktop(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const media = await expectCentered(page, 390);
  const nav = await page.locator(".navigation-shell").boundingBox();
  expect(nav).not.toBeNull();
  expect(media.y + media.height).toBeLessThanOrEqual(nav!.y);
});

test("tablet uses stable centered dock geometry after resize", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.removeItem("gys-media-position-v1"),
  );
  await openSpeechPlayerAtDesktop(page);
  await page.setViewportSize({ width: 768, height: 1024 });
  const media = await expectCentered(page, 768);
  expect(media.x).toBeGreaterThanOrEqual(12);
  expect(media.x + media.width).toBeLessThanOrEqual(756);
});

test("speech session keeps its source and state across reader routes", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.removeItem("gys-media-position-v1");
    localStorage.setItem("gys-media-minimized", "0");
  });
  await openSpeechPlayerAtDesktop(page);

  const media = page.locator(".media-surface");
  const title = await media.locator(".media-context-link strong").textContent();
  expect(title).toMatch(/^Kejadian 1:/);
  await page.evaluate(() => {
    window.history.pushState({}, "", "/GYSApp-Tauri/kidung");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(
    page.getByRole("heading", { name: "Kidung", exact: true }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(media).toHaveCount(1);
  await expect(media).toHaveClass(/is-speech-media/);
  await expect(media.locator(".media-context-link strong")).toHaveText(
    /^Kejadian 1:/,
  );

  await page.getByRole("button", { name: "Minimalkan pemutar" }).click();
  await expect(media).toHaveClass(/is-minimized/);
  await page.evaluate(() => {
    window.history.pushState({}, "", "/GYSApp-Tauri/");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page.getByRole("heading", { name: /Selamat datang/i })).toBeVisible({
    timeout: 15_000,
  });
  await expect(media).toHaveCount(1);
  await expect(media).toHaveClass(/is-speech-media/);
  await expect(media.locator(".media-mini-context strong")).toHaveText(
    /^Kejadian 1:/,
  );
});

test("shared speech dock localizes its semantic chrome for every locale", async ({
  page,
}) => {
  for (const locale of ["id", "en", "zh"] as const) {
    await page.addInitScript((nextLocale) => {
      localStorage.removeItem("gys-media-position-v1");
      localStorage.removeItem("gys-media-minimized");
      localStorage.setItem("gys-locale", nextLocale);
      localStorage.setItem(
        "gys-shell-settings-v1",
        JSON.stringify({ version: 1, locale: nextLocale, theme: "light" }),
      );
    }, locale);
    await openSpeechPlayerAtDesktop(page, locale);

    const copy = speechLocaleCopy[locale];
    const media = page.locator(".media-surface");
    await expect(media).toHaveAttribute("aria-label", copy.shell);
    await expect(media.locator(".media-art")).toHaveAttribute(
      "aria-label",
      copy.drag,
    );
    await expect(
      media.getByRole("button", { name: copy.previous }),
    ).toHaveCount(1);
    await expect(media.getByRole("button", { name: copy.next })).toHaveCount(1);
    await expect(media.getByRole("slider", { name: copy.volume })).toHaveCount(1);
    await expect(media.getByRole("combobox", { name: copy.speed })).toHaveCount(
      1,
    );
    await expect(
      media.getByRole("button", { name: copy.minimize }),
    ).toHaveCount(1);
    await expect(media.getByRole("button", { name: copy.close })).toHaveCount(1);

    await media.getByRole("button", { name: copy.close }).click();
    await expect(media).toHaveCount(0);
  }
});
