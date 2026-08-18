export const EGYS_AUTH_MODE = "v1-native" as const;

export const DISABLED_EGYS_V2_PROVIDERS = Object.freeze({
  google: Object.freeze({ enabled: false, clientId: null }),
  apple: Object.freeze({ enabled: false, clientId: null }),
  whatsapp: false,
});

export class EgysV2DisabledError extends Error {
  public constructor() {
    super(
      "e-GYS v2 authentication is disabled while the upstream service remains work in progress",
    );
    this.name = "EgysV2DisabledError";
  }
}

/**
 * Guard legacy browser/provider entry points so no v2 authentication request
 * can be started accidentally while the live service still uses v1.
 */
export function requireEgysV2Disabled(): never {
  throw new EgysV2DisabledError();
}

/** Publish the active auth boundary for support diagnostics and truthful UI. */
export function applyEgysRuntimeMetadata(
  root: HTMLElement = document.documentElement,
): void {
  root.dataset.egysAuthMode = EGYS_AUTH_MODE;
}
