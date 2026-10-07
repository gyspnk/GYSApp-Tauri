import { expect, test, type Page } from "@playwright/test";
import { clickMediaStop } from "../scripts/native-media-controls.mjs";

type TestLocale = "id" | "en" | "zh";
type TestMediaSessionWindow = Window & {
  __gysMediaSession?: {
    handlers: Record<string, (details?: unknown) => unknown>;
    playbackState: string;
  };
};

const speechLocaleCopy: Record<
  TestLocale,
  {
    heading: string;
    read: string;
    shell: string;
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
    type MediaActionHandler = (details?: {
      seekOffset?: number;
      seekTime?: number;
    }) => unknown;
    const handlers: Record<string, MediaActionHandler> = {};
    const mediaSession = {
      handlers,
      metadata: null as unknown,
      playbackState: "none",
      positionState: null as unknown,
      setActionHandler(action: string, handler: MediaActionHandler | null) {
        if (handler) handlers[action] = handler;
        else delete handlers[action];
      },
      setPositionState(state?: unknown) {
        this.positionState = state ?? null;
      },
    };
    Object.defineProperty(window, "__gysMediaSession", {
      configurable: true,
      value: mediaSession,
    });
    Object.defineProperty(navigator, "mediaSession", {
      configurable: true,
      value: mediaSession,
    });
    const voice = {
      voiceURI: "gys-e2e-id",
      name: "GYS E2E voice",
      lang: "id-ID",
      localService: true,
      default: true,
    };
    let active: { onend?: () => void } | undefined;
    let timer: number | undefined;
    let remaining = 1_200;
    let started = 0;
    const schedule = () => {
      started = performance.now();
      timer = window.setTimeout(() => {
        timer = undefined;
        const ended = active;
        active = undefined;
        ended?.onend?.();
      }, remaining);
    };
    const synthesis = {
      getVoices: () => [voice],
      speak: (utterance: { onend?: () => void }) => {
        window.clearTimeout(timer);
        active = utterance;
        remaining = 1_200;
        schedule();
      },
      cancel: () => {
        window.clearTimeout(timer);
        timer = undefined;
        active = undefined;
      },
      pause: () => {
        if (timer === undefined) return;
        remaining = Math.max(0, remaining - (performance.now() - started));
        window.clearTimeout(timer);
        timer = undefined;
      },
      resume: () => {
        if (active && timer === undefined) schedule();
      },
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

async function triggerMediaAction(page: Page, action: string) {
  await page.evaluate((actionName) => {
    const session = (window as TestMediaSessionWindow).__gysMediaSession;
    void session?.handlers[actionName]?.();
  }, action);
}

async function readMediaPlaybackState(page: Page) {
  return page.evaluate(
    () => (window as TestMediaSessionWindow).__gysMediaSession?.playbackState,
  );
}

test("persistent media defaults to the sidebar and animates into a bottom dock", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.removeItem("gys-media-position-v1"),
  );
  await openSpeechPlayerAtDesktop(page);
  const media = page.locator(".media-surface");
  await expect(media).toHaveClass(/is-minimized/);
  const rail = await page.locator(".navigation-shell").boundingBox();
  const compact = await media.boundingBox();
  expect(compact!.x).toBeGreaterThanOrEqual(rail!.x);
  expect(compact!.x + compact!.width).toBeLessThanOrEqual(
    rail!.x + rail!.width,
  );
  await page.getByRole("button", { name: "Perbesar pemutar" }).click();
  await expect(media).not.toHaveClass(/is-minimized/);
  await expect
    .poll(() => media.evaluate((node) => node.getAnimations().length))
    .toBe(0);
  const expanded = await media.boundingBox();
  expect(expanded!.width).toBeGreaterThan(1300);
  expect(expanded!.y + expanded!.height).toBeGreaterThan(850);
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
  await page
    .getByRole("button", { name: "Ciutkan navigasi", exact: true })
    .click();
  await expect(media).toHaveClass(/is-rail-player/);
  const collapsedRail = (await page
    .locator(".navigation-shell")
    .boundingBox())!;
  await expect
    .poll(async () => {
      const box = (await media.boundingBox())!;
      return box.x + box.width <= collapsedRail.x + collapsedRail.width;
    })
    .toBe(true);
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

test("tablet keeps its sidebar player reachable after resize", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.removeItem("gys-media-position-v1"),
  );
  await openSpeechPlayerAtDesktop(page);
  await page.setViewportSize({ width: 768, height: 1024 });
  const media = (await page.locator(".media-surface").boundingBox())!;
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
  await expect(
    page.getByRole("heading", { name: /Bacaan & nyanyian/i }),
  ).toBeVisible({
    timeout: 15_000,
  });
  await expect(media).toHaveCount(1);
  await expect(media).toHaveClass(/is-speech-media/);
  await expect(media.locator(".media-mini-context strong")).toHaveText(
    /^Kejadian 1:/,
  );
});

test("system media controls follow speech and disable unsupported seeking", async ({
  page,
}) => {
  await openSpeechPlayerAtDesktop(page);
  const actions = await page.evaluate(() =>
    Object.keys(
      (window as TestMediaSessionWindow).__gysMediaSession?.handlers ?? {},
    ),
  );
  expect(actions).toEqual(
    expect.arrayContaining([
      "play",
      "pause",
      "stop",
      "previoustrack",
      "nexttrack",
    ]),
  );
  expect(actions).not.toEqual(
    expect.arrayContaining(["seekto", "seekbackward", "seekforward"]),
  );

  const title = page.locator(".media-context-link strong");
  const firstVerse = await title.textContent();
  await triggerMediaAction(page, "nexttrack");
  await expect.poll(() => title.textContent()).not.toBe(firstVerse);
  const nextVerse = await title.textContent();

  await triggerMediaAction(page, "previoustrack");
  await expect.poll(() => title.textContent()).toBe(firstVerse);
  expect(nextVerse).not.toBe(firstVerse);

  await triggerMediaAction(page, "pause");
  await expect.poll(() => readMediaPlaybackState(page)).toBe("paused");
  await triggerMediaAction(page, "play");
  await expect.poll(() => readMediaPlaybackState(page)).toBe("playing");
});

