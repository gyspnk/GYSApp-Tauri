import { describe, expect, it, vi } from "vitest";
import {
  createTauriPlatformServices,
  type TauriInvoke,
} from "./native-platform.js";

function createInvoke(): {
  invoke: TauriInvoke;
  mock: ReturnType<typeof vi.fn>;
  calls: Array<{ command: string; args: Record<string, unknown> | undefined }>;
} {
  const values = new Map<string, string>();
  const databaseValues = new Map<string, string>();
  const secrets = new Map<string, string>();
  const blobs = new Map<string, string>();
  const calls: Array<{
    command: string;
    args: Record<string, unknown> | undefined;
  }> = [];
  const mock = vi.fn(
    async (command: string, args?: Record<string, unknown>) => {
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
        case "database_get":
          return databaseValues.get(String(args?.key)) ?? null;
        case "database_set":
          databaseValues.set(String(args?.key), String(args?.value));
          return null;
        case "database_remove":
          databaseValues.delete(String(args?.key));
          return null;
        case "secret_get":
          return secrets.get(String(args?.key)) ?? null;
        case "secret_set":
          secrets.set(String(args?.key), String(args?.value));
          return null;
        case "secret_remove":
          secrets.delete(String(args?.key));
          return null;
        case "deep_link_current":
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
    },
  );
  return { invoke: mock as TauriInvoke, mock, calls };
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

    expect(
      calls
        .map(({ command }) => command)
        .filter((command) => command !== "deep_link_current"),
    ).toEqual([
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

    expect(
      calls
        .map(({ command }) => command)
        .filter((command) => command !== "deep_link_current"),
    ).toEqual(["blob_put_atomic", "blob_get", "blob_remove", "open_external"]);
  });

  it("uses the native SQLite database command boundary separately from preferences", async () => {
    const { invoke, calls } = createInvoke();
    const services = createTauriPlatformServices(invoke);

    await services.database.set("catalog", { version: 1, items: 3 });
    await expect(
      services.database.get<{ version: number }>("catalog"),
    ).resolves.toEqual({ version: 1, items: 3 });
    await services.database.remove("catalog");
    await expect(services.database.get("catalog")).resolves.toBeUndefined();

    expect(
      calls
        .map(({ command }) => command)
        .filter((command) => command !== "deep_link_current"),
    ).toEqual([
      "database_set",
      "database_get",
      "database_remove",
      "database_get",
    ]);
  });

  it("does not advertise browser-only capabilities as native storage guarantees", () => {
    const { invoke } = createInvoke();
    const services = createTauriPlatformServices(invoke);

    expect(services.hasCapability("fileDialog")).toBe(true);
    expect(services.hasCapability("deepLinks")).toBe(true);
    expect(services.hasCapability("database")).toBe(true);
    expect(services.hasCapability("secureStorage")).toBe(true);
    expect(services.hasCapability("lifecycle")).toBe(true);
    expect(services.database.engine).toBe("native-app-data");
    expect(services.hasCapability("audio")).toBe(true);
    expect(services.hasCapability("speech")).toBe(false);
  });

  it("keeps secrets in the native credential-store boundary", async () => {
    const { invoke, calls } = createInvoke();
    const services = createTauriPlatformServices(invoke);

    await services.secrets.set("egys-session", "opaque-cookie");
    await expect(services.secrets.get("egys-session")).resolves.toBe(
      "opaque-cookie",
    );
    await services.secrets.remove("egys-session");
    await expect(services.secrets.get("egys-session")).resolves.toBeUndefined();

    expect(
      calls
        .map(({ command }) => command)
        .filter((command) => command !== "deep_link_current"),
    ).toEqual(["secret_set", "secret_get", "secret_remove", "secret_get"]);
    expect(services.secrets.persistent).toBe(true);
  });

  it("uses native file dialog commands for import/export", async () => {
    const { invoke, mock } = createInvoke();
    mock.mockImplementation(async (command, args) => {
      if (command === "file_dialog_open")
        return [
          {
            name: "backup.gysbk",
            mimeType: "application/octet-stream",
            bytes: "AAEC",
          },
        ];
      if (command === "file_dialog_save") return null;
      throw new Error(`Unexpected native command: ${command}`);
    });
    const services = createTauriPlatformServices(invoke);

    await expect(services.files.open({ accept: [".gysbk"] })).resolves.toEqual([
      {
        name: "backup.gysbk",
        mimeType: "application/octet-stream",
        bytes: new Uint8Array([0, 1, 2]),
      },
    ]);
    await expect(
      services.files.save({
        name: "backup.gysbk",
        mimeType: "application/octet-stream",
        bytes: new Uint8Array([3, 4]),
      }),
    ).resolves.toBeUndefined();
  });
});
