import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem(
      "gys-e2e-boot",
      String(Number(sessionStorage.getItem("gys-e2e-boot") ?? "0") + 1),
    );
    const armed = localStorage.getItem("gys-e2e-update-armed") !== "done";
    const worker = new EventTarget() as EventTarget & {
      state: string;
      postMessage: (message: { type: string }) => void;
    };
    worker.state = "installed";
    worker.postMessage = (message) => {
      if (message.type !== "SKIP_WAITING") return;
      localStorage.setItem("gys-e2e-update-activation", "requested");
      localStorage.setItem("gys-e2e-update-armed", "done");
    };
    const registration = new EventTarget() as EventTarget & {
      waiting: typeof worker | null;
      installing: null;
      active: { postMessage: () => void };
      update: () => Promise<void>;
    };
    Object.assign(registration, {
      waiting: armed ? worker : null,
      installing: null,
      active: { postMessage() {} },
      update: async () => undefined,
    });
    const serviceWorker = new EventTarget();
    Object.assign(serviceWorker, {
      controller: {},
      ready: Promise.resolve(registration),
      register: async () => registration,
    });
    Object.defineProperty(navigator, "serviceWorker", {
      value: serviceWorker,
      configurable: true,
    });
  });
});

const boot = async (page: import("@playwright/test").Page) => {
  try {
    return await page.evaluate(() =>
      Number(sessionStorage.getItem("gys-e2e-boot") ?? "0"),
    );
  } catch {
    // A self-applied update reloads the page; read the counter on the new one.
    await page.waitForLoadState("load");
    return page.evaluate(() =>
      Number(sessionStorage.getItem("gys-e2e-boot") ?? "0"),
    );
  }
};

test("an available update installs itself and reloads the page, with no button", async ({
  page,
}) => {
  test.skip(process.env.GYS_E2E_DEV === "1", "Production update coordinator");
  await page.goto("/GYSApp-Tauri/");
  const banner = page.locator(".app-update-banner");
  await expect(banner).toBeVisible();
  await expect(banner.locator("button")).toHaveCount(0);
  await expect(banner.locator(".app-update-spinner")).toBeVisible();
  await expect(banner.locator(".app-update-bar")).toBeVisible();
  await expect(banner).toContainText("Memperbarui aplikasi");
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("gys-e2e-update-activation")),
    )
    .toBe("requested");
  await page.evaluate(() =>
    navigator.serviceWorker.dispatchEvent(new Event("controllerchange")),
  );
  await expect.poll(() => boot(page)).toBe(2);
  await expect(page.locator(".app-update-banner")).toHaveCount(0);
});

test("a reader never blocks the update: it applies on the page being read", async ({
  page,
}) => {
  test.skip(process.env.GYS_E2E_DEV === "1", "Production update coordinator");
  await page.goto("/GYSApp-Tauri/bible");
  await expect(page.locator(".verse-row").first()).toBeVisible();
  const banner = page.locator(".app-update-banner");
  await expect(banner).toBeVisible();
  // Reading is no longer a reason to hold: the worker activates while the page
  // is on a chapter, and only an unsaved draft or an open surface may pause it.
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("gys-e2e-update-activation")),
    )
    .toBe("requested");
  await page.evaluate(() =>
    navigator.serviceWorker.dispatchEvent(new Event("controllerchange")),
  );
  await expect.poll(() => boot(page)).toBe(2);
  await expect(page.locator(".verse-row").first()).toBeVisible();
});

test("an unsaved note postpones the reload until it is gone", async ({
  page,
}) => {
  test.skip(process.env.GYS_E2E_DEV === "1", "Production update coordinator");
  await page.goto("/GYSApp-Tauri/");
  await expect(page.locator(".app-update-banner")).toBeVisible();
  await page.evaluate(() => {
    const input = document.createElement("textarea");
    input.id = "unsaved-editor";
    document.body.append(input);
  });
  await page.locator("#unsaved-editor").fill("Unsaved text");
  await page.evaluate(() =>
    navigator.serviceWorker.dispatchEvent(new Event("controllerchange")),
  );
  await expect(page.locator(".app-update-banner")).toContainText(
    "Selesaikan tulisan yang sedang dibuka dulu",
  );
  expect(await boot(page)).toBe(1);
  await page.locator("#unsaved-editor").evaluate((element) => element.remove());
  await expect.poll(() => boot(page)).toBe(2);
});

test("a Faith PDF overlay holds the update until it closes", async ({
  page,
}) => {
  test.skip(process.env.GYS_E2E_DEV === "1", "Production update coordinator");
  const pdf = await page.request.get(
    "/GYSApp-Tauri/assets/pdf/001_Pujilah%20Allah%20Yang%20Maha%20Esa.pdf",
  );
  expect(pdf.ok()).toBe(true);
  const bytes = await pdf.body();
  await page.route(/Yesus-Kristus\.pdf/, (route) =>
    route.fulfill({ contentType: "application/pdf", body: bytes }),
  );
  await page.goto("/GYSApp-Tauri/iman");
  await expect(page.locator(".app-update-banner")).toBeVisible();
  await page.locator(".faith-row").first().click();
  await page.getByRole("button", { name: /Baca lebih lanjut/ }).click();
  await expect(page.locator(".faith-pdf-body .pdf-reader")).toBeVisible();
  await expect(page).toHaveURL(/\/iman$/);
  await page.evaluate(() =>
    navigator.serviceWorker.dispatchEvent(new Event("controllerchange")),
  );
  await expect(page.locator(".faith-pdf-body .pdf-reader")).toBeVisible();
  expect(await boot(page)).toBe(1);
  await page.locator(".faith-pdf-close").click();
  await expect.poll(() => boot(page)).toBe(2);
});

test("the packaged entry document resolves to Home", async ({ page }) => {
  await page.goto("/GYSApp-Tauri/index.html");
  await expect(page.locator(".home-grid")).toBeVisible();
  await expect(page).toHaveURL(/\/GYSApp-Tauri\/$/);
  await expect
    .poll(() =>
      page.evaluate(
        () => performance.getEntriesByName("gys-shell-ready").length,
      ),
    )
    .toBe(1);
});

test("a search box that keeps focus does not keep the update waiting", async ({
  page,
}) => {
  await page.goto("/GYSApp-Tauri/literatur");
  const banner = page.locator(".app-update-banner");
  await expect(banner).toBeVisible();
  await page.locator(".search-field input").fill("Kitab");
  await page.getByRole("heading", { name: "Literatur", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("gys-e2e-update-activation")),
    )
    .toBe("requested");
  await expect(banner).toContainText("Memperbarui aplikasi");
});

test("a redundant waiting worker removes its stale update banner", async ({
  page,
}) => {
  await page.goto("/GYSApp-Tauri/");
  await expect(page.locator(".app-update-banner")).toBeVisible();
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    Object.defineProperty(registration.waiting, "state", {
      value: "redundant",
      configurable: true,
    });
    registration.waiting!.dispatchEvent(new Event("statechange"));
  });
  await expect(page.locator(".app-update-banner")).toHaveCount(0);
});
