import { describe, expect, it } from "vitest";
import { edgeTokenTicks, generateSecMsGecV2 } from "./edge-ms-gec.js";

// Reference values from edge-tts 7.3.1 `generate_sec_ms_gec_v2`, generated with
// the same unix timestamps. A transcription slip in the patched digest moves
// any of these, so they are the contract for the October 2026 handshake.
const REFERENCE: readonly [number, string][] = [
  [
    1_762_819_200,
    "CBA6676B2C2162C0-962FD90FE1D3B2BF484EFE25443E1DF2EB796E747059C06991CEE145EDA3147F",
  ],
  [
    1_762_819_500,
    "DA5452C6C9246816-059728867D13ED992E2F221030C73362803EABD341ED84263949E53965F83E38",
  ],
];

describe("Edge read-aloud handshake token", () => {
  it.each(REFERENCE)("matches edge-tts for %i", (seconds, token) => {
    expect(generateSecMsGecV2(seconds * 1_000)).toBe(token);
  });

  it("rounds the salt down to a five minute window", () => {
    expect(edgeTokenTicks(1_762_819_200_000)).toBe(
      edgeTokenTicks(1_762_819_499_000),
    );
    expect(edgeTokenTicks(1_762_819_200_000)).not.toBe(
      edgeTokenTicks(1_762_819_500_000),
    );
  });

  it("keeps the two halves apart", () => {
    const token = generateSecMsGecV2(1_762_819_200_000);
    expect(token.slice(16, 17)).toBe("-");
    expect(token.slice(0, 16)).toHaveLength(16);
    expect(token.slice(17)).toHaveLength(64);
  });
});
