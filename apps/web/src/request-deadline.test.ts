import { afterEach, expect, it, vi } from "vitest";
import { withRequestDeadline } from "./request-deadline.js";

afterEach(() => vi.useRealTimers());

it("bounds a body decoder that never settles even if it ignores abort", async () => {
  vi.useFakeTimers();
  let transport!: AbortSignal;
  const result = withRequestDeadline((signal) => {
    transport = signal;
    return new Promise(() => {});
  }, 8_000);
  const rejection = expect(result).rejects.toMatchObject({
    name: "TimeoutError",
  });
  await vi.advanceTimersByTimeAsync(8_000);
  await rejection;
  expect(transport.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it("preserves caller cancellation and never starts a pre-cancelled request", async () => {
  vi.useFakeTimers();
  const caller = new AbortController();
  const reason = new DOMException("navigation left", "AbortError");
  caller.abort(reason);
  const request = vi.fn(async () => "data");
  await expect(withRequestDeadline(request, 8_000, caller.signal)).rejects.toBe(
    reason,
  );
  expect(request).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it("cancels transport and removes its deadline after a fast decode failure", async () => {
  vi.useFakeTimers();
  let transport!: AbortSignal;
  const invalid = new Error("invalid JSON");
  await expect(
    withRequestDeadline(async (signal) => {
      transport = signal;
      throw invalid;
    }, 8_000),
  ).rejects.toBe(invalid);
  expect(transport.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
