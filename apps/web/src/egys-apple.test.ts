import { afterEach, beforeEach, expect, it, vi } from "vitest";

let scripts: Array<{
  src?: string;
  onload?: () => void;
  onerror?: () => void;
  remove: () => void;
}>;
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  scripts = [];
  vi.stubGlobal("window", { setTimeout, clearTimeout });
  vi.stubGlobal("document", {
    createElement: () => ({ remove: vi.fn() }),
    head: {
      append: (script: (typeof scripts)[number]) => scripts.push(script),
    },
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("resolves a cold SDK load once and shares concurrent requests", async () => {
  const { loadEgysApple } = await import("./egys-apple.js");
  const first = loadEgysApple();
  expect(loadEgysApple()).toBe(first);
  expect(scripts).toHaveLength(1);
  window.AppleID = { auth: { init: vi.fn(), signIn: vi.fn() } };
  scripts[0]!.onload!();
  await expect(first).resolves.toBeUndefined();
  await expect(loadEgysApple()).resolves.toBeUndefined();
  expect(vi.getTimerCount()).toBe(0);
});

it("retries after a timed-out SDK without retaining a rejected promise", async () => {
  const { loadEgysApple } = await import("./egys-apple.js");
  const failed = expect(loadEgysApple()).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(10_000);
  await failed;
  expect(scripts[0]!.remove).toHaveBeenCalledOnce();
  const second = loadEgysApple();
  window.AppleID = { auth: { init: vi.fn(), signIn: vi.fn() } };
  scripts[1]!.onload!();
  await expect(second).resolves.toBeUndefined();
});

it("uses the live service configuration and rejects another attempt's state", async () => {
  let state = "";
  const init = vi.fn((options: { state: string }) => {
    state = options.state;
  });
  const signIn = vi.fn(async () => ({
    authorization: { code: "code", id_token: "token", state },
  }));
  window.AppleID = { auth: { init, signIn } };
  const { signInEgysApple } = await import("./egys-apple.js");
  await expect(signInEgysApple()).resolves.toEqual({
    code: "code",
    id_token: "token",
  });
  expect(init).toHaveBeenCalledWith(
    expect.objectContaining({
      clientId: "id.or.gys.e.client",
      redirectURI: "https://e.gys.or.id/login",
      scope: "name email",
      usePopup: true,
    }),
  );
  signIn.mockResolvedValueOnce({
    authorization: {
      code: "code",
      id_token: "token",
      state: "another-attempt",
    },
  });
  await expect(signInEgysApple()).rejects.toThrow("authorization invalid");
});
