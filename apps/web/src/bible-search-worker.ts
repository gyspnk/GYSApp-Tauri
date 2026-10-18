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
type SearchJob = { timer: ReturnType<typeof setTimeout> };
const jobs = new Map<number, SearchJob>();

function cancelSearch(id: number): void {
  const job = jobs.get(id);
  if (!job) return;
  clearTimeout(job.timer);
  jobs.delete(id);
}

function send(message: WorkerResponse): void {
  worker.postMessage(message);
}

worker.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  if (message.type === "init") {
    for (const id of jobs.keys()) cancelSearch(id);
    repository = new BibleRepository(
      message.verses,
      message.bookNames ? { bookNames: message.bookNames } : {},
    );
    send({ type: "ready" });
    return;
  }
  if (message.type === "cancel") {
    cancelSearch(message.id);
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
  const currentRepository = repository;
  cancelSearch(message.id);
  // Yield to queued cancellation/init messages before scanning the verse index.
  const job: SearchJob = {
    timer: setTimeout(() => {
      void currentRepository
        .search(message.query, message.options)
        .then((verses) => {
          if (jobs.get(message.id) !== job) return;
          jobs.delete(message.id);
          send({ type: "result", id: message.id, verses });
        })
        .catch((error: unknown) => {
          if (jobs.get(message.id) !== job) return;
          jobs.delete(message.id);
          send({
            type: "error",
            id: message.id,
            message:
              error instanceof Error ? error.message : "Pencarian gagal.",
          });
        });
    }, 0),
  };
  jobs.set(message.id, job);
};
