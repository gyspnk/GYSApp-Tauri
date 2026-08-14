import { describe, expect, it } from "vitest";
import {
  decryptBackupV2,
  encryptBackupV2,
  importLegacyGysbk,
} from "./backup.js";

describe("BackupEnvelopeV2", () => {
  it("round-trips domain data with a random nonce and salt", async () => {
    const first = await encryptBackupV2(
      { bible: { last: "John 3" }, settings: { locale: "id" } },
      "correct horse",
      { appVersion: "0.1.0", domains: ["bible", "settings"] },
      () => new Date("2026-08-14T00:00:00.000Z"),
    );
    const second = await encryptBackupV2(
      { bible: { last: "John 3" }, settings: { locale: "id" } },
      "correct horse",
      { appVersion: "0.1.0", domains: ["bible", "settings"] },
      () => new Date("2026-08-14T00:00:00.000Z"),
    );
    expect(first.version).toBe(2);
    expect(first.nonce).not.toBe(second.nonce);
    await expect(decryptBackupV2(first, "correct horse")).resolves.toEqual({
      bible: { last: "John 3" },
      settings: { locale: "id" },
    });
  });

  it("rejects a wrong password before returning any domain data", async () => {
    const envelope = await encryptBackupV2(
      { songs: { pinned: ["001"] } },
      "secret!!",
      { appVersion: "0.1.0", domains: ["songs"] },
    );
    await expect(decryptBackupV2(envelope, "wrong!!!")).rejects.toThrow();
  });

  it("treats malformed legacy backups as import errors", async () => {
    await expect(importLegacyGysbk("not-a-backup")).rejects.toThrow(
      "legacy backup",
    );
  });
});
