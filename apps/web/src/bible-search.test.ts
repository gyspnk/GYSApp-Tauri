import { describe, expect, it, vi } from "vitest";
import { BibleSearchClient, type BibleSearchWorker } from "./bible-search.js";

const verses = [
  {
    id: "gen-1-1",
    book: "Kejadian",
    bookOrder: 1,
    chapter: 1,
    verse: 1,
    text: "Pada mulanya Allah menciptakan langit dan bumi.",
  },
  {
    id: "joh-3-16",
    book: "Yohanes",
    bookOrder: 43,
    chapter: 3,
    verse: 16,
    text: "Karena begitu besar kasih Allah akan dunia ini.",
  },
];

function fakeWorker(): BibleSearchWorker {
  let cancelled = new Set<number>();
  const worker: BibleSearchWorker = {
    onmessage: null,
    onerror: null,
    postMessage(message) {
      if (message.type === "init") {
        setTimeout(
          () => worker.onmessage?.({ data: { type: "ready" } } as MessageEvent),
          0,
        );
        return;
      }
      if (message.type === "cancel") {
        cancelled.add(message.id);
        return;
      }
      setTimeout(() => {
        if (cancelled.delete(message.id)) return;
        const matches = verses.filter((verse) =>
          verse.text
            .toLocaleLowerCase()
            .includes(message.query.toLocaleLowerCase()),
        );
        worker.onmessage?.({
          data: { type: "result", id: message.id, verses: matches },
        } as MessageEvent);
      }, 5);
    },
    terminate: vi.fn(),
  };
  return worker;
}

describe("BibleSearchClient", () => {
  it("uses the worker boundary and returns ordered matches", async () => {
    const client = new BibleSearchClient(verses, fakeWorker);
    expect(client.backend).toBe("worker");
    await expect(client.search("Allah")).resolves.toMatchObject([
      { id: "gen-1-1" },
      { id: "joh-3-16" },
    ]);
    client.dispose();
  });

  it("forwards the book-name map into the worker index", async () => {
    const received: unknown[] = [];
    const capturingWorker = (): BibleSearchWorker => {
      let cancelled = new Set<number>();
      const worker: BibleSearchWorker = {
        onmessage: null,
        onerror: null,
        postMessage(message) {
          received.push(message);
          if (message.type === "init") {
            setTimeout(
              () =>
                worker.onmessage?.({ data: { type: "ready" } } as MessageEvent),
              0,
            );
            return;
          }
          if (message.type === "cancel") {
            cancelled.add(message.id);
            return;
          }
          setTimeout(() => {
            if (cancelled.delete(message.id)) return;
            worker.onmessage?.({
              data: { type: "result", id: message.id, verses: [] },
            } as MessageEvent);
          }, 0);
        },
        terminate: vi.fn(),
      };
      return worker;
    };
    const client = new BibleSearchClient(verses, capturingWorker, {
      "1": "Kejadian",
      "43": "Yohanes",
    });
    await client.search("Yohanes");
    expect(received[0]).toEqual({
      type: "init",
      verses,
      bookNames: { "1": "Kejadian", "43": "Yohanes" },
    });
    client.dispose();
  });

  it("cancels stale searches without surfacing an error to the reader", async () => {
    const client = new BibleSearchClient(verses, fakeWorker);
    const controller = new AbortController();
    const pending = client.search("Allah", {}, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    client.dispose();
  });
  it("falls back to reference-aware search when worker startup fails", async () => {
    const client = new BibleSearchClient(verses, () => {
      throw new Error("worker unavailable");
    });
    expect(client.backend).toBe("main");
    await expect(client.search("Allah")).resolves.toMatchObject([
      { id: "gen-1-1" },
      { id: "joh-3-16" },
    ]);
    client.dispose();
  });

  it("recovers pending searches when an initialized worker fails", async () => {
    let worker: BibleSearchWorker | undefined;
    const client = new BibleSearchClient(verses, () => {
      worker = {
        onmessage: null,
        onerror: null,
        postMessage() {},
        terminate: vi.fn(),
      };
      return worker;
    });
    const result = client.search("kasih");
    worker?.onerror?.({ message: "worker failed" } as ErrorEvent);
    await expect(result).resolves.toMatchObject([{ id: "joh-3-16" }]);
    expect(worker?.terminate).toHaveBeenCalledTimes(1);
    client.dispose();
  });
});

it("a reader can display and cancel without cloning the Bible into a search worker", async () => {
  const factory = vi.fn(fakeWorker);
  const client = new BibleSearchClient(verses, factory, undefined, true);
  expect(client.backend).toBe("pending");
  expect(factory).not.toHaveBeenCalled();
  const controller = new AbortController();
  controller.abort();
  await expect(
    client.search("Allah", {}, controller.signal),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(factory).not.toHaveBeenCalled();
  await expect(client.search("Allah")).resolves.toHaveLength(2);
  await client.search("kasih");
  expect(factory).toHaveBeenCalledOnce();
  client.dispose();
});
