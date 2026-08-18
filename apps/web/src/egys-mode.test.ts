import { describe, expect, it } from "vitest";
import {
  DISABLED_EGYS_V2_PROVIDERS,
  EGYS_AUTH_MODE,
  EgysV2DisabledError,
  applyEgysRuntimeMetadata,
  requireEgysV2Disabled,
} from "./egys-mode.js";

describe("e-GYS runtime mode", () => {
  it("locks the active application to native v1 authentication", () => {
    expect(EGYS_AUTH_MODE).toBe("v1-native");
    expect(DISABLED_EGYS_V2_PROVIDERS).toEqual({
      google: { enabled: false, clientId: null },
      apple: { enabled: false, clientId: null },
      whatsapp: false,
    });
  });

  it("fails closed instead of starting a v2 provider flow", () => {
    expect(() => requireEgysV2Disabled()).toThrow(EgysV2DisabledError);
  });

  it("publishes the mode for truthful browser-only UI copy", () => {
    const root = document.createElement("html");
    applyEgysRuntimeMetadata(root);
    expect(root.dataset.egysAuthMode).toBe("v1-native");
  });
});
