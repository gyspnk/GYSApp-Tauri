import {
  MidiPlaylistSchema,
  type MidiPlaylist,
  type MidiPlaylistItem,
} from "@gys/contracts";

export class MidiPlaylistController {
  private state: MidiPlaylist = MidiPlaylistSchema.parse({
    version: 1,
    items: [],
  });

  public snapshot(): MidiPlaylist {
    return {
      ...this.state,
      items: this.state.items.map((item) => ({ ...item })),
    };
  }

  public add(item: MidiPlaylistItem, index = this.state.items.length): void {
    if (this.state.items.some((current) => current.songId === item.songId))
      return;
    const items = [...this.state.items];
    items.splice(Math.max(0, Math.min(items.length, index)), 0, { ...item });
    this.state = { ...this.state, items };
  }

  public remove(songId: string): void {
    const index = this.state.items.findIndex((item) => item.songId === songId);
    if (index < 0) return;
    const items = this.state.items.filter((item) => item.songId !== songId);
    const currentIndex =
      items.length === 0
        ? 0
        : Math.min(
            this.state.currentIndex - (index < this.state.currentIndex ? 1 : 0),
            items.length - 1,
          );
    this.state = {
      ...this.state,
      items,
      currentIndex: Math.max(0, currentIndex),
    };
  }

  public reorder(from: number, to: number): void {
    if (
      from < 0 ||
      from >= this.state.items.length ||
      to < 0 ||
      to >= this.state.items.length
    )
      return;
    const items = [...this.state.items];
    const [item] = items.splice(from, 1);
    if (!item) return;
    items.splice(to, 0, item);
    let currentIndex = this.state.currentIndex;
    if (currentIndex === from) currentIndex = to;
    else if (from < currentIndex && to >= currentIndex) currentIndex -= 1;
    else if (from > currentIndex && to <= currentIndex) currentIndex += 1;
    this.state = { ...this.state, items, currentIndex };
  }

  public select(index: number): void {
    if (index < 0 || index >= this.state.items.length) return;
    this.state = { ...this.state, currentIndex: index };
  }

  public setOptions(
    options: Partial<Omit<MidiPlaylist, "version" | "items" | "currentIndex">>,
  ): void {
    this.state = MidiPlaylistSchema.parse({ ...this.state, ...options });
  }

  public current(): MidiPlaylistItem | undefined {
    return this.state.items[this.state.currentIndex];
  }

  public next(random = Math.random()): MidiPlaylistItem | undefined {
    if (this.state.items.length === 0) return undefined;
    if (this.state.loop === "one") return this.current();
    if (this.state.shuffle) {
      const index = Math.min(
        this.state.items.length - 1,
        Math.floor(random * this.state.items.length),
      );
      this.select(index);
      return this.current();
    }
    const nextIndex = this.state.currentIndex + 1;
    if (nextIndex < this.state.items.length) {
      this.select(nextIndex);
      return this.current();
    }
    if (this.state.loop === "all") {
      this.select(0);
      return this.current();
    }
    return undefined;
  }

  public previous(): MidiPlaylistItem | undefined {
    if (this.state.items.length === 0) return undefined;
    const previousIndex = this.state.currentIndex - 1;
    if (previousIndex >= 0) {
      this.select(previousIndex);
      return this.current();
    }
    if (this.state.loop === "all") {
      this.select(this.state.items.length - 1);
      return this.current();
    }
    return undefined;
  }

  public export(): string {
    return JSON.stringify(this.state);
  }

  public import(serialized: string): void {
    const parsed: unknown = JSON.parse(serialized);
    this.state = MidiPlaylistSchema.parse(parsed);
  }
}
