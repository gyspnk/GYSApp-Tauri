import type { SuaraSejatiPost } from "@gys/contracts";

export type SuaraSort = "recent" | "oldest" | "title";

const timestamp = (post: SuaraSejatiPost) => Date.parse(post.publishedAt) || 0;

/**
 * The feed already arrives newest first, but a reader who is looking for one
 * testimony may want it the other way round. Sorting here keeps the feed cache
 * untouched, so changing the order never refetches.
 */
export function sortSuaraPosts(
  posts: readonly SuaraSejatiPost[],
  sort: SuaraSort,
): SuaraSejatiPost[] {
  const ordered = [...posts];
  if (sort === "oldest") ordered.sort((a, b) => timestamp(a) - timestamp(b));
  else if (sort === "title")
    ordered.sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
    );
  else ordered.sort((a, b) => timestamp(b) - timestamp(a));
  return ordered;
}
