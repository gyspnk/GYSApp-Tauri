import { describe, expect, it } from "vitest";
import type { EdgeTtsRequest } from "@gys/contracts";
import { buildAzureSsml, synthesizeAzureSpeech } from "./azure-speech.js";

const base: EdgeTtsRequest = {
  text: "Allah <esa> & benar",
  voice: "id-ID-GadisNeural",
  rate: 1,
  pitch: 1,
  volume: 1,
};

describe("Azure speech", () => {
  it("leaves neutral prosody out and escapes the text", () => {
    const ssml = buildAzureSsml(base);
    expect(ssml).toContain('name="id-ID-GadisNeural"');
    expect(ssml).toContain("Allah &lt;esa&gt; &amp; benar");
    expect(ssml).not.toContain("<prosody");
  });

  it("expresses speed and pitch as percentages", () => {
    const ssml = buildAzureSsml({ ...base, rate: 0.9, pitch: 1.1 });
    expect(ssml).toContain('rate="-10%"');
    expect(ssml).toContain('pitch="+5%"');
    expect(ssml).toContain("</prosody>");
  });

  it("reports the upstream status when synthesis fails", async () => {
    const fetchImpl = (async () =>
      new Response("denied", { status: 401 })) as unknown as typeof fetch;
    await expect(
      synthesizeAzureSpeech(base, {
        key: "k",
        region: "southeastasia",
        fetchImpl,
      }),
    ).rejects.toThrow("Azure speech failed (401)");
  });

  it("rejects a non-audio body", async () => {
    const fetchImpl = (async () =>
      new Response('{"ok":true}', {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;
    await expect(
      synthesizeAzureSpeech(base, {
        key: "k",
        region: "southeastasia",
        fetchImpl,
      }),
    ).rejects.toThrow("Azure speech returned invalid media");
  });
});
