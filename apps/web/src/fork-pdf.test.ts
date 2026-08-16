import { describe, expect, it } from "vitest";
import { forkManifestSongKey } from "./fork-pdf.js";

describe("GYSApp-Fork hymn PDF mapping", () => {
  it("preserves suffixed hymn identities from the source database", () => {
    expect(forkManifestSongKey("hymn-051A")).toBe("051A");
    expect(forkManifestSongKey("124b")).toBe("124B");
    expect(forkManifestSongKey(1)).toBe("001");
  });
});
