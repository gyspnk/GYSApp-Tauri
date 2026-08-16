import { describe, expect, it } from "vitest";
import {
  BrowserDeepLinks,
  BrowserFileDialogs,
  BrowserLifecycle,
  BrowserNotifications,
  EphemeralSecretStore,
} from "./platform-capabilities.js";

describe("platform capability adapters", () => {
  it("keeps the browser secret boundary explicitly ephemeral", async () => {
    const secrets = new EphemeralSecretStore();
    expect(secrets.persistent).toBe(false);
    await secrets.set("session", "transient");
    await expect(secrets.get("session")).resolves.toBe("transient");
    await secrets.remove("session");
    await expect(secrets.get("session")).resolves.toBeUndefined();
  });

  it("does not claim browser-only capabilities in a node/test environment", async () => {
    const notifications = new BrowserNotifications();
    await expect(notifications.permission()).resolves.toBe("unsupported");
    await expect(new BrowserFileDialogs().open()).rejects.toThrow(
      "File dialogs are unavailable",
    );
    expect(new BrowserDeepLinks().current()).toBeUndefined();
    expect(new BrowserDeepLinks().subscribe(() => undefined)).toBeTypeOf(
      "function",
    );
    expect(
      new BrowserLifecycle().subscribe("foreground", () => undefined),
    ).toBeTypeOf("function");
  });
});
