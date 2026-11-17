import { expect, test } from "@playwright/test";

// The welcome screen only appears on a device with no shell settings, so these
// tests clear the storage state the shared config seeds for every other spec.
test.use({ storageState: { cookies: [], origins: [] } });

const ROOT = "/GYSApp-Tauri/";

async function openWelcome(page: import("@playwright/test").Page) {
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto(ROOT);
  await expect(page.locator(".welcome-card")).toBeVisible();
}

test("a first visit greets the reader in one heading and can skip", async ({
  page,
}) => {
  await openWelcome(page);
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("h1")).toHaveText("Selamat datang di GYSApp");
  const skip = page.getByRole("button", { name: "Lewati, mulai membaca" });
  const box = await skip.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  await skip.click();
  await expect(page.locator(".welcome-page")).toHaveCount(0);
  await expect(page.locator(".home-grid")).toBeVisible();
  const stored = await page.evaluate(() =>
    localStorage.getItem("gys-shell-settings-v1"),
  );
  expect(JSON.parse(stored ?? "{}")).toMatchObject({ onboarded: true });
  await page.reload();
  await expect(page.locator(".welcome-page")).toHaveCount(0);
});

test("the language choice applies before the reader starts", async ({
  page,
}) => {
  await openWelcome(page);
  await page.getByRole("combobox", { name: "Pilih bahasa" }).click();
  await page.getByRole("option", { name: "English" }).click();
  await expect(page.locator("h1")).toHaveText("Welcome to GYSApp");
  await page.getByRole("combobox", { name: "Choose a language" }).click();
  await page.getByRole("option", { name: "中文" }).click();
  await expect(page.locator("h1")).toHaveText("欢迎使用 GYSApp");
  await page.getByRole("button", { name: "跳过，开始阅读" }).click();
  await expect(page.locator(".home-grid")).toBeVisible();
  const stored = await page.evaluate(() =>
    localStorage.getItem("gys-shell-settings-v1"),
  );
  expect(JSON.parse(stored ?? "{}")).toMatchObject({
    locale: "zh",
    onboarded: true,
  });
});

test("the sign-in offer never doubles its label and stays optional", async ({
  page,
}) => {
  await openWelcome(page);
  const control = page.locator(".egys-google-control");
  await expect(control).toBeVisible();
  // The decorative face and the fallback both say "Google"; only one may show.
  const visibleLabels = await control.evaluate((element) =>
    Array.from(
      element.querySelectorAll(".egys-google-face, .egys-google-fallback"),
    )
      .filter((node) => getComputedStyle(node).display !== "none")
      .map((node) => node.textContent?.trim()),
  );
  expect(visibleLabels).toEqual(["Google"]);
  // The press target is the pill inside the provider frame, not the frame
  // itself: a 1 px border used to shrink 44 px of control to a 42 px button.
  const press = await page
    .locator(".welcome-login .egys-google-control .egys-google-fallback")
    .boundingBox();
  expect(press?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(press?.width ?? 0).toBeGreaterThanOrEqual(44);
  await expect(
    page.getByRole("button", { name: "Lewati, mulai membaca" }),
  ).toBeVisible();
});

test("reduced motion keeps the welcome screen still", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openWelcome(page);
  const durations = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".welcome-card, .welcome-skip")).map(
      (node) => getComputedStyle(node).transitionDuration,
    ),
  );
  expect(durations.every((value) => value === "0s")).toBe(true);
});

