import { describe, expect, it } from "vitest";
import { edgeTokenTicks, generateSecMsGecV2 } from "./edge-ms-gec.js";

// Same reference pairs as apps/web/src/edge-ms-gec.test.ts (from edge-tts
// 7.3.1). If the Worker copy drifts, this fails.
const REFERENCE: readonly [number, string][] = [
  [
    1_762_819_200,
    "CBA6676B2C2162C0-962FD90FE1D3B2BF484EFE25443E1DF2EB796E747059C06991CEE145EDA3147F",
  ],
  [
    1_789_084_800,
    "B341E370FC044396-8688807F6B373C6B6AC1AD8D43D37675FA5D5C0478D5C39095D7BCEBA098B24F",
  ],
];

describe("Worker copy of the Edge handshake token", () => {
  it.each(REFERENCE)("matches the web build for %i", (seconds, token) => {
    expect(generateSecMsGecV2(seconds * 1_000)).toBe(token);
  });

  it("aligns to the five minute window", () => {
    expect(edgeTokenTicks(1_762_819_200_000)).toBe(
      edgeTokenTicks(1_762_819_499_000),
    );
  });
});
