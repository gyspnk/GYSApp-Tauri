import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const worker = new EventTarget() as EventTarget & {
      state: string;
      postMessage: (message: { type: string }) => void;
    };
    worker.state = "installed";
    worker.postMessage = (message) => {
      if (message.type === "SKIP_WAITING")
        localStorage.setItem("gys-e2e-update-activation", "requested");
    };
    const registration = new EventTarget() as EventTarget & {
      waiting: typeof worker;
      installing: null;
      active: { postMessage: () => void };
      update: () => Promise<void>;
    };
    Object.assign(registration, {
      waiting: worker,
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

test("an available update preserves reading and unsaved notes until leaving the reader", async ({
  page,
}) => {
  test.skip(process.env.GYS_E2E_DEV === "1", "Production update coordinator");
  await page.goto("/GYSApp-Tauri/bible");
  await expect(page.locator(".verse-row").first()).toBeVisible();
  const banner = page.locator(".app-update-banner");
  await expect(banner).toBeVisible();
  await expect(banner.locator("button")).toBeDisabled();
  await page.locator(".verse-text").first().click();
  await page.getByRole("button", { name: "Catatan ayat", exact: true }).click();
  const draft = page.getByLabel("Catatan pribadi");
  await draft.fill("Unsaved note survives a controller change");
  await page.evaluate(() =>
    navigator.serviceWorker.dispatchEvent(new Event("controllerchange")),
  );
  await expect(draft).toHaveValue("Unsaved note survives a controller change");
  expect(
    await page.evaluate(() =>
      localStorage.getItem("gys-e2e-update-activation"),
    ),
  ).toBeNull();
});

test("activation is explicit and disabled for an unsubmitted editor", async ({
  page,
}) => {
  test.skip(process.env.GYS_E2E_DEV === "1", "Production update coordinator");
  await page.goto("/GYSApp-Tauri/");
  const banner = page.locator(".app-update-banner");
  await expect(banner).toBeVisible();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("gys-e2e-update-activation"),
    ),
  ).toBeNull();
  await page.evaluate(() => {
    const input = document.createElement("textarea");
    input.id = "unsaved-editor";
    document.body.append(input);
  });
  await page.locator("#unsaved-editor").fill("Unsaved text");
  await page.locator(".home-page h1").click();
  await expect(banner.locator("button")).toBeDisabled();
  await page.locator("#unsaved-editor").evaluate((element) => element.remove());
  await expect(banner.locator("button")).toBeEnabled();
  await banner.locator("button").click();
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("gys-e2e-update-activation")),
    )
    .toBe("requested");
});

test("a Faith PDF overlay blocks updates even while the catalog URL stays unchanged", async ({
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
  const banner = page.locator(".app-update-banner");
  await expect(banner.locator("button")).toBeEnabled();
  await page.locator(".faith-row-heading").first().click();
  await expect(page.locator(".faith-pdf-body .pdf-reader")).toBeVisible();
  await expect(page).toHaveURL(/\/iman$/);
  await expect(banner.locator("button")).toBeDisabled();
  await page.evaluate(() =>
    navigator.serviceWorker.dispatchEvent(new Event("controllerchange")),
  );
  await expect(page.locator(".faith-pdf-body .pdf-reader")).toBeVisible();
  await expect(banner.locator("button")).toBeDisabled();
  await page.locator(".faith-pdf-close").click();
  await expect(banner.locator("button")).toBeEnabled();
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

test("catalog searching does not leave the update blocked after blur", async ({
  page,
}) => {
  await page.goto("/GYSApp-Tauri/literatur");
  const banner = page.locator(".app-update-banner");
  await expect(banner.locator("button")).toBeEnabled();
  await page.locator(".search-field input").fill("Kitab");
  await page.getByRole("heading", { name: "Literatur", exact: true }).click();
  await expect(banner.locator("button")).toBeEnabled();
  await banner.locator("button").click();
  await expect(banner).toContainText("Memasang pembaruan");
  await expect(banner.locator("button")).toBeDisabled();
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
