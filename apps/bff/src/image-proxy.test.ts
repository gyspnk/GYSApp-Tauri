import { afterEach, expect, it, vi } from "vitest";
import { fetchOfficialImage } from "./image-proxy.js";
const url = new URL("https://tjc.org/id/wp-content/uploads/cover.png");
afterEach(() => vi.useRealTimers());

it("abandons a stalled publisher connection and streams the mirror without a body timeout", async () => {
  vi.useFakeTimers();
  let close!: () => void;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      close = () => controller.close();
    },
  });
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) =>
          init!.signal!.addEventListener(
            "abort",
            () => reject(init!.signal!.reason),
            { once: true },
          ),
        ),
    )
    .mockResolvedValueOnce(
      new Response(stream, { headers: { "content-type": "image/png" } }),
    );
  const response = fetchOfficialImage(
    url,
    new AbortController().signal,
    fetcher,
  );
  await vi.advanceTimersByTimeAsync(3_001);
  const image = await response;
  expect(fetcher).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(20_000);
  expect(fetcher.mock.calls[1]![1]!.signal!.aborted).toBe(false);
  close();
  await image!.arrayBuffer();
});

it("shares an eight-second connection budget across failed mirrors", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn<typeof fetch>(
    (_url, init) =>
      new Promise((_resolve, reject) =>
        init!.signal!.addEventListener(
          "abort",
          () => reject(init!.signal!.reason),
          { once: true },
        ),
      ),
  );
  const pending = fetchOfficialImage(
    url,
    new AbortController().signal,
    fetcher,
  );
  await vi.advanceTimersByTimeAsync(8_001);
  expect(await pending).toBeUndefined();
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it("cancelling the reader stops the image request without trying another mirror", async () => {
  const controller = new AbortController();
  const fetcher = vi.fn<typeof fetch>(
    (_url, init) =>
      new Promise((_resolve, reject) =>
        init!.signal!.addEventListener(
          "abort",
          () => reject(init!.signal!.reason),
          { once: true },
        ),
      ),
  );
  const pending = fetchOfficialImage(url, controller.signal, fetcher);
  const rejected = expect(pending).rejects.toMatchObject({
    name: "AbortError",
  });
  controller.abort();
  await rejected;
  expect(fetcher).toHaveBeenCalledOnce();
});