test("a landscape phone shows the skip without scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await openWelcome(page);
  const metrics = await page.evaluate(() => {
    const skip = document
      .querySelector(".welcome-skip")
      ?.getBoundingClientRect();
    const google = document
      .querySelector(".egys-google-fallback")
      ?.getBoundingClientRect();
    return {
      skipBottom: skip?.bottom ?? 0,
      skipTop: skip?.top ?? 0,
      skipHeight: skip?.height ?? 0,
      googleHeight: google?.height ?? 0,
      viewport: innerHeight,
      scroll: document.documentElement.scrollHeight - innerHeight,
      overflow: document.documentElement.scrollWidth - innerWidth,
    };
  });
  // The way out of the first screen must be reachable without a scroll.
  expect(metrics.skipTop).toBeGreaterThanOrEqual(0);
  expect(metrics.skipBottom).toBeLessThanOrEqual(metrics.viewport);
  expect(metrics.scroll).toBeLessThanOrEqual(1);
  expect(metrics.overflow).toBeLessThanOrEqual(1);
  expect(metrics.skipHeight).toBeGreaterThanOrEqual(44);
  expect(metrics.googleHeight).toBeGreaterThanOrEqual(44);
  await expect(page.locator("h1")).toHaveCount(1);
});

test("web Google sign-in completes onboarding once and recovers from failures", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.route("https://accounts.google.com/gsi/client*", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.google = { accounts: { id: {
        initialize(options) {
          window.__testWelcomeGoogleCallback = options.callback;
        },
        renderButton(host, options) {
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = "Sign in with Google";
          button.style.width = "100%";
          button.style.height = "44px";
          button.addEventListener("click", () => options.click_listener?.());
          host.replaceChildren(button);
        },
        cancel() {}
      } } };`,
    }),
  );
  let googleAttempt = 0;
  let profileAvailable = false;
  await page.route("**/api/v1/auth/egys/google**", async (route) => {
    googleAttempt += 1;
    expect(route.request().postDataJSON()).toEqual({
      credential: "welcome-gis-credential",
    });
    if (googleAttempt === 1) {
      return route.fulfill({
        status: 401,
        json: { error: { message: "Token Google ditolak oleh e-GYS" } },
      });
    }
    return route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/v1/account/profile**", (route) =>
    route.fulfill({
      json: {
        profile: profileAvailable
          ? {
              id: "welcome-member",
              displayName: "Jemaat Baru",
              locale: "en",
            }
          : null,
      },
    }),
  );

  await page.goto(`${ROOT}kidung`);
  await expect(page.locator(".welcome-card")).toBeVisible();
  await page.getByRole("combobox", { name: "Pilih bahasa" }).click();
  await page.getByRole("option", { name: "English" }).click();
  await expect(page.locator("h1")).toHaveText("Welcome to GYSApp");

  const loginBox = page.locator(".welcome-login");
  const google = loginBox.getByRole("button", { name: "Sign in with Google" });
  const skip = page.getByRole("button", { name: "Skip and start reading" });
  await expect(google).toBeVisible();

  // Attempt 1: backend credential check fails -> Welcome stays open with visible alert.
  await google.click();
  await expect(loginBox.getByRole("status")).toContainText(
    "Waiting for Google.",
  );
  await page.evaluate(() =>
    (
      window as unknown as {
        __testWelcomeGoogleCallback: (r: { credential: string }) => unknown;
      }
    ).__testWelcomeGoogleCallback({ credential: "welcome-gis-credential" }),
  );
  const alert = loginBox.getByRole("alert");
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("Token Google ditolak oleh e-GYS");
  expect((await alert.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(12);
  expect(
    await alert.evaluate((node) => node.closest(".egys-google-control")),
  ).toBeNull();
  expect((await skip.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await expect(page.locator(".welcome-page")).toHaveCount(1);

  // Attempt 2: credential succeeds, profile returns null -> Welcome stays open.
  await google.click();
  await expect(loginBox.getByRole("alert")).toHaveCount(0);
  await expect(loginBox.getByRole("status")).toContainText(
    "Waiting for Google.",
  );
  await page.evaluate(() =>
    (
      window as unknown as {
        __testWelcomeGoogleCallback: (r: { credential: string }) => unknown;
      }
    ).__testWelcomeGoogleCallback({ credential: "welcome-gis-credential" }),
  );
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(
    "e-GYS sign-in finished, but the profile could not be read",
  );
  await expect(page.locator(".welcome-page")).toHaveCount(1);

  // Attempt 3: credential + profile succeed -> onboarding completes and keeps route + locale.
  profileAvailable = true;
  await google.click();
  await expect(loginBox.getByRole("alert")).toHaveCount(0);
  await page.evaluate(() =>
    (
      window as unknown as {
        __testWelcomeGoogleCallback: (r: { credential: string }) => unknown;
      }
    ).__testWelcomeGoogleCallback({ credential: "welcome-gis-credential" }),
  );
  await expect(page.locator(".welcome-page")).toHaveCount(0);
  await expect(page).toHaveURL(/\/GYSApp-Tauri\/kidung$/);
  await expect(page.locator(".hymn-page")).toBeVisible();
  await expect(page.locator(".account-button-label")).toHaveText("Jemaat");

  const storedSettings = await page.evaluate(() =>
    localStorage.getItem("gys-shell-settings-v1"),
  );
  expect(JSON.parse(storedSettings ?? "{}")).toMatchObject({
    locale: "en",
    onboarded: true,
  });
  const storedProfile = await page.evaluate(() =>
    localStorage.getItem("gys-egys-profile-v1"),
  );
  expect(JSON.parse(storedProfile ?? "{}")).toMatchObject({
    id: "welcome-member",
    displayName: "Jemaat Baru",
  });

  await page.reload();
  await expect(page.locator(".welcome-page")).toHaveCount(0);
  await expect(page).toHaveURL(/\/GYSApp-Tauri\/kidung$/);
});

test("native Welcome uses the embedded e-GYS overlay instead of web GIS", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let gisRequests = 0;
  let profileAvailable = false;
  await page.addInitScript(() => {
    const callbacks = new Map<number, (data: unknown) => void>();
    const listeners = new Map<string, Set<number>>();
    let nextId = 1;
    let failOpen = true;
    const commands: string[] = [];

    (
      window as unknown as {
        __TAURI_EVENT_PLUGIN_INTERNALS__: unknown;
      }
    ).__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener(event: string, eventId: number) {
        listeners.get(event)?.delete(eventId);
      },
    };
    (
      window as unknown as {
        __nativeWelcomeTest: unknown;
      }
    ).__nativeWelcomeTest = {
      commands,
      setFailOpen(next: boolean) {
        failOpen = next;
      },
      listenerCount(event: string) {
        return listeners.get(event)?.size ?? 0;
      },
      emit(event: string, payload: unknown) {
        for (const id of Array.from(listeners.get(event) ?? [])) {
          callbacks.get(id)?.({ event, id, payload });
        }
      },
    };
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {
        transformCallback(callback: (data: unknown) => void) {
          const id = nextId++;
          callbacks.set(id, callback);
          return id;
        },
        unregisterCallback(id: number) {
          callbacks.delete(id);
        },
        invoke: async (command: string, args?: Record<string, unknown>) => {
          commands.push(command);
          if (command === "plugin:event|listen") {
            const event = String(args?.event ?? "");
            const handler = Number(args?.handler ?? 0);
            if (!listeners.has(event)) listeners.set(event, new Set());
            listeners.get(event)!.add(handler);
            return handler;
          }
          if (command === "plugin:event|unlisten") {
            const event = String(args?.event ?? "");
            const eventId = Number(args?.eventId ?? 0);
            listeners.get(event)?.delete(eventId);
            return null;
          }
          if (command === "secret_get") return "native-v1-token";
          if (command === "open_egys_login") {
            if (failOpen) throw new Error("overlay unavailable");
            return null;
          }
          return null;
        },
      },
    });
  });
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.route("https://accounts.google.com/gsi/client*", (route) => {
    gisRequests += 1;
    return route.abort();
  });
  await page.route("**/api/v1/account/profile**", (route) => {
    expect(route.request().headers()["x-gys-client"]).toBe("native");
    expect(route.request().headers().authorization).toBe(
      "Bearer native-v1-token",
    );
    return route.fulfill({
      json: {
        profile: profileAvailable
          ? {
              id: "native-member",
              displayName: "Jemaat Native",
              locale: "id",
            }
          : null,
      },
    });
  });

  await page.goto(ROOT);
  await expect(page.locator(".welcome-card")).toBeVisible();
  const loginBox = page.locator(".welcome-login");
  await expect(loginBox.locator(".egys-google-control")).toHaveCount(0);
  expect(gisRequests).toBe(0);

  const google = loginBox.getByRole("button", { name: "Login dengan Google" });
  const skip = page.getByRole("button", { name: "Lewati, mulai membaca" });
  await expect(google).toBeVisible();
  expect((await google.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  // Opening failure keeps Welcome open with visible feedback and Skip intact.
  await google.click();
  const alert = loginBox.getByRole("alert");
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("Halaman login e-GYS belum dapat dibuka");
  expect((await alert.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(12);
  await expect(skip).toBeVisible();

  // Retry succeeds -> overlay opens, status appears, Welcome stays open until authenticated.
  await page.evaluate(() =>
    (
      window as unknown as {
        __nativeWelcomeTest: { setFailOpen: (v: boolean) => void };
      }
    ).__nativeWelcomeTest.setFailOpen(false),
  );
  await google.click();
  await expect(loginBox.getByRole("alert")).toHaveCount(0);
  await expect(loginBox.getByRole("status")).toContainText(
    "Halaman login resmi e-GYS sudah dibuka.",
  );
  await expect(page.locator(".welcome-page")).toHaveCount(1);

  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as {
            __nativeWelcomeTest: { listenerCount: (e: string) => number };
          }
        ).__nativeWelcomeTest.listenerCount("egys-login-message"),
      ),
    )
    .toBeGreaterThanOrEqual(1);

  // Authenticated event without a real profile keeps onboarding open with an error.
  await page.evaluate(() =>
    (
      window as unknown as {
        __nativeWelcomeTest: { emit: (e: string, p: unknown) => void };
      }
    ).__nativeWelcomeTest.emit("egys-login-message", {
      cmd: "googlelogged",
      authenticated: true,
    }),
  );
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(
    "Login e-GYS selesai, tetapi profil belum dapat dibaca",
  );
  await expect(page.locator(".welcome-page")).toHaveCount(1);

  // Once the profile resolves, onboarding finishes once and updates the shell.
  profileAvailable = true;
  await page.evaluate(() =>
    (
      window as unknown as {
        __nativeWelcomeTest: { emit: (e: string, p: unknown) => void };
      }
    ).__nativeWelcomeTest.emit("egys-login-message", {
      cmd: "googlelogged",
      authenticated: true,
    }),
  );
  await expect(page.locator(".welcome-page")).toHaveCount(0);
  await expect(page.locator(".home-grid")).toBeVisible();
  await expect(page.locator(".account-button-label")).toHaveText("Jemaat");

  const openCalls = await page.evaluate(
    () =>
      (
        window as unknown as {
          __nativeWelcomeTest: { commands: string[] };
        }
      ).__nativeWelcomeTest.commands.filter((c) => c === "open_egys_login")
        .length,
  );
  expect(openCalls).toBe(2);
  const storedSettings = await page.evaluate(() =>
    localStorage.getItem("gys-shell-settings-v1"),
  );
  expect(JSON.parse(storedSettings ?? "{}")).toMatchObject({ onboarded: true });
  const storedProfile = await page.evaluate(() =>
    localStorage.getItem("gys-egys-profile-v1"),
  );
  expect(JSON.parse(storedProfile ?? "{}")).toMatchObject({
    id: "native-member",
    displayName: "Jemaat Native",
  });
});
