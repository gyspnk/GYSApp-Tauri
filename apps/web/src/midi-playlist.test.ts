import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("MIDI playlist backup recovery", () => {
  const values = new Map<string, string>();
  let restore: { result: unknown; onsuccess: () => void } | undefined;
  const getItem = vi.fn((key: string) => values.get(key) ?? null);
  const setItem = vi.fn((key: string, value: string) => {
    values.set(key, value);
  });

  beforeEach(() => {
    vi.resetModules();
    values.clear();
    restore = undefined;
    getItem.mockReset().mockImplementation((key) => values.get(key) ?? null);
    setItem.mockReset().mockImplementation((key, value) => {
      values.set(key, value);
    });
    vi.stubGlobal("window", new EventTarget());
    vi.stubGlobal("localStorage", {
      getItem,
      setItem,
      removeItem: (key: string) => values.delete(key),
    });
    const db = {
      close: vi.fn(),
      objectStoreNames: { contains: () => true },
      transaction: () => ({
        objectStore: () => ({
          get: () => {
            restore = { result: undefined, onsuccess: () => undefined };
            return restore;
          },
          put: vi.fn(),
        }),
      }),
    };
    vi.stubGlobal("indexedDB", {
      open: () => {
        const request = { result: db, onsuccess: () => undefined };
        queueMicrotask(() => request.onsuccess());
        return request;
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  async function open() {
    const queue = await import("./midi-playlist.js");
    const empty = queue.getMidiPlaylist();
    await vi.waitFor(() => expect(restore).toBeDefined());
    const backup = {
      ...empty,
      items: [{ songId: "hymn-001", title: "Backup hymn" }],
      currentIndex: 0,
    };
    return {
      queue,
      finish: () => {
        restore!.result = backup;
        restore!.onsuccess();
      },
    };
  }

  it("restores a backup when browser preferences were evicted", async () => {
    const { queue, finish } = await open();
    finish();
    await vi.waitFor(() =>
      expect(queue.getMidiPlaylist().items[0]?.songId).toBe("hymn-001"),
    );
    expect(
      JSON.parse(values.get("gys-midi-playlist-v1")!).items[0].songId,
    ).toBe("hymn-001");
  });

  it("retains newly added songs when an older backup arrives late", async () => {
    const { queue, finish } = await open();
    queue.addMidiPlaylistItem({ songId: "hymn-002", title: "New hymn" });
    finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(queue.getMidiPlaylist().items.map((item) => item.songId)).toEqual([
      "hymn-002",
    ]);
    expect(
      JSON.parse(values.get("gys-midi-playlist-v1")!).items[0].songId,
    ).toBe("hymn-002");
  });

  it("uses the backup in memory when localStorage is blocked", async () => {
    getItem.mockImplementation(() => {
      throw new Error("blocked");
    });
    setItem.mockImplementation(() => {
      throw new Error("blocked");
    });
    const { queue, finish } = await open();
    finish();
    await vi.waitFor(() =>
      expect(queue.getMidiPlaylist().items[0]?.songId).toBe("hymn-001"),
    );
    expect(
      queue.addMidiPlaylistItem({ songId: "hymn-002", title: "New hymn" }),
    ).toBe(true);
    expect(queue.getMidiPlaylist().items).toHaveLength(2);
  });

  it("updates the live queue for another tab without rewriting storage or reviving an older backup", async () => {
    const { queue, finish } = await open();
    const listener = vi.fn();
    const unsubscribe = queue.subscribeMidiPlaylist(listener);
    const external = {
      ...queue.getMidiPlaylist(),
      items: [{ songId: "hymn-003", title: "Another tab" }],
      currentIndex: 0,
    };
    const event = new Event("storage");
    Object.assign(event, {
      key: "gys-midi-playlist-v1",
      newValue: JSON.stringify(external),
      storageArea: localStorage,
    });
    window.dispatchEvent(event);
    finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(queue.getMidiPlaylist().items).toEqual(external.items);
    expect(listener).toHaveBeenCalledOnce();
    expect(setItem).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("ignores unrelated and invalid storage messages, and clears the queue when the saved queue is removed", async () => {
    const { queue } = await open();
    queue.addMidiPlaylistItem({ songId: "hymn-005", title: "Saved" });
    const listener = vi.fn();
    const unsubscribe = queue.subscribeMidiPlaylist(listener);
    const send = (key: string, newValue: string | null) => {
      const event = new Event("storage");
      Object.assign(event, { key, newValue, storageArea: localStorage });
      window.dispatchEvent(event);
    };
    send("gys-shell-settings-v1", "{}");
    send("gys-midi-playlist-v1", "invalid");
    expect(queue.getMidiPlaylist().items).toHaveLength(1);
    expect(listener).not.toHaveBeenCalled();
    send("gys-midi-playlist-v1", null);
    expect(queue.getMidiPlaylist().items).toEqual([]);
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });
});
