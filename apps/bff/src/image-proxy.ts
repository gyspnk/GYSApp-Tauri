/** Limit failed image connections while leaving a successful streaming body intact. */
export async function fetchOfficialImage(
  url: URL,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<Response | undefined> {
  const candidates = [url.href];
  if (
    ["tjc.org", "www.tjc.org"].includes(url.hostname) &&
    url.pathname.includes("wp-content/uploads/")
  ) {
    candidates.push(
      `https://tjcorguploads.s3.amazonaws.com/tjcorg${url.pathname.replace(/^\/id/, "")}`,
      `https://tjcorguploads.s3.amazonaws.com${url.pathname.replace(/^\/id/, "")}`,
    );
  } else if (url.hostname === "tjcorguploads.s3.amazonaws.com") {
    candidates.push(
      `https://tjc.org/id${url.pathname.replace(/^\/tjcorg/, "")}`,
    );
  }
  const budget = new AbortController();
  const deadline = setTimeout(
    () => budget.abort(new Error("Image source deadline exceeded")),
    8_000,
  );
  try {
    for (const candidate of candidates) {
      signal.throwIfAborted();
      if (budget.signal.aborted) return undefined;
      const connection = new AbortController();
      const timer = setTimeout(
        () => connection.abort(new Error("Image connection timed out")),
        3_000,
      );
      try {
        const response = await fetcher(candidate, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept:
              "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            Referer: "https://tjc.org/",
          },
          signal: AbortSignal.any([signal, budget.signal, connection.signal]),
        });
        const type = response.headers.get("content-type") ?? "";
        if (
          response.ok &&
          response.body &&
          (!type ||
            /^image\//i.test(type) ||
            /^application\/octet-stream\b/i.test(type))
        )
          return response;
        await response.body?.cancel();
      } catch {
        signal.throwIfAborted();
      } finally {
        clearTimeout(timer);
      }
    }
    return undefined;
  } finally {
    clearTimeout(deadline);
  }
}
