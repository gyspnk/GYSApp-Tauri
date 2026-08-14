import { describe, expect, it } from "vitest";
import {
  AccountProfileSchema,
  ChordDocumentV2Schema,
  ErrorResponseSchema,
  UpstreamMusicLockSchema,
} from "./index.js";

describe("public contracts", () => {
  it("accepts an immutable upstream music lock with hashed items", () => {
    const result = UpstreamMusicLockSchema.safeParse({
      sourceRepo: "gyspnk/gyschordweb",
      sourceCommit: "cbc7d386",
      generatedAt: "2026-08-14T00:00:00.000Z",
      items: [
        {
          id: "hymn-001",
          kind: "midi",
          path: "assets/midi/001.mid",
          size: 42,
          sha256: "a".repeat(64),
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("rejects a lock item with a non-sha256 digest", () => {
    const result = UpstreamMusicLockSchema.safeParse({
      sourceRepo: "gyspnk/gyschordweb",
      sourceCommit: "cbc7d386",
      generatedAt: "2026-08-14T00:00:00.000Z",
      items: [{ id: "x", kind: "pdf", path: "x.pdf", size: 1, sha256: "bad" }],
    });

    expect(result.success).toBe(false);
  });

  it("models chord note alignment and source provenance", () => {
    const parsed = ChordDocumentV2Schema.parse({
      version: 2,
      songId: "hymn-001",
      title: "Kasih Setia-Mu",
      key: "C",
      sourceCommit: "cbc7d386",
      sourcePath: "assets/chords/001.json",
      verses: [
        {
          label: "1",
          lines: [
            { text: "Kasih setia-Mu", chords: [{ token: "C", index: 0 }] },
          ],
        },
      ],
    });

    expect(parsed.verses[0]?.lines[0]?.chords[0]?.token).toBe("C");
  });

  it("normalizes profile and structured errors", () => {
    expect(
      AccountProfileSchema.parse({ id: "u1", displayName: "Grace" })
        .displayName,
    ).toBe("Grace");
    expect(
      ErrorResponseSchema.parse({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request",
          requestId: "r1",
        },
      }).error.code,
    ).toBe("VALIDATION_ERROR");
  });
});