test("shared speech dock localizes its semantic chrome for every locale", async ({
  page,
}) => {
  for (const locale of ["id", "en", "zh"] as const) {
    await page.addInitScript((nextLocale) => {
      localStorage.removeItem("gys-media-position-v1");
      localStorage.setItem("gys-media-minimized", "0");
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
      "aria-hidden",
      "true",
    );
    await expect(
      media.getByRole("button", { name: copy.previous }),
    ).toHaveCount(1);
    await expect(media.getByRole("button", { name: copy.next })).toHaveCount(1);
    await expect(media.getByRole("slider", { name: copy.volume })).toHaveCount(
      1,
    );
    await expect(media.getByRole("combobox", { name: copy.speed })).toHaveCount(
      1,
    );
    await expect(
      media.getByRole("button", { name: copy.minimize }),
    ).toHaveCount(1);
    await expect(media.getByRole("button", { name: copy.close })).toHaveCount(
      1,
    );

    await media.getByRole("button", { name: copy.close }).click();
    await expect(media).toHaveCount(0);
  }
});

async function openBrowserSpeechPlayer(page: Page, engine: "auto" | "local") {
  await page.addInitScript((preferredEngine) => {
    localStorage.setItem("gys-speech-engine-v1", preferredEngine);
    localStorage.setItem("gys-locale", "id");
    localStorage.setItem(
      "gys-shell-settings-v1",
      JSON.stringify({ version: 1, locale: "id", theme: "light" }),
    );
    const voices = [
      {
        voiceURI: "gys-online-id",
        name: "GYS Online Indonesian",
        lang: "id-ID",
        localService: false,
        default: false,
      },
      {
        voiceURI: "gys-local-id",
        name: "GYS Local Indonesian",
        lang: "id-ID",
        localService: true,
        default: true,
      },
    ];
    const spokenVoiceIds: string[] = [];
    (
      window as Window & { __gysSpokenVoiceIds?: string[] }
    ).__gysSpokenVoiceIds = spokenVoiceIds;
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        getVoices: () => voices,
        speak: (utterance: {
          voice?: { voiceURI: string } | null;
          onend?: () => void;
        }) => {
          spokenVoiceIds.push(utterance.voice?.voiceURI ?? "unselected");
          window.setTimeout(() => utterance.onend?.(), 1_200);
        },
        cancel: () => undefined,
        pause: () => undefined,
        resume: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      },
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
  }, engine);
  await page.goto("/GYSApp-Tauri/bible");
  await expect(page.getByRole("heading", { name: /Kejadian 1/ })).toBeVisible({
    timeout: 15_000,
  });
  const read = page.getByRole("button", { name: "Bacakan" });
  await expect(read).toBeEnabled({ timeout: 15_000 });
  await read.click();
  await expect(page.locator(".verse-row.is-speaking")).toBeVisible();
}

test("browser Auto uses a system voice when direct Edge speech is unavailable", async ({
  page,
}) => {
  await openBrowserSpeechPlayer(page, "auto");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as Window & { __gysSpokenVoiceIds?: string[] })
            .__gysSpokenVoiceIds ?? [],
      ),
    )
    .toContain("gys-online-id");
  await expect(page.locator(".media-meta small")).toContainText("TTS sistem");
});

test("browser Local uses only an installed local voice", async ({ page }) => {
  await openBrowserSpeechPlayer(page, "local");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as Window & { __gysSpokenVoiceIds?: string[] })
            .__gysSpokenVoiceIds ?? [],
      ),
    )
    .toContain("gys-local-id");
  await expect(page.locator(".media-meta small")).toContainText("TTS lokal");
  const spokenVoiceIds = await page.evaluate(
    () =>
      (window as Window & { __gysSpokenVoiceIds?: string[] })
        .__gysSpokenVoiceIds ?? [],
  );
  expect(spokenVoiceIds).not.toContain("gys-online-id");
});

for (const width of [390, 768, 1440]) {
  test(`sidebar docking respects reduced motion and preserves pause (${width}px)`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openSpeechPlayerAtDesktop(page);
    await page.setViewportSize({ width, height: 900 });
    const media = page.locator(".media-surface");
    await page
      .getByRole("button", { name: "Perbesar pemutar", exact: true })
      .click();
    await expect(media).not.toHaveClass(/is-minimized/);
    await triggerMediaAction(page, "pause");
    await expect.poll(() => readMediaPlaybackState(page)).toBe("paused");
    await page
      .getByRole("button", { name: "Minimalkan pemutar", exact: true })
      .click();
    await expect(media).toHaveClass(/is-minimized/);
    expect(await media.evaluate((node) => node.getAnimations().length)).toBe(0);
    expect(await readMediaPlaybackState(page)).toBe("paused");
    const bounds = (await media.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    await page
      .getByRole("button", { name: "Perbesar pemutar", exact: true })
      .click();
    expect(await readMediaPlaybackState(page)).toBe("paused");
    await media.locator(".media-minimize").click();
    await expect(media).toHaveClass(/is-minimized/);
    await clickMediaStop(page);
    await expect.poll(() => readMediaPlaybackState(page)).toBe("none");
  });
}
