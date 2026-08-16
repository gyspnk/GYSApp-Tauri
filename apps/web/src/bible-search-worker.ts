import {
  BibleRepository,
  type BibleSearchOptions,
  type BibleVerse,
} from "@gys/domain";

type WorkerRequest =
  | { type: "init"; verses: BibleVerse[]; bookNames?: Record<string, string> }
  | {
      type: "search";
      id: number;
      query: string;
      options: BibleSearchOptions;
    }
  | { type: "cancel"; id: number };

type WorkerResponse =
  | { type: "ready" }
  | { type: "result"; id: number; verses: BibleVerse[] }
  | { type: "error"; id: number; message: string };

type WorkerScope = {
  postMessage: (message: WorkerResponse) => void;
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
};

const worker = self as unknown as WorkerScope;
let repository: BibleRepository | undefined;
const cancelled = new Set<number>();

function send(message: WorkerResponse): void {
  worker.postMessage(message);
}

worker.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  if (message.type === "init") {
    repository = new BibleRepository(
      message.verses,
      message.bookNames ? { bookNames: message.bookNames } : {},
    );
    cancelled.clear();
    send({ type: "ready" });
    return;
  }
  if (message.type === "cancel") {
    cancelled.add(message.id);
    return;
  }
  if (!repository) {
    send({
      type: "error",
      id: message.id,
      message: "Indeks Alkitab belum siap.",
    });
    return;
  }
  void repository
    .search(message.query, message.options)
    .then((verses) => {
      if (cancelled.delete(message.id)) return;
      send({ type: "result", id: message.id, verses });
    })
    .catch((error: unknown) => {
      if (cancelled.delete(message.id)) return;
      send({
        type: "error",
        id: message.id,
        message: error instanceof Error ? error.message : "Pencarian gagal.",
      });
    });
};
