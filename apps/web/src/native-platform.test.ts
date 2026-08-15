import { describe, expect, it, vi } from "vitest";
import {
  createTauriPlatformServices,
  type TauriInvoke,
} from "./native-platform.js";

function createInvoke(): {
  invoke: TauriInvoke;
  calls: Array<{ command: string; args: Record<string, unknown> | undefined }>;
} {
  const values = new Map<string, string>();
  const blobs = new Map<string, string>();
  const calls: Array<{
    command: string;
    args: Record<string, unknown> | undefined;
  }> = [];
  const invoke = vi.fn(async (command, args) => {
    calls.push({ command, args });
    switch (command) {
      case "key_value_get":
        return values.get(String(args?.key)) ?? null;
      case "key_value_set":
        values.set(String(args?.key), String(args?.value));
        return null;
      case "key_value_remove":
        values.delete(String(args?.key));
        return null;
      case "blob_get":
        return blobs.get(String(args?.key)) ?? null;
      case "blob_put_atomic":
        blobs.set(String(args?.key), String(args?.bytes));
        return null;
      case "blob_remove":
        blobs.delete(String(args?.key));
        return null;
      case "open_external":
        return null;
      default:
        throw new Error(`Unexpected native command: ${command}`);
    }
  });
  return { invoke, calls };
}

describe("Tauri platform adapter", () => {
  it("round-trips typed key-value data through native commands", async () => {
    const { invoke, calls } = createInvoke();
    const services = createTauriPlatformServices(invoke);

    await services.keyValue.set("settings", { locale: "id", version: 2 });
    await expect(
      services.keyValue.get<{ locale: string }>("settings"),
    ).resolves.toEqual({
      locale: "id",
      version: 2,
    });
    await services.keyValue.remove("settings");
    await expect(services.keyValue.get("settings")).resolves.toBeUndefined();

    expect(calls.map(({ command }) => command)).toEqual([
      "key_value_set",
      "key_value_get",
      "key_value_remove",
      "key_value_get",
    ]);
  });

  it("round-trips binary blobs as base64 and delegates safe external links", async () => {
    const { invoke, calls } = createInvoke();
    const services = createTauriPlatformServices(invoke);
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255]);

    await services.blobs.putAtomic("midi/demo", bytes);
    bytes[0] = 99;
    await expect(services.blobs.get("midi/demo")).resolves.toEqual(
      new Uint8Array([0, 1, 2, 253, 254, 255]),
    );
    await services.blobs.remove("midi/demo");
    await services.openExternal("https://example.org/gys");

    expect(calls.map(({ command }) => command)).toEqual([
      "blob_put_atomic",
      "blob_get",
      "blob_remove",
      "open_external",
    ]);
  });

  it("does not advertise browser-only capabilities as native storage guarantees", () => {
    const { invoke } = createInvoke();
    const services = createTauriPlatformServices(invoke);

    expect(services.hasCapability("fileDialog")).toBe(false);
    expect(services.hasCapability("deepLinks")).toBe(false);
    expect(services.hasCapability("audio")).toBe(true);
    expect(services.hasCapability("speech")).toBe(false);
  });
});
