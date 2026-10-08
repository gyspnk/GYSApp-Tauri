/** Stream public PDFs: bound connection waits, never time out a large body. */
export async function fetchOfficialPdf(
  url: URL,
  range: string | undefined,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<Response | undefined> {
  const candidates = [url.href];
  if (
    ["tjc.org", "www.tjc.org"].includes(url.hostname) &&
    url.pathname.includes("wp-content/uploads/")
  ) {
    candidates.unshift(
      `https://tjcorguploads.s3.amazonaws.com/tjcorg${url.pathname.replace(/^\/id/, "")}`,
    );
  } else if (url.hostname === "tjcorguploads.s3.amazonaws.com") {
    candidates.push(
      `https://tjc.org/id${url.pathname.replace(/^\/tjcorg/, "")}`,
    );
  }
  for (const candidate of candidates) {
    signal.throwIfAborted();
    const connection = new AbortController();
    const timer = setTimeout(
      () => connection.abort(new Error("PDF connection timed out")),
      8_000,
    );
    try {
      const response = await fetcher(candidate, {
        headers: { accept: "application/pdf", ...(range ? { range } : {}) },
        signal: AbortSignal.any([signal, connection.signal]),
      });
      if (
        response.ok &&
        !/text\/html/i.test(response.headers.get("content-type") ?? "")
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
}
