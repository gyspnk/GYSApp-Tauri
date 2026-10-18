import { afterEach, expect, it, vi } from "vitest";
import { fetchLiteratureCatalog } from "./literature.js";

const main =
  '<table id="posts-table-1"><tr><td><a href="https://tjc.org/id/kesaksian/terang/">Terang</a></td></tr></table>';
const books =
  '<table id="table_1"><tr><td><a href="https://tjc.org/id/wp-content/uploads/book.pdf">Buku lengkap</a></td></tr></table>';
afterEach(() => vi.unstubAllGlobals());

it("starts independent catalogue and book requests together", async () => {
  let release!: (response: Response) => void;
  const primary = new Promise<Response>((resolve) => {
    release = resolve;
  });
  const fetcher = vi.fn<typeof fetch>(async (url) =>
    String(url).endsWith("/buku/") ? new Response(books) : primary,
  );
  vi.stubGlobal("fetch", fetcher);
  const pending = fetchLiteratureCatalog();
  try {
    expect(fetcher).toHaveBeenCalledTimes(2);
  } finally {
    release(new Response(main));
    expect((await pending).items.map((item) => item.title)).toEqual([
      "Terang",
      "Buku lengkap",
    ]);
  }
});

it("preserves the primary catalogue when the optional book index is unavailable", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url) =>
      String(url).endsWith("/buku/")
        ? new Response("Unavailable", { status: 503 })
        : new Response(main),
    ),
  );
  expect(
    (await fetchLiteratureCatalog()).items.map((item) => item.title),
  ).toEqual(["Terang"]);
});
