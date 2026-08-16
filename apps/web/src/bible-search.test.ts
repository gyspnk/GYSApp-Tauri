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
});
