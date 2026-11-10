import { describe, expect, it } from "vitest";
import type { SuaraSejatiPost } from "@gys/contracts";
import { sortSuaraPosts } from "./suara-sort.js";

const post = (
  id: string,
  title: string,
  publishedAt: string,
): SuaraSejatiPost => ({
  id,
  title,
  excerpt: `${title} excerpt`,
  url: `https://suara-sejati.example/${id}`,
  publishedAt,
  source: "tjc.org",
});

const posts = [
  post("b", "Pemulihan", "2025-02-10T00:00:00Z"),
  post("c", "Anugerah", "2025-01-05T00:00:00Z"),
  post("a", "Kesaksian", "2025-03-20T00:00:00Z"),
];

describe("sortSuaraPosts", () => {
  it("puts the newest testimony first by default", () => {
    expect(sortSuaraPosts(posts, "recent").map((item) => item.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("can walk the archive from the other end", () => {
    expect(sortSuaraPosts(posts, "oldest").map((item) => item.id)).toEqual([
      "c",
      "b",
      "a",
    ]);
  });

  it("orders by title without regard to case", () => {
    expect(sortSuaraPosts(posts, "title").map((item) => item.title)).toEqual([
      "Anugerah",
      "Kesaksian",
      "Pemulihan",
    ]);
  });

  it("never mutates the feed array the cache handed over", () => {
    const source = [...posts];
    sortSuaraPosts(source, "oldest");
    expect(source.map((item) => item.id)).toEqual(["b", "c", "a"]);
  });

  it("keeps an unparsable date at the end instead of throwing", () => {
    const broken = post("d", "Tanpa tanggal", "not-a-date");
    expect(sortSuaraPosts([broken, ...posts], "recent").at(-1)?.id).toBe("d");
  });
});
