import assert from "node:assert/strict";
import { test } from "node:test";
import { edgeStopEvidence } from "./edge-stop-evidence.mjs";

const event = (id, scope, message = "Cancelled", level = "info") => ({
  id,
  scope,
  message,
  level,
});

test("a pending Edge request records network cancellation", () => {
  assert.equal(
    edgeStopEvidence([event("current", "tts.edge.abort")]),
    "network-abort",
  );
});

test("Stop also succeeds when audio arrives before the native click", () => {
  assert.equal(
    edgeStopEvidence([
      event("receive", "tts.edge.receive", "Waiting for audio frames"),
      event("audio", "tts.edge.audio", "Received 18240 audio bytes"),
    ]),
    "synthesis-complete",
  );
});

test("a stale request cannot prove the current Stop worked", () => {
  assert.equal(
    edgeStopEvidence(
      [
        event("old-abort", "tts.edge.abort"),
        event("old-audio", "tts.edge.audio", "Received 18240 audio bytes"),
        event("current", "tts.edge.receive", "Waiting for audio frames"),
      ],
      ["old-abort", "old-audio"],
    ),
    undefined,
  );
});

test("transport errors and empty audio remain failures", () => {
  assert.equal(
    edgeStopEvidence([
      event("error", "tts.edge.abort", "Connection failed", "error"),
      event("empty", "tts.edge.audio", "Received 0 audio bytes"),
      event("failed", "tts.edge.audio", "Received 200 audio bytes", "error"),
    ]),
    undefined,
  );
});
