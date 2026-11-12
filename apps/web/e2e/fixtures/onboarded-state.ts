/**
 * Storage state for every spec except the welcome contract: a device that has
 * already finished the first-run screen. The welcome screen is covered by
 * `e2e/welcome.spec.ts`, which clears this state on purpose.
 */
export const ONBOARDED_ENVELOPE = JSON.stringify({
  version: 1,
  locale: "id",
  theme: "light",
  onboarded: true,
});

export const ONBOARDED_STATE = {
  cookies: [],
  origins: [
    {
      origin: "http://127.0.0.1:4173",
      localStorage: [
        { name: "gys-shell-settings-v1", value: ONBOARDED_ENVELOPE },
      ],
    },
  ],
};
